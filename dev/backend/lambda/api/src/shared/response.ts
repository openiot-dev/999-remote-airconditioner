import { z } from "zod";
import type { ApiResult } from "./aws.types.ts";
import { AppError, badRequest } from "./errors.ts";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

export function json(statusCode: number, body: unknown): ApiResult {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(body) };
}

export const ok = (body: unknown) => json(200, body);
export const created = (body: unknown) => json(201, body);
export const noContent = (): ApiResult => ({ statusCode: 204 });

/** 어떤 예외든 안전한 JSON 응답으로 바꾼다. */
export function errorResponse(err: unknown): ApiResult {
  if (err instanceof AppError) {
    return json(err.statusCode, { error: err.code, message: err.message });
  }
  if (err instanceof z.ZodError) {
    return json(400, { error: "VALIDATION", issues: err.issues });
  }
  // 여기 오는 건 우리가 예상 못 한 것. 로그에는 전부 남기고 응답에는 아무것도 싣지 않는다.
  console.error("unhandled error", err);
  return json(500, { error: "INTERNAL", message: "internal server error" });
}

/** 요청 본문을 스키마로 검증한다. 실패하면 400(VALIDATION)으로 떨어진다. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  if (body === undefined || body === null) throw badRequest("request body required");
  return schema.parse(body);
}
