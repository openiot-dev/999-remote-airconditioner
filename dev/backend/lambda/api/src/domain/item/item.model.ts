// ─────────────────────────────────────────────────────────────────────────────
// 도메인 모델 — 이 파일은 순수하다(AWS SDK 를 import 하지 않는다).
// 키 조립·검증·상태 전이처럼 "틀리면 데이터가 망가지는" 규칙을 여기 모아 두고
// 테스트는 이 파일만 겨냥한다(item.model.test.ts). AWS 목킹이 필요 없어진다.
//
// 새 툴을 만들 때 실제로 갈아엎는 파일이 여기다. item → 실제 엔티티 이름으로 바꾼다.
// ─────────────────────────────────────────────────────────────────────────────
import { z } from "zod";

export const ITEM_STATUSES = ["open", "done", "archived"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export interface Item {
  itemId: string;
  ownerSub: string;
  title: string;
  status: ItemStatus;
  note?: string;
  /** presigned 업로드로 붙인 첨부의 S3 key. */
  fileKey?: string;
  createdAt: string; // ISO8601
  updatedAt: string; // ISO8601
}

/** DynamoDB 에 실제로 저장되는 모양. 키 속성은 도메인 필드에서 파생되며 직접 쓰지 않는다. */
export interface ItemRecord extends Item {
  pk: string;
  sk: string;
  gsi1pk: string;
  gsi1sk: string;
}

// ── 키 조립 ─────────────────────────────────────────────────────────────────
// 문자열을 코드 여기저기서 손으로 만들면 언젠가 한 군데가 틀린다. 항상 이 함수를 쓴다.
export const ownerPk = (ownerSub: string) => `OWNER#${ownerSub}`;
export const itemSk = (itemId: string) => `ITEM#${itemId}`;
export const statusGsiPk = (status: ItemStatus) => `STATUS#${status}`;

export function toRecord(item: Item): ItemRecord {
  return {
    ...item,
    pk: ownerPk(item.ownerSub),
    sk: itemSk(item.itemId),
    gsi1pk: statusGsiPk(item.status),
    gsi1sk: item.createdAt,
  };
}

/** 저장 모양 → 도메인 모양. 키 속성은 API 응답에 내보내지 않는다.
 *  DynamoDB 가 돌려주는 값은 타입이 없으므로 unknown 을 받아 여기서 한 번만 좁힌다. */
export function fromRecord(rec: unknown): Item {
  const { pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _g2, ...item } = rec as ItemRecord;
  return item;
}

// ── 입력 검증 ───────────────────────────────────────────────────────────────
// 클라이언트가 보낸 값은 전부 의심한다. 여기 없는 필드는 조용히 버려진다.
export const createItemSchema = z.object({
  title: z.string().trim().min(1, "제목은 필수입니다").max(200),
  note: z.string().max(2000).optional(),
  fileKey: z.string().max(400).optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    note: z.string().max(2000).optional(),
    status: z.enum(ITEM_STATUSES).optional(),
    fileKey: z.string().max(400).optional(),
  })
  // 빈 객체를 허용하면 "아무것도 안 바꾸는 수정"이 감사 로그만 남긴다.
  .refine((v) => Object.keys(v).length > 0, { message: "변경할 필드가 없습니다" });
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

// ── 상태 전이 ───────────────────────────────────────────────────────────────
// 허용된 이동만 표에 적는다. 표에 없으면 거부다 — 조건문으로 흩어 놓으면
// 나중에 상태가 하나 늘 때 어디를 고쳐야 하는지 알 수 없게 된다.
const ALLOWED_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  open: ["done", "archived"],
  done: ["open", "archived"],
  archived: [], // 보관된 항목은 되살리지 않는다(필요해지면 여기 한 줄 추가).
};

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  if (from === to) return true; // 같은 상태로 저장하는 건 변화 없음이므로 허용
  return ALLOWED_TRANSITIONS[from].includes(to);
}
