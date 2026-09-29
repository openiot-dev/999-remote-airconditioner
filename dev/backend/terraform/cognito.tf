# ─────────────────────────────────────────────────────────────────────────────
# Cognito — 사내 공용 사용자 풀을 **참조만** 한다.
#
# 풀, 구글 신원공급자, PreSignUp Lambda(@openiot.app 아닌 계정을 가입 단계에서 자름)는
# 이미 있고 이 Terraform 이 건드리지 않는다. 프로젝트가 새로 만드는 것은 앱 클라이언트뿐이다.
#
# 이렇게 하는 이유:
#   1. 구글 콘솔에 등록된 리디렉션 주소는 Cognito 하나뿐이다. 프로젝트를 붙일 때
#      구글 콘솔을 건드리지 않는다.
#   2. 도메인 차단이 PreSignUp Lambda 와 앱의 도메인 검사, 두 겹이 된다.
#   3. 퇴사자를 끊는 자리가 한 곳이다. 구글 계정을 끊으면 새 로그인이 전부 막힌다.
#
# 사람이 보는 화면은 구글 계정 선택 창이다. 앱이 identity_provider=Google 로 넘겨
# Cognito 자체 로그인 화면을 건너뛴다.
# ─────────────────────────────────────────────────────────────────────────────

locals {
  # 풀 ID 에서 파생시킨다. 손으로 두 곳에 적으면 언젠가 한쪽만 바뀐다.
  cognito_issuer = "https://cognito-idp.${var.region}.amazonaws.com/${var.cognito_user_pool_id}"

  # 콜백/로그아웃 주소는 앱마다 갈린다. 문자 단위로 일치해야 하고,
  # 하나라도 빠지면 그 환경에서 로그인이 시작조차 되지 않는다.
  admin_origins = distinct([var.admin_app_base_url, "http://localhost:3001"])
  user_origins  = distinct([var.user_app_base_url, "http://localhost:3000"])
}

# ── 관리자 콘솔 ──────────────────────────────────────────────────────────────
# 서버(Next.js 라우트 핸들러)가 코드를 교환하므로 비밀을 만든다.
resource "aws_cognito_user_pool_client" "admin" {
  name         = "${local.prefix}-admin-console"
  user_pool_id = var.cognito_user_pool_id

  generate_secret = true

  # USER_PASSWORD_AUTH 를 넣으면 평문 비밀번호가 우리 코드를 지난다. 넣지 않는다.
  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  # COGNITO 를 넣으면 네이티브 로그인 화면이 살아난다. 같은 메일로 사용자가 둘 생기고,
  # 합치는 것은 사람이 API 를 부르는 일이 된다.
  supported_identity_providers = [var.cognito_identity_provider]

  allowed_oauth_flows                  = ["code"] # implicit 은 절대 넣지 않는다(토큰이 주소창에 남는다)
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email"] # openid 가 없으면 ID 토큰이 안 나온다

  callback_urls = [for o in local.admin_origins : "${o}/api/auth/callback"]
  logout_urls   = [for o in local.admin_origins : "${o}/login"]

  # 로그인 시점에 한 번 쓰고 버린다. 길게 둘 이유가 없다.
  # 실제 차단 창을 정하는 것은 이 값이 아니라 앱의 세션 쿠키 수명이다.
  access_token_validity  = 15
  id_token_validity      = 15
  refresh_token_validity = 1
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  read_attributes  = ["email", "email_verified"]
  write_attributes = []

  prevent_user_existence_errors = "ENABLED"
}

# ── 사용자 앱 ────────────────────────────────────────────────────────────────
# 브라우저만 있는 앱은 비밀을 안전하게 보관할 수 없다 → 비밀 없이 PKCE.
resource "aws_cognito_user_pool_client" "user_app" {
  name         = "${local.prefix}-user-app"
  user_pool_id = var.cognito_user_pool_id

  generate_secret = false

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  supported_identity_providers = [var.cognito_identity_provider]

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email"]

  callback_urls = [for o in local.user_origins : "${o}/auth/callback"]
  logout_urls   = local.user_origins

  access_token_validity  = 15
  id_token_validity      = 15
  refresh_token_validity = 1
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  read_attributes  = ["email", "email_verified"]
  write_attributes = []

  prevent_user_existence_errors = "ENABLED"
}
