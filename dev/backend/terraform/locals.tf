locals {
  # 모든 리소스 이름은 "<project>-<env>-<리소스>" 형태다.
  prefix = "${var.project}-${var.env}"

  # 브라우저에서 API 를 호출하는 출처. 두 프론트 + 로컬 개발 + 추가 출처.
  # distinct 로 중복(예: user_app_base_url 을 localhost 로 둔 경우)을 걷어낸다.
  allowed_origins = distinct(concat([
    var.user_app_base_url,
    var.admin_app_base_url,
    "http://localhost:3000",
    "http://localhost:3001",
  ], var.extra_cors_origins))

  # Lambda 실행 역할에 붙일 경계 정책 ARN.
  # 계정 번호를 적어 두지 않고 조립해서 다른 계정에서도 그대로 돌게 한다.
  # 이름이 비면 null 이 되어 경계를 붙이지 않는다.
  lambda_permissions_boundary = var.lambda_permissions_boundary_name == "" ? null : (
    "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${var.lambda_permissions_boundary_name}"
  )

  common_tags = {
    Project   = var.project
    Env       = var.env
    ManagedBy = "terraform"
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
