'use client'

/**
 * 노션 틀 안에서 누른 로그인이 여는 팝업의 첫 화면입니다(session.ts 의 loginInPopup).
 *
 * 로그인 준비값(PKCE)은 이 팝업의 저장소에 만들어야 합니다. 틀의 저장소는 팝업에서
 * 보이지 않아서, 틀에서 만들어 넘기면 콜백이 짝을 찾지 못합니다. 그래서 여기서 시작합니다.
 */

import { useEffect, useState } from 'react'

import { readAuthConfig } from '@/lib/auth/config'
import { beginPopupLogin } from '@/lib/auth/session'

export default function AuthPopupPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const config = readAuthConfig()
    if (!config) {
      setError('로그인 설정이 없습니다. .env.local 을 확인해 주세요.')
      return
    }
    void beginPopupLogin(config)
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{error ?? '로그인 화면으로 이동합니다...'}</p>
    </main>
  )
}
