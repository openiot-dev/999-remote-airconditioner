import { DEFAULT_NEXT } from './config'

function firstValue(header: string | null): string | null {
  if (!header) return null
  const first = header.split(',')[0]?.trim()
  return first || null
}

function isLoopback(host: string): boolean {
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')
}

/**
 * 콜백 주소는 x-forwarded-host 로 만듭니다.
 *
 * Amplify 나 CloudFront 뒤에서 request.url 은 내부 주소라 https://localhost:3000 이 나옵니다.
 * 그 주소를 Cognito 에 보내면 등록된 것과 달라 로그인이 시작조차 안 됩니다.
 * 콜백을 환경변수로 관리하면 배포본과 로컬 중 하나는 반드시 틀어집니다.
 */
export function originOf(headers: Headers): string {
  const host = firstValue(headers.get('x-forwarded-host')) ?? firstValue(headers.get('host')) ?? ''
  const proto = firstValue(headers.get('x-forwarded-proto')) ?? (isLoopback(host) ? 'http' : 'https')
  return `${proto}://${host}`
}

export function redirectUriOf(headers: Headers): string {
  return `${originOf(headers)}/api/auth/callback`
}

/**
 * 다른 사이트가 보낸 쓰기 요청인지 봅니다.
 *
 * 세션 쿠키는 노션 틀 안에서도 실려야 해서 SameSite=None 입니다. 그러면 브라우저가
 * 다른 사이트의 폼 전송에도 쿠키를 실어 보내므로, 쿠키가 막아 주던 CSRF 를 여기서 막습니다.
 * 노션 틀 안에서 우리 화면이 보내는 요청은 우리 출처라 걸리지 않습니다.
 */
export function isCrossSiteWrite(request: Request): boolean {
  if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') return false
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true
  const origin = request.headers.get('origin')
  return origin !== null && origin !== originOf(request.headers)
}

/** 열린 리다이렉트를 막습니다. / 로 시작하고 // 나 /\ 로 시작하지 않아야 합니다. */
export function safeNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_NEXT
  if (!value.startsWith('/')) return DEFAULT_NEXT
  if (value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_NEXT
  return value
}
