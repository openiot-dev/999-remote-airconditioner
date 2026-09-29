import { NextResponse } from 'next/server'

import { REFRESH_COOKIE, SESSION_COOKIE, readAuthConfig } from '@/lib/auth/config'
import { originOf } from '@/lib/auth/request'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET 을 받지 않습니다. 일부러입니다.
 *
 * 로그아웃은 부수효과가 있는(상태를 바꾸는) 동작이라 GET 으로 두면 안 됩니다. Next.js 는
 * 화면에 보이는 <Link> 를 자동으로 미리 불러오는데(prefetch), 그 미리 부르기가 GET 요청을
 * 그대로 보냅니다. 로그아웃 링크를 <Link> 로 바꾸는 순간 아무도 누르지 않았는데 로그아웃이
 * 실행됩니다. 101-project-process 에서 실제로 이렇게 배포본에서만 터졌습니다
 * (미리 부르기는 배포 빌드에서만 돕니다). 이미지 태그나 크롤러가 주소를 불러도 같은 일이
 * 납니다.
 *
 * 그래서 POST 만 받습니다. 화면 쪽은 <a href> 가 아니라 <form method="post"> 로 부릅니다
 * (admin/page.tsx).
 */
export async function POST(request: Request) {
  return logout(request)
}

function logout(request: Request) {
  const origin = originOf(request.headers)
  const authConfig = readAuthConfig()

  // 우리 세션을 먼저 끊고, Cognito 세션까지 끊으러 보냅니다.
  const target = authConfig
    ? cognitoLogoutUrl(authConfig.domain, authConfig.clientId, `${origin}/login`)
    : new URL('/login', origin)

  // 303 을 분명히 적습니다. NextResponse.redirect 의 기본값 307 은 브라우저가
  // 리다이렉트할 때 메서드를 그대로 유지합니다. 폼이 POST 로 여기를 불렀으니, 307 이면
  // 다음 주소(/login)에도 POST 로 이동하려 듭니다. /login 은 페이지라 POST 를 받지
  // 않아 405 로 막힙니다. 303 은 이동할 때 메서드를 GET 으로 바꿉니다.
  const response = NextResponse.redirect(target, 303)

  // 둘 다 지웁니다. 세션만 지우면 갱신 토큰이 남아 API 를 계속 부를 수 있습니다.
  for (const name of [SESSION_COOKIE, REFRESH_COOKIE]) {
    response.cookies.set(name, '', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 0,
    })
  }

  return response
}

function cognitoLogoutUrl(domain: string, clientId: string, logoutUri: string): URL {
  const url = new URL(`https://${domain}/logout`)
  url.searchParams.set('client_id', clientId)
  // 앱 클라이언트의 로그아웃 URL 목록에 문자 단위로 등록돼 있어야 합니다.
  url.searchParams.set('logout_uri', logoutUri)
  return url
}
