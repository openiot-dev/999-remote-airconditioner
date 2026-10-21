'use client'

/**
 * 노션 틀 안에서 연 로그인 팝업이 마지막에 도착하는 자리입니다(login-button.tsx).
 *
 * 쿠키는 이미 콜백이 구웠습니다. 여기서는 팝업을 연 틀에게 끝났다고 알리고 창을 닫습니다.
 * 틀이 없으면(누가 이 주소를 직접 열었으면) 그냥 관리자 화면으로 보냅니다.
 */

import { useEffect, useState } from 'react'

import { DEFAULT_NEXT, POPUP_MESSAGE } from '@/lib/auth/config'

export default function LoginDonePage() {
  const [stuck, setStuck] = useState(false)

  useEffect(() => {
    const opener = window.opener as Window | null
    if (!opener) {
      window.location.replace(DEFAULT_NEXT)
      return
    }

    // 받는 쪽을 우리 출처로 못 박습니다. 팝업을 연 창이 바뀌었으면 메시지는 버려집니다.
    opener.postMessage({ type: POPUP_MESSAGE }, window.location.origin)
    window.close()

    // 브라우저가 창 닫기를 막으면 직접 닫으라고 안내합니다.
    const timer = window.setTimeout(() => setStuck(true), 1000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {stuck ? '로그인을 마쳤습니다. 이 창을 닫아도 됩니다.' : '로그인을 마치는 중입니다...'}
      </p>
    </main>
  )
}
