/** 의도한 실패. 이걸 던지면 라우터가 상태코드 그대로 응답한다.
 *  의도하지 않은 예외는 500 + "internal server error" 로 뭉개진다(내부 정보 유출 방지). */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (m: string) => new AppError(400, m, "BAD_REQUEST");
export const unauthorized = (m = "unauthorized") => new AppError(401, m, "UNAUTHORIZED");
export const forbidden = (m = "forbidden") => new AppError(403, m, "FORBIDDEN");
export const notFound = (m = "not found") => new AppError(404, m, "NOT_FOUND");
export const conflict = (m: string) => new AppError(409, m, "CONFLICT");
