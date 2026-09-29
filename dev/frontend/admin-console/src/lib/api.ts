import 'server-only'

import { API_BASE_URL } from './auth/config'
import { idToken } from './auth/tokens'

/**
 * 백엔드 호출. 서버에서만 돕니다(server-only).
 *
 * 화면은 토큰을 직접 다루지 않습니다. 이 함수만 부르면 됩니다.
 *
 *   const page = await api<{ items: Item[] }>('/items')
 *
 * 백엔드는 /health 와 /webhook/* 을 뺀 모든 경로에 로그인을 요구합니다(apigw.tf).
 */

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
  if (!API_BASE_URL) {
    throw new ApiError(0, 'API_BASE_URL 이 없습니다 (terraform output api_base_url)')
  }

  const token = await idToken()
  if (!token) throw new ApiError(401, '로그인이 필요합니다')

  const response = await fetch(`${API_BASE_URL}${path}`, {
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
