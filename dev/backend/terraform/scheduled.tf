# ─────────────────────────────────────────────────────────────────────────────
# 배치 — EventBridge 크론이 깨우는 별도 핸들러(scheduled.handler).
# 같은 zip 안에 들어 있고 IAM 역할도 API 와 공유한다. 함수만 분리하는 이유는
# 타임아웃/메모리가 API 와 다르고(배치는 길게, API 는 짧게), 로그가 섞이면 곤란해서다.
#
# 규칙은 `task` 입력으로 무엇을 할지 알려 준다 — 배치 종류가 늘어도 함수는 하나다.
# 크론은 **UTC** 다. KST 로 생각한 시각에서 9시간을 빼야 한다.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "scheduled" {
  count             = var.enable_daily_task ? 1 : 0
  name              = "/aws/lambda/${local.prefix}-scheduled"
  retention_in_days = var.log_retention_days
  tags              = { Component = "scheduled" }
}

resource "aws_lambda_function" "scheduled" {
  count         = var.enable_daily_task ? 1 : 0
  function_name = "${local.prefix}-scheduled"
  role          = aws_iam_role.lambda.arn
  runtime       = "nodejs22.x"
  handler       = "scheduled.handler"
  architectures = ["arm64"]

  # 배치는 API 와 달리 API Gateway 30초 제약이 없다. 넉넉히 5분.
  timeout     = 300
  memory_size = 512

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  environment {
    variables = local.lambda_env
  }

  depends_on = [aws_cloudwatch_log_group.scheduled]
  tags       = { Component = "scheduled" }
}

resource "aws_cloudwatch_event_rule" "daily" {
  count               = var.enable_daily_task ? 1 : 0
  name                = "${local.prefix}-daily"
  description         = "일 1회 정리/집계 배치."
  schedule_expression = var.daily_task_schedule
  tags                = { Component = "scheduled" }
}

resource "aws_cloudwatch_event_target" "daily" {
  count     = var.enable_daily_task ? 1 : 0
  rule      = aws_cloudwatch_event_rule.daily[0].name
  target_id = "scheduled-daily"
  arn       = aws_lambda_function.scheduled[0].arn
  input     = jsonencode({ task = "daily" })
}

resource "aws_lambda_permission" "daily" {
  count         = var.enable_daily_task ? 1 : 0
  statement_id  = "AllowEventBridgeDaily"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.scheduled[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily[0].arn
}
