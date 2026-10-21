/**
 * 브라우저 쪽 로그인. 인가 코드 + PKCE 흐름입니다.
 *
 * 토큰을 어디에 두는가 (이 파일에서 가장 중요한 결정입니다)
 *
 *   ID 토큰    메모리에만 둡니다. 새로고침하면 사라집니다.
 *   갱신 토큰  sessionStorage 에 둡니다. 탭을 닫으면 지워지고, 다른 탭이나 다른 기기로
 *              넘어가지 않으며, 요청에 자동으로 실려 나가지도 않습니다.
 *
 * 왜 이렇게 나눴는가
 *   - 둘 다 메모리에 두면 새로고침할 때마다 Cognito 로 튕겼다 돌아옵니다. 화면이 깜빡입니다.
 *   - 둘 다 저장소에 두면 XSS 한 번에 15분짜리와 1일짜리가 같이 샙니다.
 *   - 관리자 콘솔도 같은 방식입니다. 거기는 쿠키에 갱신 토큰만 담고 ID 토큰은 서버가
 *     그때그때 받아 씁니다. 두 앱의 구조를 같게 두면 한쪽을 고칠 때 다른 쪽도 보입니다.
 *
 * 더 엄격하게 가려면 readRefreshToken/writeRefreshToken 을 모듈 변수로 바꾸면 됩니다.
 * 그러면 새로고침마다 beginLogin() 을 다시 불러야 합니다.
 *
 * 쿠키를 쓰지 않는 이유: 이 앱은 브라우저가 직접 API 를 부릅니다. 서버가 세션을 들고
 * 있을 자리가 없고, 쿠키에 담아 봐야 API Gateway 는 Authorization 헤더만 봅니다.
 */

import type { AuthConfig } from './config'
import { randomToken, s256Challenge } from './pkce'

const VERIFIER_KEY = 'oi_pkce_verifier'
const STATE_KEY = 'oi_pkce_state'
const NEXT_KEY = 'oi_after_login'
const REFRESH_KEY = 'oi_refresh'
const POPUP_KEY = 'oi_popup_login'

/** 노션 틀 안에서 누른 로그인이 여는 팝업의 첫 화면(app/auth/popup/page.tsx). */
const POPUP_PATH = '/auth/popup'
/** 팝업이 틀에게 토큰을 건넬 때 쓰는 메시지 이름. */
const POPUP_MESSAGE = 'oi-login-tokens'

/** 만료 직전에 미리 갱신합니다. 호출 도중에 만료되는 것을 피합니다. */
const RENEW_MARGIN_SECONDS = 60

let idToken: string | null = null
let idTokenExpiresAt = 0

/** 진행 중인 갱신. 화면이 API 를 여러 개 동시에 불러도 Cognito 에는 한 번만 갑니다. */
let refreshing: Promise<string | null> | null = null

export type Claims = {
  sub?: string
  email?: string
  exp?: number
  token_use?: string
}

export function redirectUri(): string {
  return `${window.location.origin}/auth/callback`
}

/**
 * 로그인을 시작합니다. 돌아올 주소를 남겨 두고 Cognito 로 보냅니다.
 * identity_provider 를 넘겨 Cognito 자체 로그인 화면을 건너뛰고 구글 계정 선택 창으로 갑니다.
 */
export async function beginLogin(config: AuthConfig, next = '/'): Promise<void> {
  const verifier = randomToken()
  const state = randomToken(16)

  sessionStorage.setItem(VERIFIER_KEY, verifier)
  sessionStorage.setItem(STATE_KEY, state)
  sessionStorage.setItem(NEXT_KEY, next.startsWith('/') ? next : '/')

  const url = new URL(`${config.domain}/oauth2/authorize`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', redirectUri())
  url.searchParams.set('scope', 'openid email')
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', await s256Challenge(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('identity_provider', 'Google')

  window.location.assign(url.toString())
}

/**
 * 노션 같은 다른 사이트 안에 끼워 넣어 띄웠는지(iframe).
 *
 * 그렇다면 beginLogin 을 부르지 말고 loginInPopup 을 부릅니다. 구글 로그인 화면은
 * 남의 화면 안에 들어가기를 거부해서, 틀 안에서 Cognito 로 보내면 구글 403 화면만 뜹니다.
 */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // 다른 출처의 틀 안이면 window.top 을 읽다가 막힐 수 있습니다. 그것도 끼워 넣어진 것입니다.
    return true
  }
}

export type PopupLoginResult = 'ok' | 'blocked' | 'cancelled'

