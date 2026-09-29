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

/** 열린 리다이렉트를 막습니다. / 로 시작하고 // 나 /\ 로 시작하지 않아야 합니다. */
export function safeNext(value: string | null | undefined): string {
  if (!value) return DEFAULT_NEXT
  if (!value.startsWith('/')) return DEFAULT_NEXT
  if (value.startsWith('//') || value.startsWith('/\\')) return DEFAULT_NEXT
  return value
}
