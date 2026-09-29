// ─────────────────────────────────────────────────────────────────────────────
// 감사 로그 — "누가 언제 무엇을 어떻게 바꿨나". 추가만 하고 수정·삭제하지 않는다
// (IAM 정책에도 PutItem/Query 만 있다). 분쟁이 났을 때 이 기록이 유일한 근거다.
// ─────────────────────────────────────────────────────────────────────────────
import { ddb } from "../../shared/aws.ts";
import { config } from "../../shared/config.ts";
import { ttlAfterDays } from "../../shared/time.ts";

/** 보존 기간. 사내 툴 기본 1년. 법정 보존 의무가 있는 데이터라면 TTL 을 아예 빼야 한다. */
const RETENTION_DAYS = 365;

export interface AuditEntry {
  /** 대상 식별자(여기서는 itemId). */
  targetId: string;
  actorSub: string;
  actorEmail?: string;
  /** create | update | delete | 그 밖에 툴이 정의하는 동작 이름. */
  action: string;
  /** 바뀐 값. 변경 전후를 통째로 넣지 말고 바뀐 필드만 담는다(용량·프라이버시). */
  changes?: Record<string, unknown>;
}

/** DynamoDB 에 넣을 레코드 모양으로 만든다. 트랜잭션에 함께 실으려고 쓰기와 조립을 분리했다. */
export function buildAuditItem(e: AuditEntry, nowMs = Date.now()): Record<string, unknown> {
  return {
    pk: `ITEM#${e.targetId}`,
    sk: `${nowMs}#${e.actorSub}`,
    targetId: e.targetId,
    actorSub: e.actorSub,
    actorEmail: e.actorEmail,
    action: e.action,
    changes: e.changes,
    at: new Date(nowMs).toISOString(),
    ttl: ttlAfterDays(RETENTION_DAYS, nowMs),
  };
}

/** 단독 기록(데이터 변경과 묶을 필요가 없는 경우 — 조회 감사, 로그인 기록 등). */
export async function appendAudit(e: AuditEntry): Promise<void> {
  await ddb.put({ TableName: config.tables.audit, Item: buildAuditItem(e) });
}

/** 특정 대상의 변경 이력(최신순). */
export async function listAudit(targetId: string, limit = 50): Promise<Record<string, unknown>[]> {
  const r = await ddb.query({
    TableName: config.tables.audit,
    KeyConditionExpression: "pk = :pk",
    ExpressionAttributeValues: { ":pk": `ITEM#${targetId}` },
    ScanIndexForward: false,
    Limit: limit,
  });
  return r.Items ?? [];
}