/**
 * 팝업 창에서 로그인하고, 받은 토큰을 이 틀에 넣습니다.
 *
 * 팝업과 틀은 같은 출처여도 sessionStorage 를 같이 쓰지 않습니다. 브라우저가 저장소를
 * 맨 바깥 사이트(노션 대 우리 앱)별로 나누기 때문입니다. 그래서 팝업이 로그인을 마치면
 * 토큰을 postMessage 로 건네고(handOffToOpener), 틀이 자기 저장소에 다시 담습니다.
 *
 * 클릭 처리기 안에서 바로 불러야 합니다. 앞에 await 를 두면 브라우저가 팝업을 막습니다.
 */
export function loginInPopup(): Promise<PopupLoginResult> {
  const popup = window.open(POPUP_PATH, 'oi-login', 'popup,width=480,height=680')
  if (!popup) return Promise.resolve('blocked')

  return new Promise((resolve) => {
    // 로그인하지 않고 팝업을 닫았을 때 기다림을 끝냅니다.
    const timer = window.setInterval(() => {
      if (popup.closed) finish('cancelled')
    }, 500)

    function onMessage(event: MessageEvent) {
      // 우리 출처에서, 우리가 연 팝업이 보낸 것만 받습니다.
      if (event.origin !== window.location.origin || event.source !== popup) return

      const data = event.data as { type?: unknown; idToken?: unknown; refreshToken?: unknown } | null
      if (data?.type !== POPUP_MESSAGE || typeof data.idToken !== 'string') return

      try {
        remember(data.idToken, typeof data.refreshToken === 'string' ? data.refreshToken : null)
        finish('ok')
      } catch {
        finish('cancelled')
      }
    }

    function finish(result: PopupLoginResult) {
      window.clearInterval(timer)
      window.removeEventListener('message', onMessage)
      resolve(result)
    }

    window.addEventListener('message', onMessage)
  })
}

/** 팝업의 첫 화면이 부릅니다. 콜백이 토큰을 틀에 건네도록 표시해 두고 로그인을 시작합니다. */
export async function beginPopupLogin(config: AuthConfig): Promise<void> {
  sessionStorage.setItem(POPUP_KEY, '1')
  await beginLogin(config, '/')
}

/**
 * 콜백 화면이 completeLogin 뒤에 부릅니다. 팝업 로그인이었으면 토큰을 연 틀에 건네고 true 입니다.
 * 건넨 토큰은 팝업 쪽에서 지웁니다. 같은 토큰이 두 곳에 남아 있을 이유가 없습니다.
 *
 * 틀이 사라졌으면(노션 탭을 닫았으면) false 이고, 팝업이 그대로 로그인된 화면으로 갑니다.
 */
export function handOffToOpener(): boolean {
  const wasPopup = sessionStorage.getItem(POPUP_KEY) !== null
  sessionStorage.removeItem(POPUP_KEY)

  const opener = window.opener as Window | null
  if (!wasPopup || !opener || !idToken) return false

  // 받는 쪽을 우리 출처로 못 박습니다. 팝업을 연 창이 다른 곳으로 가 있으면 토큰은 버려집니다.
  opener.postMessage(
    { type: POPUP_MESSAGE, idToken, refreshToken: sessionStorage.getItem(REFRESH_KEY) },
    window.location.origin,
  )
  forget()
  return true
}

export class LoginError extends Error {
  constructor(public reason: 'config' | 'oauth' | 'state' | 'token') {
    super(reason)
    this.name = 'LoginError'
  }
}

/**
 * 그물망이 끊기거나 Cognito 가 잠깐 막은 것. **로그인이 풀린 것이 아닙니다.**
 *
 * 이 둘을 구분하지 않으면, 요청이 많아 429 를 한 번 받았을 뿐인데 갱신 토큰을 지워
 * 사람을 진짜로 로그아웃시킵니다. 이 템플릿으로 만든 툴(999-new-test-tool)에서 실제로
 * 그렇게 "자꾸 로그인이 풀려요" 신고가 들어왔습니다.
 */
export class TransientAuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TransientAuthError'
  }
}

/**
 * 콜백 화면에서 부릅니다. 주소창의 code 를 토큰으로 바꾸고, 로그인 전에 보던 주소를 돌려줍니다.
 * 성공하든 실패하든 임시 값은 지웁니다. 남겨 두면 다음 시도가 옛 state 로 실패합니다.
 */
export async function completeLogin(config: AuthConfig, search: string): Promise<string> {
  const params = new URLSearchParams(search)

  const savedVerifier = sessionStorage.getItem(VERIFIER_KEY)
  const savedState = sessionStorage.getItem(STATE_KEY)
  const next = sessionStorage.getItem(NEXT_KEY) ?? '/'

  sessionStorage.removeItem(VERIFIER_KEY)
  sessionStorage.removeItem(STATE_KEY)
  sessionStorage.removeItem(NEXT_KEY)

  if (params.get('error')) throw new LoginError('oauth')

  const code = params.get('code')
  const state = params.get('state')
  if (!code || !state) throw new LoginError('oauth')

  // state 를 먼저 봅니다. 남이 시작시킨 로그인을 여기서 자릅니다(CSRF).
  if (!savedState || !savedVerifier || state !== savedState) throw new LoginError('state')

  const tokens = await exchange(config, {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri(),
    code_verifier: savedVerifier,
  })

  if (!tokens.id_token) throw new LoginError('token')

  remember(tokens.id_token, tokens.refresh_token)
  return next
}

