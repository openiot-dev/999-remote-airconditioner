import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { ssm } from "./aws.ts";
import { config } from "./config.ts";

// 컨테이너 단위 캐시. SSM 호출은 요청마다 하면 지연·요금이 붙는다.
// 콘솔에서 값을 교체하면 기존 컨테이너는 옛 값을 들고 있다가 재활용이 끝나면 새로 읽는다
// (즉시 반영이 필요하면 함수 환경변수를 하나 건드려 컨테이너를 갈아치운다).
let cached: string | null = null;

/** SSM SecureString 으로 저장한 외부 연동 키를 읽는다. */
export async function getAppSecret(): Promise<string> {
  if (cached !== null) return cached;
  const r = await ssm.send(
    new GetParameterCommand({ Name: config.appSecretParam, WithDecryption: true }),
  );
  cached = r.Parameter?.Value ?? "";
  return cached;
}

/** 길이·내용 차이가 응답 시간에 드러나지 않도록 상수 시간에 가깝게 비교한다.
 *  웹훅 서명·공유 시크릿 검증에는 === 대신 이걸 쓴다. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
