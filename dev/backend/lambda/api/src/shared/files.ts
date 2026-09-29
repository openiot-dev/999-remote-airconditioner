import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "./aws.ts";
import { config } from "./config.ts";
import { badRequest } from "./errors.ts";

// 파일은 Lambda 를 통과시키지 않는다. 브라우저가 S3 로 직접 올리고 직접 받는다.
// Lambda 응답 본문 상한(6MB)과 API Gateway 타임아웃(30초)을 우회하고, 큰 파일에
// 드는 요금도 아낀다. Lambda 는 "어디에 올릴지" 서명된 URL 만 발급한다.
const UPLOAD_PREFIX = "uploads/";
const EXPORT_PREFIX = "exports/";
const URL_TTL_SEC = 300;

/** 경로 조작(../ 로 다른 프리픽스 탈출)과 이상한 문자를 막는다. */
function safeName(name: string): string {
  const base = name.replace(/[^\w.\-가-힣 ]/g, "_").slice(0, 120);
  if (!base || base.startsWith(".")) throw badRequest("invalid file name");
  return base;
}

/** 브라우저가 직접 PUT 할 URL. key 는 DB 에 저장해 두었다가 나중에 다운로드에 쓴다. */
export async function presignUpload(
  ownerSub: string,
  fileName: string,
  contentType: string,
): Promise<{ url: string; key: string; expiresInSec: number }> {
  const key = `${UPLOAD_PREFIX}${ownerSub}/${Date.now()}-${safeName(fileName)}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: config.buckets.files, Key: key, ContentType: contentType }),
    { expiresIn: URL_TTL_SEC },
  );
  return { url, key, expiresInSec: URL_TTL_SEC };
}

/** 서버가 만든 산출물(CSV 등)을 내려받을 URL. */
export async function presignDownload(key: string, downloadName?: string): Promise<string> {
  if (!key.startsWith(UPLOAD_PREFIX) && !key.startsWith(EXPORT_PREFIX)) {
    // IAM 정책도 이 두 프리픽스만 허용하지만, 코드에서도 막아 의도를 분명히 한다.
    throw badRequest("key must live under uploads/ or exports/");
  }
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: config.buckets.files,
      Key: key,
      ResponseContentDisposition: downloadName
        ? `attachment; filename="${encodeURIComponent(downloadName)}"`
        : undefined,
    }),
    { expiresIn: URL_TTL_SEC },
  );
}
