/**
 * 브라우저에서 쓰는 값만 있습니다.
 *
 * NEXT_PUBLIC_ 로 시작하는 값은 빌드할 때 화면 코드에 그대로 박힙니다. 그래서 비밀을
 * 넣으면 안 됩니다. 사용자 앱의 Cognito 앱 클라이언트는 비밀이 없는 공개 클라이언트라
 * (cognito.tf 의 generate_secret = false) 여기에 넣을 비밀 자체가 없습니다.
 * 비밀 대신 PKCE 로 코드 교환을 지킵니다.
 *
 * 값은 손으로 찾지 말고 뽑아 옵니다.
 *   cd dev/backend/terraform && terraform output -json user_app_env
 */

export type AuthConfig = {
  /** 호스티드 UI 주소. https:// 를 포함합니다. */
  domain: string
  /** 사용자 앱 몫의 앱 클라이언트 ID. */
  clientId: string
  /** API Gateway 주소. 비어 있으면 API 호출 기능만 꺼집니다. */
  apiBaseUrl: string
}

const trimEnd = (value: string) => value.replace(/\/+$/, '')

/**
 * 설정이 없으면 null 입니다. 로그인 단추를 감추는 데 씁니다.
 * 값이 반쯤 있는 상태로 로그인을 시작하면 콜백에서 실패하므로 둘 다 있어야 켭니다.
 */
export function readAuthConfig(): AuthConfig | null {
  const domain = trimEnd(process.env.NEXT_PUBLIC_COGNITO_DOMAIN ?? '')
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT ?? ''
  const apiBaseUrl = trimEnd(process.env.NEXT_PUBLIC_API_BASE_URL ?? '')

  if (!domain || !clientId) return null

  return { domain, clientId, apiBaseUrl }
}
