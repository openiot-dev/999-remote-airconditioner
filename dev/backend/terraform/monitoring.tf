# ─────────────────────────────────────────────────────────────────────────────
# 관측성 — "조용히 실패하는" 상태를 없애는 최소 장치.
#
# 사내 툴이 죽는 방식은 대개 셋이다: 함수가 예외로 터지거나, 동시성 상한에 막혀
# 호출조차 안 되거나, API 가 5xx 를 뱉는데 아무도 모르거나. 그 셋에 알람을 건다.
# 수신은 SNS 토픽 하나로 모으고, 이메일·Slack(Chatbot)은 거기에 붙인다.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_sns_topic" "alerts" {
  name = "${local.prefix}-alerts"
  tags = { Component = "monitoring" }
}

# 이메일을 주면 AWS 가 확인 메일을 보낸다. 수신자가 링크를 눌러야 활성화되고,
# 그전까지 Terraform 상태는 pending_confirmation 으로 남는다(정상).
resource "aws_sns_topic_subscription" "alerts_email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# 핸들되지 않은 예외·타임아웃·OOM. 5분에 한 건이라도 나면 알린다.
resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name          = "${local.prefix}-api-errors"
  alarm_description   = "API Lambda 하드 실패(예외/타임아웃/OOM). CloudWatch Logs Insights 로 requestId 를 찾아 추적한다."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = { Component = "monitoring" }
}

# 동시성 상한에 막혀 호출이 버려지는 상태. 사용자에게는 5xx 로 보인다.
resource "aws_cloudwatch_metric_alarm" "api_throttles" {
  alarm_name          = "${local.prefix}-api-throttles"
  alarm_description   = "API Lambda 가 동시성 상한에 막혀 throttle 됨 — 일부 요청이 아예 처리되지 않았다."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = { FunctionName = aws_lambda_function.api.function_name }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = { Component = "monitoring" }
}

# 게이트웨이 단 5xx. Lambda Errors 에 안 잡히는 통합 실패(권한·타임아웃)를 여기서 본다.
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${local.prefix}-api-5xx"
  alarm_description   = "HTTP API 5xx 다발. Lambda Errors 알람과 교차 확인 — 둘 중 하나만 울리면 통합/권한 문제일 확률이 높다."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = aws_apigatewayv2_api.http.id }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 4
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = { Component = "monitoring" }
}

# 배치 실패 = 그날 집계/정리가 통째로 빠졌다는 뜻. 하루 한 번짜리라 재시도로 덮이지 않는다.
resource "aws_cloudwatch_metric_alarm" "scheduled_errors" {
  count               = var.enable_daily_task ? 1 : 0
  alarm_name          = "${local.prefix}-scheduled-errors"
  alarm_description   = "일 1회 배치 실패 — 해당 주기 작업이 누락됐다. 수동 재실행 필요."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.scheduled[0].function_name }
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  tags                = { Component = "monitoring" }
}
