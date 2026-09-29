// 런타임 설정 — 전부 Lambda 환경변수에서 온다(terraform/lambda.tf 의 local.lambda_env).
// 기본값을 ""로 둔 이유: 타입체크·테스트는 AWS 환경변수 없이 돌아야 하기 때문이다.
// 값이 비어 있으면 실제 호출 시점에 AWS 가 ValidationException 으로 알려 준다.
export const config = {
  env: process.env.ENV ?? "dev",
  region: process.env.AWS_REGION ?? "ap-northeast-2",

  tables: {
    items: process.env.TABLE_ITEMS ?? "",
    audit: process.env.TABLE_AUDIT ?? "",
  },

  buckets: {
    files: process.env.BUCKET_FILES ?? "",
  },

  /** SSM 파라미터 "이름"이다. 값이 아니라 이름을 넘기고 런타임에 읽는다. */
  appSecretParam: process.env.APP_SECRET_PARAM ?? "",

  cognito: {
    poolId: process.env.COGNITO_POOL_ID ?? "",
    clientId: process.env.COGNITO_CLIENT_ID ?? "",
  },

  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;
