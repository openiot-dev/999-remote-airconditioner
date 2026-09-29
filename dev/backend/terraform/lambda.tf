# ─────────────────────────────────────────────────────────────────────────────
# Lambda — 모놀리식 API 함수 하나(nodejs22, ESM, arm64).
#
# 함수를 라우트별로 쪼개지 않는 이유: 사내 툴 트래픽에서는 쪼갤수록 콜드스타트 지점과
# 배포 단위, IAM 역할만 늘어난다. 라우팅은 코드(src/router.ts)가 하고, 인프라는
# "함수 하나 + 로그 그룹 하나"로 단순하게 둔다. 특정 라우트가 무거워지면 그때 분리한다.
#
# arm64(Graviton)는 x86 대비 20% 저렴하고 대부분의 Node 워크로드에서 더 빠르다.
#
# 코드 zip 은 lambda/api 가 esbuild 로 만든 dist/ 를 archive 프로바이더가 묶는다.
# **apply 전에 반드시 `cd lambda/api && npm run build` 를 돌려야 한다** — dist/ 가
# 없으면 plan 단계에서 "no such file or directory" 로 멈춘다.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${local.prefix}-api"
  retention_in_days = var.log_retention_days
  tags              = { Component = "api" }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/api/dist"
  output_path = "${path.module}/build/api.zip"
}

locals {
  # API 와 배치가 공유하는 런타임 설정. 새 테이블·버킷을 추가하면 여기 한 곳만 고친다.
  lambda_env = {
    ENV               = var.env
    TABLE_ITEMS       = aws_dynamodb_table.items.name
    TABLE_AUDIT       = aws_dynamodb_table.audit.name
    BUCKET_FILES      = aws_s3_bucket.files.bucket
    APP_SECRET_PARAM  = aws_ssm_parameter.app_secret.name
    COGNITO_POOL_ID   = var.cognito_user_pool_id
    COGNITO_CLIENT_ID = aws_cognito_user_pool_client.admin.id
    ALLOWED_ORIGINS   = join(",", local.allowed_origins)
  }
}

resource "aws_lambda_function" "api" {
  function_name = "${local.prefix}-api"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs22.x"
  handler       = "index.handler"
  architectures = ["arm64"]
  timeout       = var.api_timeout
  memory_size   = var.api_memory_size

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  environment {
    variables = local.lambda_env
  }

  # 로그 그룹을 먼저 만들어 두지 않으면 Lambda 가 보관기간 "무제한"으로 자동 생성해
  # 버리고, 그 뒤 Terraform 이 같은 이름을 만들려다 "already exists" 로 깨진다.
  depends_on = [aws_cloudwatch_log_group.api]
  tags       = { Component = "api" }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http.execution_arn}/*/*"
}