/**
 * API 를 부를 때마다 이것을 씁니다. 메모리에 살아 있으면 그대로,
 * 만료가 가까우면 갱신 토큰으로 새로 받습니다. 둘 다 없으면 null 입니다(로그인 필요).
 */
export async function getIdToken(config: AuthConfig): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  if (idToken && idTokenExpiresAt - RENEW_MARGIN_SECONDS > now) return idToken

  const refreshToken = sessionStorage.getItem(REFRESH_KEY)
  if (!refreshToken) return null

  // 이미 갱신 중이면 그 결과를 같이 기다립니다.
  if (!refreshing) {
    refreshing = refresh(config, refreshToken).finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

/**
 * 갱신 토큰으로 새 ID 토큰을 받습니다.
 *
 * 토큰을 지우는 것은 Cognito 가 "이 갱신 토큰은 못 쓴다"(400) 고 답했을 때뿐입니다.
 * 그물망 문제나 429, 5xx 는 TransientAuthError 로 올려 보내고 토큰은 그대로 둡니다.
 * 잠깐 막힌 것 때문에 사람을 로그아웃시키지 않습니다.
 */
async function refresh(config: AuthConfig, refreshToken: string): Promise<string | null> {
  try {
    const tokens = await exchange(config, {
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    })
    // 갱신 응답에는 새 갱신 토큰이 오지 않습니다. 쓰던 것을 그대로 둡니다.
    if (!tokens.id_token) throw new LoginError('token')
    remember(tokens.id_token, null)
    return idToken
  } catch (err) {
    if (err instanceof TransientAuthError) throw err
    // 갱신 토큰이 만료됐거나 취소됐습니다. 이때만 지우고 로그인부터 다시 하게 둡니다.
    forget()
    return null
  }
}

/** 지금 로그인된 사람. 토큰이 없으면 null 입니다. */
export async function currentClaims(config: AuthConfig): Promise<Claims | null> {
  const token = await getIdToken(config)
  return token ? decodeJwtPayload(token) : null
}

/** 로컬 상태를 지우고 Cognito 쪽 세션도 끊습니다. 둘 중 하나만 하면 다시 눌렀을 때 그냥 들어와집니다. */
export function logout(config: AuthConfig): void {
  forget()
  const url = new URL(`${config.domain}/logout`)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('logout_uri', window.location.origin)
  window.location.assign(url.toString())
}

// ── 안쪽 ──────────────────────────────────────────────────────────────────────

type TokenResponse = { id_token?: string; refresh_token?: string }

async function exchange(config: AuthConfig, body: Record<string, string>): Promise<TokenResponse> {
  let response: Response
  try {
    // 공개 클라이언트라 Authorization 헤더를 붙이지 않습니다. 붙이면 400 입니다.
    response = await fetch(`${config.domain}/oauth2/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
      cache: 'no-store',
    })
  } catch {
    throw new TransientAuthError('토큰 창구에 닿지 못했습니다')
  }

  // 400 은 invalid_grant 같은 "이 토큰/코드는 못 쓴다" 는 답입니다. 다시 해도 안 됩니다.
  if (response.status === 400) throw new LoginError('token')
  // 429, 5xx 는 잠깐 막힌 것입니다. 나중에 다시 하면 됩니다.
  if (!response.ok) throw new TransientAuthError(`토큰 창구가 ${response.status} 로 답했습니다`)

  return (await response.json()) as TokenResponse
}

function remember(nextIdToken: string, nextRefreshToken: string | null | undefined): void {
  const claims = decodeJwtPayload(nextIdToken)
  if (!claims?.exp) throw new LoginError('token')

  idToken = nextIdToken
  idTokenExpiresAt = claims.exp

  if (nextRefreshToken) sessionStorage.setItem(REFRESH_KEY, nextRefreshToken)
}

function forget(): void {
  idToken = null
  idTokenExpiresAt = 0
  sessionStorage.removeItem(REFRESH_KEY)
}

/**
 * 서명은 보지 않습니다. 이 토큰은 우리가 Cognito 토큰 창구에 HTTPS 로 직접 받아 온 것이고,
 * 실제 검증은 API Gateway 의 JWT authorizer 가 합니다. 여기서는 화면에 이름을 띄우려고 풉니다.
 */
function decodeJwtPayload(token: string): Claims | null {
  const part = token.split('.')[1]
  if (!part) return null

  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as Claims
  } catch {
    return null
  }
}
