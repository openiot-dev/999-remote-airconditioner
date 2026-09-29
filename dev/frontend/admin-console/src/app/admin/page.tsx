import { api, ApiError } from '@/lib/api'
import { currentUserEmail } from '@/lib/auth/current-user'
import { API_BASE_URL } from '@/lib/auth/config'

export const dynamic = 'force-dynamic'

type Item = { itemId: string; title?: string; status?: string }
type ItemsPage = { items?: Item[] }

/**
 * 표본 화면. 로그인한 사람으로 백엔드를 한 번 부릅니다.
 *
 * 화면은 토큰을 직접 다루지 않습니다. api() 만 부르면 쿠키의 갱신 토큰으로
 * ID 토큰을 받아 Authorization 헤더에 붙여 줍니다(lib/auth/tokens.ts).
 */
export default async function AdminPage() {
  const email = await currentUserEmail()
  const result = await loadItems()

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-baseline justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">관리자 콘솔</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-zinc-500 dark:text-zinc-400">{email ?? '로컬 (로그인 설정 없음)'}</span>
          <form action="/api/auth/logout" method="post">
            <button type="submit" className="text-zinc-900 underline dark:text-zinc-100 cursor-pointer">
              로그아웃
            </button>
          </form>
        </div>
      </header>

      <section className="pt-6">
        <h2 className="pb-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          내 아이템 <span className="font-mono text-xs text-zinc-500">GET /items</span>
        </h2>

        {'error' in result ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{result.error}</p>
        ) : result.items.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">아직 아이템이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm text-zinc-900 dark:text-zinc-100">
            {result.items.map((item) => (
              <li key={item.itemId} className="rounded-md bg-zinc-100 px-3 py-2 dark:bg-zinc-900">
                {item.title ?? item.itemId}
                {item.status && <span className="pl-2 text-xs text-zinc-500">{item.status}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="pt-8 text-sm text-zinc-600 dark:text-zinc-400">
        이 아래로 사내 화면을 붙입니다. /admin 과 /api/admin 은 미들웨어가 막습니다.
      </p>
    </main>
  )
}

async function loadItems(): Promise<{ items: Item[] } | { error: string }> {
  if (!API_BASE_URL) {
    return { error: 'API_BASE_URL 이 없습니다. terraform output -raw api_base_url 값을 .env.local 에 넣으세요.' }
  }

  try {
    const page = await api<ItemsPage>('/items')
    return { items: page.items ?? [] }
  } catch (caught) {
    if (caught instanceof ApiError) {
      // 401 은 갱신 토큰이 만료됐거나 로그인 전에 담기지 않은 경우입니다.
      if (caught.status === 401) return { error: '다시 로그인해 주세요.' }
      return { error: `백엔드 호출 실패: ${caught.status} ${caught.message}` }
    }
    return { error: '백엔드 호출 실패' }
  }
}
