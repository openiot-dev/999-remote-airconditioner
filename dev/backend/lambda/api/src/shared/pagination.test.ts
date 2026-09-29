import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor, parseLimit } from "./pagination.ts";
import { AppError } from "./errors.ts";

describe("cursor", () => {
  it("왕복해도 값이 보존된다", () => {
    const pos = { pk: "OWNER#abc", sk: "ITEM#001" };
    expect(decodeCursor(encodeCursor(pos))).toEqual(pos);
  });

  it("커서가 없으면 null (첫 페이지)", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("깨진 커서는 400 으로 떨어진다", () => {
    expect(() => decodeCursor("!!!not-base64!!!")).toThrow(AppError);
  });
});

describe("parseLimit", () => {
  it("없으면 기본값", () => {
    expect(parseLimit(undefined)).toBe(20);
  });

  it("상한을 넘으면 상한으로 자른다", () => {
    expect(parseLimit("9999")).toBe(100);
  });

  it("정수가 아니거나 0 이하면 400", () => {
    expect(() => parseLimit("0")).toThrow(AppError);
    expect(() => parseLimit("abc")).toThrow(AppError);
  });
});
