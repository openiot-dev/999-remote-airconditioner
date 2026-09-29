# ─────────────────────────────────────────────────────────────────────────────
# 새 툴을 시작할 때 이 파일에서 실제로 손대는 값은 project / env / *_base_url
# 세 가지뿐이다. 나머지는 기본값으로 굴러간다.
# ─────────────────────────────────────────────────────────────────────────────

variable "project" {
  description = <<-EOT
    툴 짧은 이름. 모든 리소스 이름의 접두사가 된다("<project>-<env>-…").
    S3 버킷 이름에도 들어가므로 소문자·숫자·하이픈만 쓴다. 템플릿을 복제하면
    가장 먼저 바꿀 값이다.
  EOT
  type        = string
  default     = "tooltpl"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9-]{1,20}$", var.project))
    error_message = "project 는 소문자/숫자/하이픈만, 2~21자."
  }
}

variable "env" {
  description = "배포 환경 (dev / stg / prd). 리소스 이름과 태그에 들어간다."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "stg", "prd"], var.env)
    error_message = "env 는 dev / stg / prd 중 하나."
  }
}

variable "region" {
  description = "AWS 리전. 기본 서울."
  type        = string
  default     = "ap-northeast-2"
}

# ── 계정 가드레일 ────────────────────────────────────────────────────────────

variable "lambda_permissions_boundary_name" {
  description = <<-EOT
    Lambda 실행 역할에 붙일 permissions boundary 정책 이름.

    사내 계정에는 DenyRoleWriteWithoutOpenIoTBoundary 조항이 걸려 있어 이 경계를
    붙이지 않은 역할은 아예 만들어지지 않는다. 이 값을 비우면 첫 apply 가
    "iam:CreateRole ... with an explicit deny in an identity-based policy" 로 멈춘다.

    가드레일이 없는 계정(개인 계정, 실험용)에서는 빈 문자열로 두면 경계를 붙이지 않는다.
  EOT
  type        = string
  default     = "OpenIoTLambdaExecutionBoundary"
}

# ── 사내 공용 Cognito ────────────────────────────────────────────────────────
# 이 세 값은 모든 사내 프로젝트가 같은 것을 쓴다. 이 Terraform 은 풀을 만들지 않고
# 참조만 한다. 프로젝트가 새로 만드는 것은 앱 클라이언트뿐이다.

variable "cognito_user_pool_id" {
  description = <<-EOT
    사내 공용 Cognito 사용자 풀 ID. 이미 존재하는 풀이며 이 Terraform 이 만들거나
    지우지 않는다. 구글 신원공급자와 PreSignUp Lambda(@openiot.app 도메인 차단)도
    이 풀에 이미 붙어 있다.
  EOT
  type        = string
  default     = "ap-northeast-2_pjubwRozp"
}

variable "cognito_domain" {
  description = <<-EOT
    공용 풀의 호스티드 UI 도메인. 호스트만 적고 https:// 는 붙이지 않는다.
    프로젝트마다 같은 값이다.
  EOT
  type        = string
  default     = "openiot-guardrails-prod.auth.ap-northeast-2.amazoncognito.com"
}

variable "cognito_identity_provider" {
  description = <<-EOT
    앱 클라이언트가 허용할 신원공급자. "COGNITO" 를 넣으면 네이티브 로그인 화면이
    살아나 같은 메일로 사용자가 둘 생기므로 바꾸지 않는다.
  EOT
  type        = string
  default     = "Google"
}

# ── 프론트엔드 연동 ──────────────────────────────────────────────────────────

variable "user_app_base_url" {
  description = <<-EOT
    사용자 앱(dev/frontend/user-app) 배포 URL, 끝 슬래시 없이.
    Cognito 호스티드 UI 의 callback/logout 목록과 CORS 허용 출처에 들어간다.
    Amplify 로 먼저 배포한 뒤 그 도메인을 여기에 넣고 다시 apply 하는 순서가 보통이다.
  EOT
  type        = string
  default     = "http://localhost:3000"
}

variable "admin_app_base_url" {
  description = "관리자 콘솔(dev/frontend/admin-console) 배포 URL, 끝 슬래시 없이."
  type        = string
  default     = "http://localhost:3001"
}

variable "extra_cors_origins" {
  description = <<-EOT
    위 두 앱 URL 외에 API 를 호출할 출처가 더 있을 때만 채운다(예: 사내 다른 툴).
    실제 허용 목록은 locals.allowed_origins = 두 앱 URL + 이 목록이다.
    "*" 를 넣으면 자격증명 없는 요청 전부가 열리므로 운영에서는 쓰지 않는다.
  EOT
  type        = list(string)
  default     = []
}

# ── 런타임 튜닝 ──────────────────────────────────────────────────────────────

variable "api_memory_size" {
  description = "API Lambda 메모리(MB). arm64 라 256 이면 대부분의 사내 툴에 충분하다."
  type        = number
  default     = 256
}

variable "api_timeout" {
  description = <<-EOT
    API Lambda 타임아웃(초). API Gateway HTTP API 통합 타임아웃 상한이 30초라
    그 아래(29)로 둔다. 이보다 오래 걸리는 작업은 동기 API 가 아니라 scheduled/비동기로 뺀다.
  EOT
  type        = number
  default     = 29
}

variable "log_retention_days" {
  description = "CloudWatch 로그 보관 기간(일). 무제한으로 두면 비용이 계속 는다."
  type        = number
  default     = 30
}

variable "enable_point_in_time_recovery" {
  description = "DynamoDB PITR(35일 시점 복구). dev 에서는 꺼서 비용을 아껴도 된다."
  type        = bool
  default     = true
}

# ── 스케줄러 ────────────────────────────────────────────────────────────────

variable "daily_task_schedule" {
  description = <<-EOT
    일 1회 배치(scheduled.handler, task="daily")의 EventBridge 크론. **UTC 기준**이다.
    기본 21:00 UTC = 다음 날 06:00 KST. 크론이 곧 실행 시각이므로 핸들러에는 시각
    가드를 두지 않는다.
  EOT
  type        = string
  default     = "cron(0 21 * * ? *)"
}

variable "enable_daily_task" {
  description = "일 1회 배치를 켤지. 배치가 필요 없는 툴이면 false 로 두면 규칙이 만들어지지 않는다."
  type        = bool
  default     = true
}

# ── 시크릿 ──────────────────────────────────────────────────────────────────

variable "app_secret" {
  description = <<-EOT
    툴이 쓰는 외부 연동 키(Slack 봇 토큰, 서드파티 API 키 등)의 자리표시자.
    SSM Parameter Store 에 SecureString 으로 저장되고 Lambda 가 런타임에 읽는다.
    실값은 커밋하지 말고 TF_VAR_app_secret 이나 terraform.tfvars(=.gitignore)로 넣거나,
    콘솔에서 직접 교체한다 — ssm.tf 의 ignore_changes 가 apply 로 되돌리는 것을 막는다.
  EOT
  type        = string
  sensitive   = true
  default     = "CHANGE_ME"
}

# ── 알림 ────────────────────────────────────────────────────────────────────

variable "alert_email" {
  description = <<-EOT
    CloudWatch 알람 수신 이메일. 비우면 SNS 토픽만 만들고 구독은 만들지 않는다
    (Slack/Chatbot 을 따로 붙이는 경우). 값을 주면 AWS 가 확인 메일을 보내고
    수신자가 링크를 눌러야 실제로 활성화된다.
  EOT
  type        = string
  default     = ""
}
