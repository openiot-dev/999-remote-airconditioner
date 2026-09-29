import { badRequest } from "./errors.ts";

/** 목록 응답 공통 형태. 화면이 달라도 이 모양은 같게 유지한다. */
export interface Page<T> {
  items: T[];
  /** 다음 페이지 요청에 그대로 돌려줄 불투명 토큰. 마지막 페이지면 null. */
  nextCursor: string | null;
}

/** DynamoDB 의 LastEvaluatedKey 같은 내부 위치를 클라이언트에 노출하지 않기 위해
 *  base64url 로 감싼다. 클라이언트는 열어 보지 않고 되돌려주기만 한다. */
export function encodeCursor(pos: unknown): string {
  return Buffer.from(JSON.stringify(pos), "utf8").toString("base64url");
}

export function decodeCursor<T>(cursor: string | undefined | null): T | null {
  if (!cursor) return null;
  try {
    return JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as T;
  } catch {
    throw badRequest("invalid cursor");
  }
}

/** limit 파싱 — 상한을 두어 과대 요청(메모리·요금)을 막는다. */
export function parseLimit(raw: string | undefined, def = 20, max = 100): number {
  if (raw == null || raw === "") return def;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw badRequest("limit must be a positive integer");
  return Math.min(n, max);
}
