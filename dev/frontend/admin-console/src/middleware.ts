import { NextResponse, type NextRequest } from 'next/server'

import { ALLOWED_EMAIL_DOMAIN, SESSION_COOKIE, USER_HEADER, readAuthConfig } from '@/lib/auth/config'
import { isCrossSiteWrite } from '@/lib/auth/request'
import { readSession } from '@/lib/auth/session'

/**
 * 막을 경로만 적습니다.
 *
 * 열 경로를 적으면 공개 화면을 더할 때마다 규칙을 고쳐야 하고, 빠뜨리면 그 화면이 조용히 잠깁니다.
 * 사내 화면은 /admin 한 자리로 모읍니다.
 */
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
}

export async function middleware(request: NextRequest) {
  /** 화면은 로그인으로 보내고, /api/ 는 401 JSON 으로 답합니다. */
  const isApi = request.nextUrl.pathname.startsWith('/api/')

  // 세션 쿠키가 SameSite=None 이라 다른 사이트의 쓰기 요청에도 실립니다. 로그인 여부보다 먼저 자릅니다.
  if (isCrossSiteWrite(request)) {
    return NextResponse.json({ error: '다른 사이트에서 보낸 요청입니다', code: 'CrossSite' }, { status: 403 })
  }

  const authConfig = readAuthConfig()

  // 설정이 없을 때 배포본은 열지 말고 잠급니다. 로컬은 엽니다.
  if (!authConfig) {
    if (process.env.NODE_ENV === 'production') {
      return locked(isApi)
    }
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await readSession(token, authConfig.sessionSecret) : null

  if (!session || !session.email.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    return isApi ? unauthorized() : toLogin(request)
  }

  const forwarded = new Headers(request.headers)
  // 클라이언트가 직접 보낸 값은 버리고 우리가 확인한 값으로 덮습니다.
  forwarded.delete(USER_HEADER)
  // HTTP 헤더는 ASCII 만 담습니다. 한글이 들어가면 그 자리에서 500 입니다.
  forwarded.set(USER_HEADER, encodeURIComponent(session.email))

  return NextResponse.next({ request: { headers: forwarded } })
}

function toLogin(request: NextRequest) {
  const login = request.nextUrl.clone()
  login.pathname = '/login'
  login.search = ''
  login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`)
  return NextResponse.redirect(login)
}

function unauthorized() {
  return NextResponse.json({ error: '로그인이 필요합니다', code: 'Unauthenticated' }, { status: 401 })
}

function locked(isApi: boolean) {
  const message = 'Cognito 설정이 없어 사내 화면을 잠갔습니다'

  if (isApi) {
    return NextResponse.json({ error: message, code: 'AuthNotConfigured' }, { status: 503 })
  }

  return new NextResponse(message, {
    status: 503,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
