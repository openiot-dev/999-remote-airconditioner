import { cookies } from 'next/headers'
import { cache } from 'react'

import { REFRESH_COOKIE, readAuthConfig } from './config'

/**
 * 백엔드를 부를 때 쓸 ID 토큰을 가져옵니다.
 *
 * 쿠키에는 갱신 토큰만 있습니다. 그것으로 Cognito 에서 ID 토큰을 받아 옵니다.
 * react 의 cache() 로 감싸서 한 요청 안에서는 한 번만 받아 옵니다. 화면 하나가 API 를
 * 세 번 불러도 토큰 교환은 한 번입니다. 요청이 끝나면 버려지므로 서버 메모리에 쌓이지 않습니다.
 *
 * 요청 사이에 들고 있지 않는 이유: Next.js 는 여러 인스턴스로 뜨고, 사용자별 토큰을
 * 모듈 변수에 쌓으면 인스턴스마다 다른 상태가 생기고 지우는 시점도 애매해집니다.
 * ID 토큰 수명이 15분이라 아껴 봐야 얼마 안 되고, 교환은 한 번에 100ms 남짓입니다.
 */
export const idToken = cache(async (): Promise<string | null> => {
  const config = readAuthConfig()
  if (!config) return null

  const refreshToken = (await cookies()).get(REFRESH_COOKIE)?.value
  if (!refreshToken) return null

  const response = await fetch(`https://${config.domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      // 비밀 있는 클라이언트라 Basic 으로 보냅니다. 본문에 넣으면 400 입니다.
      authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
    }),
    cache: 'no-store',
  })

  // 갱신 토큰이 만료됐거나 취소됐습니다. 여기서 로그아웃시키지 않고 null 만 돌려줍니다.
  // 화면이 "다시 로그인해 주세요" 를 보여 줄지 정하게 둡니다.
  if (!response.ok) return null

  const payload = (await response.json()) as { id_token?: string }
  return payload.id_token ?? null
})
