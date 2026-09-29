output "api_base_url" {
  description = "API 기본 URL(끝 슬래시 없음)."
  value       = aws_apigatewayv2_stage.default.invoke_url
}

# 풀과 호스티드 UI 도메인은 이 Terraform 이 만든 것이 아니라 사내 공용 값이다.
# 확인용으로 그대로 돌려준다.
output "cognito_user_pool_id" {
  description = "사내 공용 사용자 풀 ID(이 Terraform 이 만들지 않음)."
  value       = var.cognito_user_pool_id
}

output "cognito_hosted_ui_domain" {
  description = "사내 공용 호스티드 UI 도메인."
  value       = var.cognito_domain
}

output "cognito_admin_client_id" {
  description = "관리자 콘솔 앱 클라이언트 ID."
  value       = aws_cognito_user_pool_client.admin.id
}

output "cognito_user_app_client_id" {
  description = "사용자 앱 앱 클라이언트 ID."
  value       = aws_cognito_user_pool_client.user_app.id
}

output "tables" {
  description = "DynamoDB 테이블 이름."
  value = {
    items = aws_dynamodb_table.items.name
    audit = aws_dynamodb_table.audit.name
  }
}

output "files_bucket" {
  value = aws_s3_bucket.files.bucket
}

output "alerts_topic_arn" {
  description = "알람 SNS 토픽. Slack(Chatbot) 등을 여기에 붙인다."
  value       = aws_sns_topic.alerts.arn
}

# ── 프론트엔드 주입용 ────────────────────────────────────────────────────────

# 관리자 콘솔은 서버가 코드를 교환하므로 값이 브라우저로 나가지 않는다.
# 클라이언트 비밀이 들어 있어 sensitive 다. 뽑을 때는
#   terraform output -json admin_console_env
# SESSION_SECRET 은 Terraform 이 만들지 않는다. 직접 만들어 넣는다:
#   openssl rand -base64 48
# 다섯 개가 다 있어야 로그인이 켜진다. 반쯤 채우면 콜백에서 실패해 아무도 못 들어온다.
output "admin_console_env" {
  description = "admin-console 의 .env.local / Amplify 환경변수 (SESSION_SECRET 은 따로 만든다)."
  sensitive   = true
  value = {
    COGNITO_CLIENT_ID     = aws_cognito_user_pool_client.admin.id
    COGNITO_CLIENT_SECRET = aws_cognito_user_pool_client.admin.client_secret
    COGNITO_DOMAIN        = var.cognito_domain
    COGNITO_ISSUER        = local.cognito_issuer
  }
}

# 사용자 앱은 브라우저에서 쓰는 공개 식별자만 받는다(시크릿 아님).
output "user_app_env" {
  description = "user-app 의 .env.local 값."
  value = {
    NEXT_PUBLIC_API_BASE_URL    = aws_apigatewayv2_stage.default.invoke_url
    NEXT_PUBLIC_COGNITO_REGION  = var.region
    NEXT_PUBLIC_COGNITO_POOL_ID = var.cognito_user_pool_id
    NEXT_PUBLIC_COGNITO_CLIENT  = aws_cognito_user_pool_client.user_app.id
    NEXT_PUBLIC_COGNITO_DOMAIN  = "https://${var.cognito_domain}"
  }
}
