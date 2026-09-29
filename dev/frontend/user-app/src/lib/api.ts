/**
 * 백엔드 호출. 화면은 토큰을 직접 다루지 않고 이것만 부릅니다.
 *
 * 백엔드는 /health 와 /webhook/* 을 뺀 모든 경로에 로그인을 요구합니다
 * (dev/backend/terraform/apigw.tf). 토큰 없이 부르면 401 입니다.
 */

import { readAuthConfig } from './auth/config'
import { getIdToken, TransientAuthError } from './auth/session'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const config = readAuthConfig()
  if (!config) throw new ApiError(0, '로그인 설정이 없습니다 (.env.local 을 확인하세요)')
  if (!config.apiBaseUrl) throw new ApiError(0, 'NEXT_PUBLIC_API_BASE_URL 이 비어 있습니다')

  let token: string | null
  try {
    token = await getIdToken(config)
  } catch (err) {
    // 토큰 창구가 잠깐 막힌 것. 로그인이 풀린 게 아니므로 401 로 바꾸지 않습니다.
    // 401 로 바꾸면 부르는 쪽이 로그인 화면으로 보냅니다.
    if (err instanceof TransientAuthError) {
      throw new ApiError(0, '잠깐 연결이 불안정합니다. 잠시 뒤 다시 시도해 주세요.')
    }
    throw err
  }
  if (!token) throw new ApiError(401, '로그인이 필요합니다')

  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new ApiError(response.status, await response.text().catch(() => response.statusText))
  }

  return (await response.json()) as T
}
