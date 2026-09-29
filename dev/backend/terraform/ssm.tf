# 외부 연동 키 — SecureString 으로 저장하고 Lambda 가 런타임에 ssm:GetParameter 로 읽는다.
# Lambda 환경변수에 직접 넣지 않는 이유: 환경변수는 콘솔·CLI 에서 평문으로 보이고
# 값을 바꾸려면 함수를 재배포해야 한다. 파라미터는 콘솔에서 즉시 교체된다.
#
# ignore_changes = [value] 는 "콘솔에서 실값으로 바꾼 뒤 apply 하면 자리표시자로
# 되돌아가는" 사고를 막는다. 최초 생성 때만 var.app_secret 이 쓰인다.
resource "aws_ssm_parameter" "app_secret" {
  name        = "/${local.prefix}/app-secret"
  description = "툴이 쓰는 외부 연동 키(Slack 토큰, 서드파티 API 키 등)."
  type        = "SecureString"
  value       = var.app_secret

  lifecycle {
    ignore_changes = [value]
  }

  tags = { Component = "secrets" }
}
