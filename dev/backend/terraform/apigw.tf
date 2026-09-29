# ─────────────────────────────────────────────────────────────────────────────
# API Gateway — HTTP API v2(REST API 아님. 더 싸고 빠르며 JWT authorizer 가 내장).
#
# 기본 정책은 "전부 로그인 필요"다($default 라우트에 Cognito JWT authorizer).
# 예외 세 개만 인증을 비운다:
#   GET /health          헬스체크(모니터링·배포 확인용)
#   OPTIONS /{proxy+}    CORS 프리플라이트 — 401 이 나면 브라우저가 본 요청을 아예 안 보낸다
#   POST /webhook/{...}  외부 서비스 콜백(서명은 Lambda 안에서 검증)
#
# 라우팅은 Lambda 안의 라우터가 한다(모놀리식 단일 함수). 라우트를 하나 늘릴 때마다
# Terraform 을 고치지 않아도 되고, 콜드스타트도 함수 하나 분량이면 끝난다.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_apigatewayv2_api" "http" {
  name          = "${local.prefix}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins  = local.allowed_origins
    allow_methods  = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers  = ["authorization", "content-type"]
    expose_headers = ["content-disposition"]
    max_age        = 3000
  }

  tags = { Component = "api" }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.http.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.http.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "${local.prefix}-cognito-jwt"

  jwt_configuration {
    # 두 프론트가 각자 자기 앱 클라이언트로 로그인하므로 둘 다 받는다.
    audience = [
      aws_cognito_user_pool_client.admin.id,
      aws_cognito_user_pool_client.user_app.id,
    ]
    issuer = local.cognito_issuer
  }
}

# ── 인증 없는 라우트 ─────────────────────────────────────────────────────────
resource "aws_apigatewayv2_route" "health" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "GET /health"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}

# 브라우저는 프리플라이트에 Authorization 헤더를 싣지 않는다. authorizer 를 태우면
# 401 이 떨어지고 본 요청은 전송조차 되지 않는다("CORS 오류"로 보이는 흔한 원인).
resource "aws_apigatewayv2_route" "options" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "OPTIONS /{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}

# 외부 서비스 콜백(Slack, 결제, 사내 시스템 등). Cognito 토큰이 없으므로 여기서 열고,
# 서명/공유 시크릿 검증은 Lambda(shared/webhook-auth.ts)가 한다.
resource "aws_apigatewayv2_route" "webhook" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "POST /webhook/{proxy+}"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "NONE"
}

# ── 나머지 전부: Cognito JWT 필수 ────────────────────────────────────────────
resource "aws_apigatewayv2_route" "default" {
  api_id             = aws_apigatewayv2_api.http.id
  route_key          = "$default"
  target             = "integrations/${aws_apigatewayv2_integration.lambda.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http.id
  name        = "$default"
  auto_deploy = true

  # 사내 툴 규모의 상한. 실수로 도는 루프가 계정 전체 동시성을 먹는 것을 막는다.
  default_route_settings {
    throttling_burst_limit = 50
    throttling_rate_limit  = 100
  }

  # 접근 로그 — 5xx 를 추적하려면 요청 단위 기록이 필요하다.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.apigw.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      responseLength = "$context.responseLength"
      integrationErr = "$context.integrationErrorMessage"
      userSub        = "$context.authorizer.claims.sub"
    })
  }

  tags = { Component = "api" }
}

resource "aws_cloudwatch_log_group" "apigw" {
  name              = "/aws/apigw/${local.prefix}"
  retention_in_days = var.log_retention_days
  tags              = { Component = "api" }
}
