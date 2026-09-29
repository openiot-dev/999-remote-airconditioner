import { unauthorized } from "./errors.ts";
import { getAppSecret, safeEqual } from "./secret.ts";

/** 외부 서비스 콜백(POST /webhook/*) 검증.
 *
 *  이 라우트는 Cognito authorizer 를 타지 않는다(외부 서비스에는 우리 토큰이 없다).
 *  대신 공유 시크릿을 헤더로 받아 여기서 확인한다 — 이 함수를 호출하지 않으면
 *  그 웹훅은 인터넷 전체에 열린 엔드포인트가 된다.
 *
 *  연동 대상이 HMAC 서명을 지원하면(Slack 의 x-slack-signature 등) 단순 비교 대신
 *  그 서명 검증으로 바꾼다. 원문(raw body)과 타임스탬프가 필요하므로 그때는
 *  index.ts 에서 파싱 전 본문을 함께 넘겨야 한다. */
export async function requireWebhookSecret(
  headers: Record<string, string | undefined>,
): Promise<void> {
  const provided = headers["x-webhook-secret"];
  const secret = await getAppSecret();
  if (!secret || !provided || !safeEqual(provided, secret)) {
    throw unauthorized("invalid webhook secret");
  }
}
