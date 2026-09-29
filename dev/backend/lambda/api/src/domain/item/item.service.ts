// ─────────────────────────────────────────────────────────────────────────────
// 서비스 계층 — 업무 규칙과 권한이 만나는 곳.
//
// 규칙 하나: **권한 판단은 여기서 끝낸다.** 라우터는 "로그인했는가/등급이 되는가"만
// 보고, "이 사람이 이 데이터의 주인인가"는 데이터를 읽어 봐야 알 수 있으므로 여기서 본다.
// 프론트에서 숨기는 건 UX 이지 보안이 아니다.
// ─────────────────────────────────────────────────────────────────────────────
import { randomUUID } from "node:crypto";
import { hasRole } from "../../shared/auth.ts";
import type { AuthContext } from "../../shared/aws.types.ts";
import { badRequest, forbidden, notFound } from "../../shared/errors.ts";
import type { Page } from "../../shared/pagination.ts";
import { appendAudit, buildAuditItem } from "../audit/audit.repository.ts";
import {
  canTransition,
  type CreateItemInput,
  type Item,
  type ItemStatus,
  type UpdateItemInput,
} from "./item.model.ts";
import * as repo from "./item.repository.ts";

/** 관리자는 남의 것도 볼 수 있다. 그 외에는 본인 것만. */
function assertCanAccess(auth: AuthContext, ownerSub: string): void {
  if (auth.sub === ownerSub) return;
  if (hasRole(auth, "admin")) return;
  // 남의 데이터의 존재 여부까지 알려 줄 필요는 없지만, 사내 툴에서는 403 이 원인 파악에 낫다.
  throw forbidden("본인 항목만 접근할 수 있습니다");
}

export async function createItem(auth: AuthContext, input: CreateItemInput): Promise<Item> {
  const now = new Date().toISOString();
  const item: Item = {
    itemId: randomUUID(),
    ownerSub: auth.sub,
    title: input.title,
    note: input.note,
    fileKey: input.fileKey,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  return repo.putItemWithAudit(
    item,
    buildAuditItem({
      targetId: item.itemId,
      actorSub: auth.sub,
      actorEmail: auth.email,
      action: "create",
      changes: { title: item.title, status: item.status },
    }),
  );
}

export async function listMyItems(
  auth: AuthContext,
  limit: number,
  cursor?: string,
): Promise<Page<Item>> {
  return repo.listByOwner(auth.sub, limit, cursor);
}

/** 상태별 전체 목록. 관리자 화면용으로 만들었다.
 *  지금은 이어진 라우트가 없다 — 이유는 shared/auth.ts 의 requireRole 주석 참고. */
export async function listItemsByStatus(
  status: string,
  limit: number,
  cursor?: string,
): Promise<Page<Item>> {
  if (!["open", "done", "archived"].includes(status)) {
    throw badRequest(`status 는 open|done|archived 중 하나여야 합니다 (받은 값: ${status})`);
  }
  return repo.listByStatus(status as ItemStatus, limit, cursor);
}

export async function getItemFor(
  auth: AuthContext,
  ownerSub: string,
  itemId: string,
): Promise<Item> {
  assertCanAccess(auth, ownerSub);
  const item = await repo.getItem(ownerSub, itemId);
  if (!item) throw notFound("항목을 찾을 수 없습니다");
  return item;
}

export async function updateItem(
  auth: AuthContext,
  ownerSub: string,
  itemId: string,
  input: UpdateItemInput,
): Promise<Item> {
  const current = await getItemFor(auth, ownerSub, itemId);

  if (input.status && !canTransition(current.status, input.status)) {
    throw badRequest(`${current.status} → ${input.status} 로는 바꿀 수 없습니다`);
  }

  const updated: Item = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
  };

  // 감사 로그에는 "실제로 바뀐 필드"만 담는다. 통째로 저장하면 금세 커지고
  // 나중에 이력을 읽을 때 무엇이 달라졌는지 눈으로 찾아야 한다.
  const changes: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (current[k as keyof Item] !== v) changes[k] = { from: current[k as keyof Item], to: v };
  }

  return repo.putItemWithAudit(
    updated,
    buildAuditItem({
      targetId: itemId,
      actorSub: auth.sub,
      actorEmail: auth.email,
      action: "update",
      changes,
    }),
  );
}

/** 삭제는 관리자만. 일반 사용자에게는 status=archived 를 쓰게 한다
 *  (되돌릴 수 없는 동작을 아무나 하지 못하게 두는 편이 사내 툴에서 사고가 적다).
 *  지금은 이어진 라우트가 없다 — 이유는 shared/auth.ts 의 requireRole 주석 참고. */
export async function deleteItem(
  auth: AuthContext,
  ownerSub: string,
  itemId: string,
): Promise<void> {
  if (!hasRole(auth, "admin")) throw forbidden("삭제는 관리자만 가능합니다");
  const item = await repo.getItem(ownerSub, itemId);
  if (!item) throw notFound("항목을 찾을 수 없습니다");

  // 기록을 먼저 남기고 지운다. 기록만 남고 삭제가 실패하는 쪽이,
  // 삭제됐는데 기록이 없는 쪽보다 낫다. 순서를 바꾸지 말 것.
  await appendAudit({
    targetId: itemId,
    actorSub: auth.sub,
    actorEmail: auth.email,
    action: "delete",
    changes: { title: item.title, status: item.status },
  });
  await repo.deleteItem(ownerSub, itemId);
}
