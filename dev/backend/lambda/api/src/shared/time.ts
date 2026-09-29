// ─────────────────────────────────────────────────────────────────────────────
// KST 시간 헬퍼 — 순수 함수. Date 로케일에 의존하지 않는다.
//
// Lambda 는 UTC 로 돈다. 한국은 UTC+9 고정이고 서머타임이 없으므로 변환은 단순 산술이다.
// 업무 로직에서 toLocaleString 같은 로케일 포맷을 쓰면 실행 환경에 따라 결과가 달라진다.
// ─────────────────────────────────────────────────────────────────────────────

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** epoch-ms 를 KST 달력 날짜("YYYY-MM-DD")로. */
export function dateKstOf(tsEpochMs: number): string {
  return new Date(tsEpochMs + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/** KST 날짜의 "HH:mm" 벽시계 시각을 epoch-ms 로. */
export function kstWallToEpochMs(dateKst: string, hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  const midnightUtcMs = Date.parse(`${dateKst}T00:00:00Z`) - KST_OFFSET_MS;
  return midnightUtcMs + (h * 60 + m) * 60_000;
}

/** epoch-ms 의 KST "HH:mm" (표시 전용). */
export function hhmmKstOf(tsEpochMs: number): string {
  return new Date(tsEpochMs + KST_OFFSET_MS).toISOString().slice(11, 16);
}

/** "YYYY-MM-DD" 형식과 실제 날짜인지 검사. */
export function isValidDateKst(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

/** n 일 뒤 만료되는 DynamoDB TTL 값(초 단위 epoch). TTL 속성은 반드시 "초"다 — ms 를
 *  넣으면 서기 5만 년이 돼 영원히 지워지지 않는다. */
export function ttlAfterDays(days: number, nowMs = Date.now()): number {
  return Math.floor((nowMs + days * 86_400_000) / 1000);
}
