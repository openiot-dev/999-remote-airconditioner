/**
 * HMAC 으로 서명한 세션 쿠키.
 *
 * 이 파일은 미들웨어가 Edge 런타임에서 부릅니다. node:crypto 를 쓸 수 없으므로
 * crypto.subtle 만 씁니다. 이 파일에는 node: import 를 두지 않습니다.
 */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function b64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** payload 를 base64url 로 담고 그 위에 서명을 붙입니다. */
export async function sign(payload: string, secret: string): Promise<string> {
  const body = b64urlEncode(encoder.encode(payload))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body))
  return `${body}.${b64urlEncode(new Uint8Array(signature))}`
}

/**
 * 서명을 확인한 뒤에만 payload 를 엽니다.
 * 먼저 읽고 나중에 서명을 보면, 우리가 쓰지 않은 글자로 분기한 코드가 이미 돌아간 뒤입니다.
 */
export async function verify(token: string, secret: string): Promise<string | null> {
  const cut = token.lastIndexOf('.')
  if (cut < 1 || cut === token.length - 1) return null

  const body = token.slice(0, cut)

  let signature: Uint8Array<ArrayBuffer>
  try {
    signature = b64urlDecode(token.slice(cut + 1))
  } catch {
    return null
  }

  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signature,
    encoder.encode(body),
  )
  if (!ok) return null

  try {
    return decoder.decode(b64urlDecode(body))
  } catch {
    return null
  }
}

export type Session = { email: string; exp: number }

export async function createSession(email: string, secret: string, ttlSeconds: number): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  return sign(JSON.stringify({ email, exp } satisfies Session), secret)
}

export async function readSession(token: string, secret: string): Promise<Session | null> {
  const raw = await verify(token, secret)
  if (!raw) return null

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null

    const { email, exp } = parsed as Partial<Session>
    if (typeof email !== 'string' || typeof exp !== 'number') return null
    if (exp <= Math.floor(Date.now() / 1000)) return null

    return { email, exp }
  } catch {
    return null
  }
}

/** 로그인 시작에서 한 번 쓰고 버리는 난수. state 와 쿠키에 함께 담아 CSRF 를 막습니다. */
export function randomNonce(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(32)))
}
