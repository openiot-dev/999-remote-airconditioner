import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

import {
  ALLOWED_EMAIL_DOMAIN,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  STATE_COOKIE,
  readAuthConfig,
  type AuthConfig,
} from '@/lib/auth/config'
import { originOf, redirectUriOf, safeNext } from '@/lib/auth/request'
import { createSession, verify } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type IdTokenClaims = {
  aud?: string
  iss?: string
  exp?: number
  token_use?: string
  email?: string
  email_verified?: boolean | string
}

export async function GET(request: Request) {
  const origin = originOf(request.headers)
  const url = new URL(request.url)

  const authConfig = readAuthConfig()
  if (!authConfig) return fail(origin, 'config')

  if (url.searchParams.get('error')) return fail(origin, 'oauth')

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (!code || !state) return fail(origin, 'oauth')

  const stateCookie = (await cookies()).get(STATE_COOKIE)?.value
  if (!stateCookie) return fail(origin, 'state')

  const stateRaw = await verify(stateCookie, authConfig.sessionSecret)
  if (!stateRaw) return fail(origin, 'state')

  let nonce: string
  let next: string
  try {
    const parsed = JSON.parse(stateRaw) as { nonce?: string; next?: string }
    if (typeof parsed.nonce !== 'string') return fail(origin, 'state')
    nonce = parsed.nonce
    next = safeNext(parsed.next)
  } catch {
    return fail(origin, 'state')
  }

  if (nonce !== state) return fail(origin, 'state')

  const exchanged = await exchangeCode(code, redirectUriOf(request.headers), authConfig)
  if (!exchanged) return fail(origin, 'token')

  const { claims, refreshToken } = exchanged

  /**
   * id_token 은 우리 서버가 Cognito 토큰 창구에 HTTPS 로 직접 받아 온 것이라
   * 서명을 다시 보지 않습니다. 대신 aud, iss, exp 는 반드시 봅니다.
   */
  if (claims.aud !== authConfig.clientId) return fail(origin, 'token')
  if (claims.iss !== authConfig.issuer) return fail(origin, 'token')
  if (claims.token_use !== 'id') return fail(origin, 'token')
  if (typeof claims.exp !== 'number' || claims.exp <= Math.floor(Date.now() / 1000)) {
    return fail(origin, 'token')
  }

  const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : ''
  if (!email) return fail(origin, 'token')

  // 매핑이 빠지면 페더레이션 사용자가 전부 false 로 들어와 전원이 로그인에 실패합니다.
  if (claims.email_verified !== true && claims.email_verified !== 'true') {
    return fail(origin, 'unverified', email)
  }

  // 앱 단계 도메인 검사(8.13). PreSignUp Lambda 와 합쳐 두 겹입니다.
  // hd 클레임은 경계가 아니라 계정 선택 화면을 좁히는 힌트일 뿐이라 여기서 보지 않습니다.
  if (!email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    return fail(origin, 'domain', email)
  }

  const response = NextResponse.redirect(new URL(next, origin))

  // 세션과 갱신 토큰은 SameSite=None 입니다. lax 면 노션 틀 안에서 화면을 열 때 브라우저가
  // 쿠키를 빼고 보내서, 팝업으로 로그인을 마쳐도 틀은 계속 로그인 화면에 머뭅니다.
  // 대신 다른 사이트의 쓰기 요청은 미들웨어와 로그아웃이 isCrossSiteWrite 로 막습니다.
  response.cookies.set(SESSION_COOKIE, await createSession(email, authConfig.sessionSecret, SESSION_TTL_SECONDS), {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: SESSION_TTL_SECONDS,
  })
  response.cookies.set(STATE_COOKIE, '', { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 0 })

  // 백엔드를 부를 때 쓸 갱신 토큰. 없으면 로그인은 되지만 API 호출만 401 이 됩니다.
  // 앱 클라이언트에 ALLOW_REFRESH_TOKEN_AUTH 가 없으면 여기로 오지 않습니다(cognito.tf).
  if (refreshToken) {
    response.cookies.set(REFRESH_COOKIE, refreshToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: REFRESH_TTL_SECONDS,
    })
  }

  return response
}

type ExchangeResult = { claims: IdTokenClaims; refreshToken: string | null }

async function exchangeCode(
  code: string,
  redirectUri: string,
  authConfig: AuthConfig,
): Promise<ExchangeResult | null> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: authConfig.clientId,
    code,
    redirect_uri: redirectUri,
  })

  const response = await fetch(`https://${authConfig.domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      // 토큰 창구는 클라이언트 비밀을 Basic 으로 받습니다. 본문에 넣으면 400 입니다.
      authorization: `Basic ${btoa(`${authConfig.clientId}:${authConfig.clientSecret}`)}`,
    },
    body,
    cache: 'no-store',
  })

  if (!response.ok) return null

  const payload = (await response.json()) as { id_token?: string; refresh_token?: string }
  if (!payload.id_token) return null

  const claims = decodeJwtPayload(payload.id_token)
  if (!claims) return null

  // id_token 문자열 자체는 쿠키에 담지 않고 버립니다. 갱신 토큰과 합치면 4KB 를 넘어
  // 브라우저가 쿠키를 통째로 버립니다. 필요할 때 lib/auth/tokens.ts 가 새로 받아 옵니다.
  return { claims, refreshToken: payload.refresh_token ?? null }
}

function decodeJwtPayload(token: string): IdTokenClaims | null {
  const part = token.split('.')[1]
  if (!part) return null

  try {
    const padded = part.replace(/-/g, '+').replace(/_/g, '/')
    const json = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
    // atob 는 바이트를 주므로 UTF-8 로 다시 읽습니다.
    const bytes = Uint8Array.from(json, (character) => character.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes)) as IdTokenClaims
  } catch {
    return null
  }
}

function fail(origin: string, reason: string, email?: string) {
  const login = new URL('/login', origin)
  login.searchParams.set('error', reason)
  // 도메인이 안 맞아 막을 때는 어느 계정으로 들어왔는지 함께 보여줍니다.
  if (email) login.searchParams.set('email', email)
  return NextResponse.redirect(login)
}
