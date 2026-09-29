/**
 * PKCE. 공개 클라이언트가 비밀 없이 코드 교환을 지키는 방법입니다.
 *
 * 로그인을 시작할 때 무작위 문자열(verifier)을 만들어 두고, 그 해시(challenge)만
 * Cognito 에 보냅니다. 나중에 코드를 토큰으로 바꿀 때 원본 verifier 를 함께 보냅니다.
 * 주소창에 노출되는 코드를 누가 가로채도 verifier 를 모르면 토큰으로 바꿀 수 없습니다.
 */

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 무작위 문자열. verifier 와 state 에 같이 씁니다. */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return toBase64Url(bytes)
}

/** S256 방식. plain 은 쓰지 않습니다(그러면 PKCE 를 쓰는 의미가 없습니다). */
export async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return toBase64Url(new Uint8Array(digest))
}
