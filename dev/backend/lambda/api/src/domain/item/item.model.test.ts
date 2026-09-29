import { describe, expect, it } from "vitest";
import {
  canTransition,
  createItemSchema,
  fromRecord,
  toRecord,
  updateItemSchema,
  type Item,
} from "./item.model.ts";

const sample: Item = {
  itemId: "i-1",
  ownerSub: "sub-1",
  title: "테스트",
  status: "open",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("레코드 변환", () => {
  it("도메인 → 저장 모양에서 키가 파생된다", () => {
    const rec = toRecord(sample);
    expect(rec.pk).toBe("OWNER#sub-1");
    expect(rec.sk).toBe("ITEM#i-1");
    expect(rec.gsi1pk).toBe("STATUS#open");
    expect(rec.gsi1sk).toBe(sample.createdAt);
  });

  it("되돌리면 키 속성이 응답에 남지 않는다", () => {
    const back = fromRecord(toRecord(sample)) as unknown as Record<string, unknown>;
    expect(back).toEqual(sample);
    expect(back.pk).toBeUndefined();
  });
});

describe("입력 검증", () => {
  it("제목 앞뒤 공백은 잘라낸다", () => {
    expect(createItemSchema.parse({ title: "  할 일  " }).title).toBe("할 일");
  });

  it("빈 제목은 거부", () => {
    expect(createItemSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("수정 요청에 바꿀 필드가 없으면 거부", () => {
    expect(updateItemSchema.safeParse({}).success).toBe(false);
  });

  it("모르는 상태값은 거부", () => {
    expect(updateItemSchema.safeParse({ status: "deleted" }).success).toBe(false);
  });
});

describe("상태 전이", () => {
  it("open ↔ done 은 오갈 수 있다", () => {
    expect(canTransition("open", "done")).toBe(true);
    expect(canTransition("done", "open")).toBe(true);
  });

  it("보관된 항목은 되살릴 수 없다", () => {
    expect(canTransition("archived", "open")).toBe(false);
  });

  it("같은 상태로의 저장은 허용(변화 없음)", () => {
    expect(canTransition("done", "done")).toBe(true);
  });
});
