import { describe, expect, it } from "vitest";
import { matchPath, routeTable } from "./router.ts";

describe("matchPath", () => {
  it("고정 경로는 그대로 맞는다", () => {
    expect(matchPath("/health", "/health")).toEqual({});
  });

  it("자리표시자에서 값을 뽑는다", () => {
    expect(matchPath("/items/{id}", "/items/abc-123")).toEqual({ id: "abc-123" });
    // 자리표시자가 둘인 경우. 라우트 표에 이런 패턴이 지금은 없지만 matchPath 자체는 받는다.
    expect(matchPath("/items/{ownerSub}/{id}", "/items/sub-1/i-9")).toEqual({
      ownerSub: "sub-1",
      id: "i-9",
    });
  });

  it("URL 인코딩된 값을 되돌린다", () => {
    expect(matchPath("/items/{id}", "/items/a%2Fb")).toEqual({ id: "a/b" });
  });

  it("조각 수가 다르면 안 맞는다", () => {
    expect(matchPath("/items/{id}", "/items")).toBeNull();
    expect(matchPath("/items/{id}", "/items/a/b")).toBeNull();
  });

  it("빈 조각은 매치로 치지 않는다", () => {
    expect(matchPath("/items/{id}/audit", "/items//audit")).toBeNull();
  });
});

describe("라우트 표", () => {
  it("구체적인 경로가 자리표시자보다 먼저 온다", () => {
    // 순서가 뒤집히면 "/items/{id}" 가 "/items/{id}/audit" 을 가로채지는 않지만
    // (조각 수가 달라서), 나중에 비슷한 라우트를 추가할 때 이 순서 규칙이 필요하다.
    expect(routeTable.indexOf("GET /items/{id}/audit")).toBeLessThan(
      routeTable.indexOf("GET /items/{id}"),
    );
  });

  it("메서드+경로 조합에 중복이 없다", () => {
    expect(new Set(routeTable).size).toBe(routeTable.length);
  });
});
