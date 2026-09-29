// ─────────────────────────────────────────────────────────────────────────────
// 저장소 계층 — DynamoDB 호출만 한다. 권한 판단이나 업무 규칙은 여기 두지 않는다
// (그건 item.service.ts 의 몫). 이렇게 나눠 두면 나중에 저장소를 바꿔도 규칙이 안 흔들린다.
// ─────────────────────────────────────────────────────────────────────────────
import { ddb } from "../../shared/aws.ts";
import { config } from "../../shared/config.ts";
import { decodeCursor, encodeCursor, type Page } from "../../shared/pagination.ts";
import {
  fromRecord,
  itemSk,
  ownerPk,
  statusGsiPk,
  toRecord,
  type Item,
  type ItemStatus,
} from "./item.model.ts";

type DdbKey = Record<string, unknown>;

export async function putItem(item: Item): Promise<Item> {
  await ddb.put({ TableName: config.tables.items, Item: toRecord(item) });
  return item;
}

export async function getItem(ownerSub: string, itemId: string): Promise<Item | null> {
  const r = await ddb.get({
    TableName: config.tables.items,
    Key: { pk: ownerPk(ownerSub), sk: itemSk(itemId) },
  });
  return r.Item ? fromRecord(r.Item) : null;
}

export async function deleteItem(ownerSub: string, itemId: string): Promise<void> {
  await ddb.delete({
    TableName: config.tables.items,
    Key: { pk: ownerPk(ownerSub), sk: itemSk(itemId) },
  });
}

/** 내 아이템 목록. 파티션 하나를 훑는 Query 라 데이터가 늘어도 비용이 일정하다. */
export async function listByOwner(
  ownerSub: string,
  limit: number,
  cursor?: string,
): Promise<Page<Item>> {
  const r = await ddb.query({
    TableName: config.tables.items,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": ownerPk(ownerSub), ":prefix": "ITEM#" },
    Limit: limit,
    ExclusiveStartKey: decodeCursor<DdbKey>(cursor) ?? undefined,
    ScanIndexForward: false, // 최신 itemId 가 위로
  });
  return {
    items: (r.Items ?? []).map(fromRecord),
    nextCursor: r.LastEvaluatedKey ? encodeCursor(r.LastEvaluatedKey) : null,
  };
}

/** 상태별 전체 목록(관리자 화면). Scan 이 아니라 GSI Query 다 —
 *  Scan 은 테이블 전체를 읽어 데이터가 늘수록 느려지고 비싸진다. */
export async function listByStatus(
  status: ItemStatus,
  limit: number,
  cursor?: string,
): Promise<Page<Item>> {
  const r = await ddb.query({
    TableName: config.tables.items,
    IndexName: "gsi_status_created",
    KeyConditionExpression: "gsi1pk = :s",
    ExpressionAttributeValues: { ":s": statusGsiPk(status) },
    Limit: limit,
    ExclusiveStartKey: decodeCursor<DdbKey>(cursor) ?? undefined,
    ScanIndexForward: false, // 최신 생성순
  });
  return {
    items: (r.Items ?? []).map(fromRecord),
    nextCursor: r.LastEvaluatedKey ? encodeCursor(r.LastEvaluatedKey) : null,
  };
}

/** 아이템 저장 + 감사 로그를 한 트랜잭션으로 쓴다.
 *  둘을 따로 쓰면 "데이터는 바뀌었는데 기록이 없는" 상태가 생길 수 있다.
 *  TransactWriteItems 는 전부 성공하거나 전부 실패한다. */
export async function putItemWithAudit(item: Item, auditEntry: Record<string, unknown>): Promise<Item> {
  await ddb.transactWrite({
    TransactItems: [
      { Put: { TableName: config.tables.items, Item: toRecord(item) } },
      { Put: { TableName: config.tables.audit, Item: auditEntry } },
    ],
  });
  return item;
}
