'use client'

/**
 * Cognito 가 로그인을 마치고 돌아오는 자리입니다.
 * 이 주소는 cognito.tf 의 callback_urls 에 등록돼 있습니다. 경로를 바꾸면 거기도 바꿔야 합니다.
 *
 * useSearchParams 대신 window.location.search 를 직접 읽습니다.
 * 그래야 이 화면에 Suspense 경계를 두지 않아도 빌드가 통과합니다.
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'

import { readAuthConfig } from '@/lib/auth/config'
import { completeLogin, handOffToOpener, LoginError } from '@/lib/auth/session'

const MESSAGES: Record<string, string> = {
  config: '로그인 설정이 없습니다. .env.local 을 확인해 주세요.',
  oauth: '로그인이 취소되었거나 중간에 끊겼습니다.',
  state: '요청이 확인되지 않았습니다. 처음부터 다시 시도해 주세요.',
  token: '토큰을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
}

export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const config = readAuthConfig()
    if (!config) {
      setError(MESSAGES.config)
      return
    }

    completeLogin(config, window.location.search)
      .then((next) => {
        // 노션 틀 안에서 연 팝업이면 토큰을 틀에 건네고 닫습니다.
        if (handOffToOpener()) {
          window.close()
          setError('로그인을 마쳤습니다. 이 창을 닫아도 됩니다.')
          return
        }
        // replace 라 뒤로 가기를 눌러도 코드가 붙은 주소로 돌아오지 않습니다.
        window.location.replace(next)
      })
      .catch((caught: unknown) => {
        const reason = caught instanceof LoginError ? caught.reason : 'token'
        setError(MESSAGES[reason] ?? MESSAGES.token)
      })
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      {error === null ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">로그인 중입니다...</p>
      ) : (
        <>
          <p className="text-sm text-zinc-900 dark:text-zinc-100">{error}</p>
          <Link href="/" className="text-sm text-zinc-500 underline dark:text-zinc-400">
            처음으로
          </Link>
        </>
      )}
    </main>
  )
}
