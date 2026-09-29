// API Gateway(HTTP API v2) 진입점. 여기서 하는 일은 셋뿐이다:
//   1) 이벤트를 우리 요청 모양(RouteRequest)으로 정규화
//   2) 라우터에 넘김
//   3) 어떤 예외가 나오든 안전한 JSON 응답으로 변환
// 업무 로직을 여기에 두지 않는다.
import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { dispatch } from "./router.ts";
import { extractAuth } from "./shared/auth.ts";
import type { ApiResult, RouteRequest } from "./shared/aws.types.ts";
import { errorResponse } from "./shared/response.ts";

/** HTTP 헤더 이름은 대소문자를 구분하지 않는다. 클라이언트마다 다르게 보내므로 소문자로 통일한다. */
function lowercaseHeaders(
  h?: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(h ?? {})) out[k.toLowerCase()] = v;
  return out;
}

/** JSON 이면 파싱하고, 아니면 원문 그대로 넘긴다(웹훅이 폼 인코딩을 보내는 경우 등). */
function parseBody(event: APIGatewayProxyEventV2): unknown {
  if (!event.body) return undefined;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export const handler = async (event: APIGatewayProxyEventV2): Promise<ApiResult> => {
  // CORS 프리플라이트. 이 라우트는 인증을 타지 않고 2xx 만 돌려주면 된다
  // (Access-Control-* 헤더는 API Gateway 의 cors_configuration 이 붙인다).
  if (event.requestContext.http.method === "OPTIONS") {
    return { statusCode: 204 };
  }

  try {
    const req: RouteRequest = {
      method: event.requestContext.http.method,
      path: event.rawPath || event.requestContext.http.path,
      params: {},
      query: event.queryStringParameters ?? {},
      headers: lowercaseHeaders(event.headers),
      body: parseBody(event),
      auth: extractAuth(event),
      event,
    };
    return await dispatch(req);
  } catch (err) {
    return errorResponse(err);
  }
};
