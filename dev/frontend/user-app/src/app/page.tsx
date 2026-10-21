'use client'

/**
 * 사용자 앱 표본 화면.
 *
 * 여기서 보여 주는 것은 셋입니다. 새 툴을 만들 때 이 세 가지를 그대로 따라 하면 됩니다.
 *   1. 로그인 시작 (beginLogin)
 *   2. 지금 로그인한 사람 읽기 (currentClaims)
 *   3. 토큰을 붙여 백엔드 부르기 (api)
 *
 * 설정이 없으면 로그인 단추 대신 무엇이 비었는지 보여 줍니다.
 * 반쯤 설정된 상태로 로그인을 시작하면 콜백에서 실패해 원인을 찾기 어렵습니다.
 */

import { useCallback, useEffect, useState } from 'react'

import { api, ApiError } from '@/lib/api'
import { readAuthConfig } from '@/lib/auth/config'
import {
  beginLogin,
  currentClaims,
  isEmbedded,
  loginInPopup,
  logout,
  TransientAuthError,
} from '@/lib/auth/session'

type Item = { id: string; title?: string }
type ItemsResponse = { items?: Item[] }

/**
 * 설정은 모듈이 뜰 때 한 번만 읽습니다. **절대 컴포넌트 안에서 읽지 마십시오.**
 *
 * readAuthConfig() 는 부를 때마다 새 객체를 돌려줍니다. 컴포넌트 안에서 부르고 그 값을
 * useEffect 의존성에 넣으면, 그릴 때마다 "값이 바뀌었다" 고 판단해 효과가 다시 돕니다.
 * 효과 안에서 목록을 불러와 배열을 상태에 넣으면 또 그리고, 또 돌고, 끝이 없습니다.
 *
 * 이 표본은 상태에 글자만 넣어서 우연히 멈췄습니다(같은 글자면 React 가 다시 그리지 않음).
 * 이 템플릿으로 만든 999-new-test-tool 은 목록을 넣었다가 이틀 동안 API 를 228만 번
 * 불렀습니다. NEXT_PUBLIC_ 값은 빌드 때 박히는 상수라 한 번만 읽어도 됩니다.
 */
const CONFIG = readAuthConfig()

export default function Home() {
  const config = CONFIG

  const [email, setEmail] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 처음 한 번만 돕니다. config 는 모듈 상수라 바뀌지 않습니다.
  useEffect(() => {
    if (!config) {
      setReady(true)
      return
    }

    let cancelled = false

    currentClaims(config)
      .then((claims) => {
        if (!cancelled) setEmail(claims?.email ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // 잠깐 막힌 것은 "로그인 안 됨" 이 아닙니다. 로그인 화면으로 보내지 않습니다.
        // 토큰은 살아 있으니 새로고침하면 그대로 들어옵니다.
        setError(
          err instanceof TransientAuthError
            ? '잠깐 연결이 불안정합니다. 새로고침해 주세요.'
            : '로그인 상태를 확인하지 못했습니다.',
        )
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })

    return () => {
      cancelled = true
    }
  }, [config])

  const loadItems = useCallback(async () => {
    setError(null)
    try {
      const data = await api<ItemsResponse>('/items')
      setItems(data.items ?? [])
    } catch (caught) {
      setItems(null)
      setError(caught instanceof ApiError ? `${caught.status} ${caught.message}` : '알 수 없는 오류')
    }
  }, [])

  if (!config) {
    return (
      <Shell>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          로그인 설정이 없습니다. <code className="font-mono">.env.local</code> 을 만들고 값을 채우세요.
        </p>
        <pre className="overflow-x-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
          cp .env.example .env.local{'\n'}
          cd ../../backend/terraform && terraform output -json user_app_env
        </pre>
      </Shell>
    )
  }

  if (!ready) {
    return (
      <Shell>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">확인 중입니다...</p>
      </Shell>
    )
  }

  if (!email) {
    return (
      <Shell>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">사내 계정으로 로그인해 주세요.</p>
        <button
          type="button"
          onClick={() => {
            if (!isEmbedded()) {
              void beginLogin(config, '/')
              return
            }
            // 노션 틀 안에서는 팝업으로 로그인합니다. 구글이 틀 안에서는 열리지 않습니다.
            setError(null)
            void loginInPopup().then(async (result) => {
              if (result === 'blocked') {
                setError('브라우저가 팝업을 막았습니다. 팝업을 허용하고 다시 눌러 주세요.')
                return
              }
              if (result === 'ok') {
                const claims = await currentClaims(config)
                setEmail(claims?.email ?? null)
              }
            })
          }}
          className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          OpenIoT 계정으로 로그인
        </button>
        {error !== null && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{email}</span>
        <button
          type="button"
          onClick={() => logout(config)}
          className="text-sm text-zinc-900 underline dark:text-zinc-100"
        >
          로그아웃
        </button>
      </div>

      <button
        type="button"
        onClick={() => void loadItems()}
        className="w-full rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        내 아이템 불러오기 (GET /items)
      </button>

      {error !== null && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {items !== null &&
        (items.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">아직 아이템이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-zinc-900 dark:text-zinc-100">
            {items.map((item) => (
              <li key={item.id} className="rounded-md bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
                {item.title ?? item.id}
              </li>
            ))}
          </ul>
        ))}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">사용자 앱</h1>
      {children}
    </main>
  )
}
