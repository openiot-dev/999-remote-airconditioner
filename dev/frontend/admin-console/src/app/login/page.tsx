import { ALLOWED_EMAIL_DOMAIN } from '@/lib/auth/config'
import { safeNext } from '@/lib/auth/request'

import { LoginButton } from './login-button'

export const dynamic = 'force-dynamic'

type SearchParams = Promise<{ error?: string; email?: string; next?: string }>

function message(error: string | undefined, email: string | undefined): string | null {
  switch (error) {
    case 'domain':
      // 방금 본인이 구글에 인증한 자기 주소입니다. 공격자가 새로 알게 되는 것이 없습니다.
      return `${ALLOWED_EMAIL_DOMAIN} 계정만 들어올 수 있습니다.${email ? ` (${email})` : ''}`
    case 'unverified':
      return `이메일이 확인되지 않은 구글 계정입니다.${email ? ` (${email})` : ''}`
    case 'config':
      return '로그인 설정이 아직 없습니다. 관리자에게 문의해 주세요.'
    case 'oauth':
    case 'state':
    case 'token':
      return '인증에 실패했습니다. 다시 시도해 주세요.'
    default:
      return null
  }
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { error, email, next } = await searchParams
  const notice = message(error, email)
  const loginHref = `/api/auth/login?next=${encodeURIComponent(safeNext(next))}`

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 dark:bg-zinc-950">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">관리자 콘솔</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {ALLOWED_EMAIL_DOMAIN} 구글 계정으로 들어옵니다.
          </p>
        </div>

        {notice && (
          <p
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
          >
            {notice}
          </p>
        )}

        {/* 노션 틀 안에서는 팝업으로 엽니다. 이유는 login-button.tsx 에 있습니다. */}
        <LoginButton
          href={loginHref}
          next={safeNext(next)}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <OpenIoTMark />
          OpenIoT 계정으로 로그인
        </LoginButton>
      </div>
    </main>
  )
}

/** 디자인 시스템 아이콘 OpenIot-Fill 과 같은 모양입니다. 글자색을 따라가므로 다크 모드에서도 보입니다. */
function OpenIoTMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.7456 12.1074C16.1249 11.4504 17.0732 11.4504 17.4525 12.1074L20.8665 18.0205C21.2458 18.6775 20.7716 19.4988 20.013 19.4988H13.1851C12.4265 19.4988 11.9523 18.6775 12.3316 18.0205L15.7456 12.1074Z" />
      <path d="M10.3959 3.32819C10.5773 3.01394 10.9791 2.90628 11.2934 3.08771L16.4143 6.04426C16.7285 6.22569 16.8362 6.62751 16.6548 6.94175L13.6982 12.0627C13.5168 12.3769 13.115 12.4846 12.8007 12.3031L7.67981 9.34658C7.36557 9.16515 7.2579 8.76333 7.43933 8.44909L10.3959 3.32819Z" />
      <circle cx="6.94207" cy="15.5567" r="3.94207" />
    </svg>
  )
}
