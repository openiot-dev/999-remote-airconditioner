'use client'

/**
 * 로그인 단추.
 *
 * 그냥 열었을 때는 평범한 링크입니다. 누르면 이 창이 Cognito, 구글을 거쳐 돌아옵니다.
 *
 * 노션 같은 다른 사이트 안에 끼워 넣어 띄웠을 때(iframe)는 같은 길을 팝업 창으로 엽니다.
 * 구글 로그인 화면은 남의 화면 안에 들어가기를 거부해서, 틀 안에서 링크를 따라가면
 * 구글 403 화면만 뜹니다. 팝업이 로그인을 마치면 /login/done 이 이 틀에 알려 주고,
 * 틀은 원래 가려던 주소로 다시 들어갑니다. 세션 쿠키는 팝업이 구워 둔 것을 같이 씁니다.
 */

import { useEffect, useRef, useState } from 'react'

import { POPUP_DONE_PATH, POPUP_MESSAGE } from '@/lib/auth/config'

type Props = {
  href: string
  next: string
  className: string
  children: React.ReactNode
}

type State = 'idle' | 'waiting' | 'blocked' | 'needs-access' | 'denied'

const POPUP_HREF = `/api/auth/login?next=${encodeURIComponent(POPUP_DONE_PATH)}`

export function LoginButton({ href, next, className, children }: Props) {
  const [state, setState] = useState<State>('idle')
  const popupRef = useRef<Window | null>(null)

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      // 우리 출처에서, 우리가 연 팝업이 보낸 것만 받습니다.
      if (event.origin !== window.location.origin) return
      if (!popupRef.current || event.source !== popupRef.current) return
      if ((event.data as { type?: unknown } | null)?.type !== POPUP_MESSAGE) return

      popupRef.current = null
      void enter(next, setState)
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [next])

  // 사용자가 로그인하지 않고 팝업을 닫으면 단추를 다시 쓸 수 있게 돌려놓습니다.
  useEffect(() => {
    if (state !== 'waiting') return
    const timer = window.setInterval(() => {
      if (popupRef.current?.closed) {
        popupRef.current = null
        setState('idle')
      }
    }, 500)
    return () => window.clearInterval(timer)
  }, [state])

  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    if (!isEmbedded()) return

    event.preventDefault()
    // 클릭 안에서 바로 열어야 브라우저가 팝업을 막지 않습니다. 이 앞에 await 를 두지 마십시오.
    const popup = window.open(POPUP_HREF, 'oi-login', 'popup,width=480,height=680')
    if (!popup) {
      setState('blocked')
      return
    }
    popupRef.current = popup
    setState('waiting')
  }

  function allowAccess() {
    document.requestStorageAccess().then(
      () => window.location.assign(next),
      () => setState('denied'),
    )
  }

  return (
    <div className="space-y-3">
      {state === 'needs-access' ? (
        <button type="button" onClick={allowAccess} className={className}>
          계속하기
        </button>
      ) : (
        <a href={href} onClick={onClick} className={className} aria-disabled={state === 'waiting'}>
          {children}
        </a>
      )}

      <Notice state={state} />
    </div>
  )
}

function Notice({ state }: { state: State }) {
  const text = {
    idle: null,
    waiting: '팝업 창에서 로그인을 마쳐 주세요.',
    blocked: '브라우저가 팝업을 막았습니다. 팝업을 허용하거나 새 창에서 열어 주세요.',
    'needs-access': '로그인을 마쳤습니다. 이 화면이 로그인 정보를 쓰도록 한 번 허용해 주세요.',
    denied: '브라우저가 이 틀 안에서 로그인 정보를 쓰지 못하게 막았습니다. 새 창에서 열어 주세요.',
  }[state]

  if (!text) return null

  return (
    <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
      {text}
      {(state === 'blocked' || state === 'denied') && (
        <>
          {' '}
          <a href={window.location.href} target="_blank" rel="noopener" className="underline">
            새 창에서 열기
          </a>
        </>
      )}
    </p>
  )
}

function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // 다른 출처의 틀 안이면 window.top 을 읽다가 막힐 수 있습니다. 그것도 끼워 넣어진 것입니다.
    return true
  }
}

/**
 * 팝업이 구운 쿠키를 이 틀이 볼 수 있으면 바로 들어가고, 아니면 허용을 받습니다.
 *
 * 크롬과 노션 데스크톱 앱은 대개 바로 들어갑니다. 사파리처럼 다른 사이트 안의 쿠키를
 * 막는 브라우저는 requestStorageAccess 로 허용을 받아야 하는데, 이 함수는 사용자가
 * 직접 누른 클릭 안에서만 불러집니다. 그래서 여기서 부르지 않고 "계속하기" 단추를 띄웁니다.
 */
async function enter(next: string, setState: (state: State) => void) {
  let hasAccess = true
  if (typeof document.hasStorageAccess === 'function') {
    try {
      hasAccess = await document.hasStorageAccess()
    } catch {
      hasAccess = true
    }
  }

  if (hasAccess) {
    window.location.assign(next)
  } else {
    setState('needs-access')
  }
}
