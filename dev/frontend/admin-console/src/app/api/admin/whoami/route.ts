import { NextResponse } from 'next/server'

import { currentUserEmail } from '@/lib/auth/current-user'

export const dynamic = 'force-dynamic'

/** 보호 구간 API 예시. 로그인이 없으면 미들웨어가 401 JSON 으로 답합니다. */
export async function GET() {
  return NextResponse.json({ email: await currentUserEmail() })
}
