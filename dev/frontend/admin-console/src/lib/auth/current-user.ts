import { headers } from 'next/headers'
import { USER_HEADER } from './config'

/**
 * 서명 확인은 미들웨어에서 한 번만 합니다. 화면에서 쿠키를 다시 풀지 않습니다.
 * 헤더는 ASCII 만 담으므로 미들웨어가 encodeURIComponent 로 넣은 값을 여기서 풉니다.
 */
export async function currentUserEmail(): Promise<string | null> {
  const value = (await headers()).get(USER_HEADER)
  if (!value) return null

  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}
