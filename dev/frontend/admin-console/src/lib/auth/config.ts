/**
 * 사내 공용 Cognito 사용자 풀을 거친 구글 로그인 설정.
 *
 * COGNITO_DOMAIN / COGNITO_ISSUER 는 모든 사내 프로젝트가 같은 값을 씁니다.
 * 프로젝트마다 새로 받는 것은 앱 클라이언트 ID 와 비밀뿐입니다.
 *
 * 이 파일은 미들웨어(Edge 런타임)에서도 import 되므로 node: 모듈을 쓰지 않습니다.
 */

/** 허용 도메인. 앱 단계 도메인 검사(8.13)의 기준입니다. */
export const ALLOWED_EMAIL_DOMAIN = 'openiot.app'

/** __Host- 접두사: 브라우저가 도메인 고정과 Secure 를 강제합니다. */
export const SESSION_COOKIE = '__Host-oi_session'
export const STATE_COOKIE = '__Host-oi_oauth_state'

/**
 * 백엔드를 부르려면 Cognito 토큰이 필요한데, 세션 쿠키에는 서명된 이메일만 들어 있습니다.
 * 그래서 갱신 토큰을 따로 담고, 서버가 필요할 때마다 ID 토큰으로 바꿔 씁니다.
 *
 * **ID 토큰을 여기 같이 담지 마십시오.** 갱신 토큰과 합치면 4KB 를 넘고, 브라우저는
 * 한도를 넘은 쿠키를 오류 없이 통째로 버립니다. 로그인은 성공하고 화면도 뜨는데
 * 자료만 안 보이는 상태가 되어 원인을 찾는 데 오래 걸립니다.
 */
export const REFRESH_COOKIE = '__Host-oi_refresh'

/**
 * Cognito 갱신 토큰 수명과 맞춥니다(cognito.tf 의 refresh_token_validity = 1일).
 * 세션 쿠키가 먼저 만료되므로 실제 차단 창을 정하는 것은 이 값이 아니라 SESSION_TTL_SECONDS 입니다.
 */
export const REFRESH_TTL_SECONDS = 24 * 60 * 60

/**
 * API Gateway 주소. terraform output 의 api_base_url 입니다.
 * 비어 있으면 API 호출만 꺼지고 로그인은 그대로 됩니다.
 *
 * 이 이름을 바꾸거나 다른 서버 환경변수를 더하면 amplify.yml 의 추리기 목록에도 넣어야 합니다.
 * 빠뜨리면 로컬에서는 되고 배포본에서만 값이 비어 있습니다.
 */
export const API_BASE_URL = (process.env.API_BASE_URL ?? '').replace(/\/+$/, '')

/** 미들웨어가 확인을 끝낸 사용자를 화면으로 넘기는 헤더. */
export const USER_HEADER = 'x-oi-user'

/**
 * 세션 수명이 곧 퇴사자 실제 차단 창입니다. Cognito 토큰 수명이 아닙니다.
 * 다루는 자료가 민감할수록 짧게 잡고, 즉시 끊어야 하면 SESSION_SECRET 을 교체합니다.
 */
export const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 8 * 60 * 60)

/** 로그인 후 기본 착지 지점. */
export const DEFAULT_NEXT = '/admin'

/**
 * 노션 같은 다른 사이트 안에 끼워 넣어 띄웠을 때(iframe) 로그인은 팝업 창에서 합니다.
 * 구글 로그인 화면은 남의 화면 안에 들어가기를 거부해서(403) 틀 안에서는 시작할 수 없습니다.
 * 팝업이 로그인을 마치면 이 주소로 와서 틀에 알리고 스스로 닫힙니다(login/done/page.tsx).
 */
export const POPUP_DONE_PATH = '/login/done'

/** 팝업이 틀에게 "로그인 끝났다" 고 알릴 때 쓰는 메시지 이름. */
export const POPUP_MESSAGE = 'oi-login-done'

export type AuthConfig = {
  clientId: string
  clientSecret: string
  domain: string
  issuer: string
  sessionSecret: string
}

/**
 * 다섯이 다 있어야 켭니다. 반쯤 설정된 채로 켜면 로그인 화면까지 갔다가
 * 콜백에서 실패해서 아무도 못 들어옵니다.
 */
export function readAuthConfig(): AuthConfig | null {
  const clientId = process.env.COGNITO_CLIENT_ID
  const clientSecret = process.env.COGNITO_CLIENT_SECRET
  const domain = process.env.COGNITO_DOMAIN
  const issuer = process.env.COGNITO_ISSUER
  const sessionSecret = process.env.SESSION_SECRET

  if (!clientId || !clientSecret || !domain || !issuer || !sessionSecret) return null

  return { clientId, clientSecret, domain, issuer, sessionSecret }
}
