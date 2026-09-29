import { NextResponse } from 'next/server'

import { STATE_COOKIE, readAuthConfig } from '@/lib/auth/config'
import { originOf, redirectUriOf, safeNext } from '@/lib/auth/request'
import { randomNonce, sign } from '@/lib/auth/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const origin = originOf(request.headers)
  const authConfig = readAuthConfig()

  if (!authConfig) {
    return NextResponse.redirect(new URL('/login?error=config', origin))
  }

  const next = safeNext(new URL(request.url).searchParams.get('next'))
  const nonce = randomNonce()

  const authorize = new URL(`https://${authConfig.domain}/oauth2/authorize`)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('client_id', authConfig.clientId)
  authorize.searchParams.set('redirect_uri', redirectUriOf(request.headers))
  authorize.searchParams.set('scope', 'openid email')
  authorize.searchParams.set('state', nonce)
  // Cognito 자체 로그인 화면을 건너뛰고 구글 계정 선택 창으로 바로 보냅니다.
  authorize.searchParams.set('identity_provider', 'Google')

  const response = NextResponse.redirect(authorize)

  // 콜백에서 state 와 견주려고 같은 난수를 쿠키에도 굽습니다.
  response.cookies.set(STATE_COOKIE, await sign(JSON.stringify({ nonce, next }), authConfig.sessionSecret), {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
  })

  return response
}
