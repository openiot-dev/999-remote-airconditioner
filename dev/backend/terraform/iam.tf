# ─────────────────────────────────────────────────────────────────────────────
# IAM — Lambda 실행 역할. API 와 배치가 같은 역할을 공유한다.
#
# 원칙: 리소스 와일드카드(`"*"`)를 쓰지 않는다. 테이블·인덱스·버킷 프리픽스·파라미터
# 하나하나를 ARN 으로 지정한다. 툴이 털렸을 때 번지는 범위가 여기서 정해진다.
# 액션도 실제로 쓰는 것만 넣는다 — 새 기능이 AccessDenied 로 막히면 그때 한 줄 추가한다
# (그 한 줄이 곧 "이 툴이 무엇을 하는지"의 문서가 된다).
# ─────────────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.prefix}-lambda-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  # 계정 정책이 경계 없는 역할 생성을 막는다. 이 줄을 빼면 첫 apply 가 AccessDenied 로 멈춘다.
  #
  # 경계는 아래 정책의 상한이다. 여기에 없는 것은 아래에 적어도 런타임에 거부된다.
  # 허용: dynamodb:*, s3:*, sqs:*, sns:*, ssm:GetParameter*, logs 쓰기, kms 암복호,
  #       lambda:InvokeFunction, cognito-idp Admin*, bedrock:InvokeModel, rekognition,
  #       kinesis/firehose/iot/states/xray 쓰기, ec2 ENI(VPC 연결용), execute-api:Invoke.
  # 언제나 거부(허용 목록과 무관):
  #   - iam:*, sts:AssumeRole, organizations/billing/cloudtrail/config 등 계정 통제
  #     → 이 Lambda 는 다른 역할을 맡을 수 없다. 교차 계정 접근이 필요하면 설계를 바꾼다.
  #   - dynamodb:DeleteTable, s3:DeleteBucket, sqs:DeleteQueue, sns:DeleteTopic,
  #     logs:DeleteLogGroup, s3:DeleteObjectVersion, dynamodb:DeleteBackup
  #     → 런타임 코드가 인프라를 지울 수 없다. 버전 객체를 완전 삭제하는 기능도 막힌다.
  #
  # 실제 문서 확인:
  #   aws iam get-policy-version --policy-arn <위 ARN> --version-id <DefaultVersionId>
  permissions_boundary = local.lambda_permissions_boundary

  tags = { Component = "api" }
}

data "aws_iam_policy_document" "lambda_policy" {
  # ── items 테이블 + GSI ──
  statement {
    sid = "ItemsTable"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.items.arn,
      "${aws_dynamodb_table.items.arn}/index/gsi_status_created",
    ]
  }

  # ── 감사 로그 ── (추가와 조회만. 지우거나 고칠 수 없어야 감사 로그다)
  statement {
    sid       = "AuditTable"
    actions   = ["dynamodb:PutItem", "dynamodb:Query"]
    resources = [aws_dynamodb_table.audit.arn]
  }

  # ── 데이터 변경 + 감사 기록을 한 트랜잭션으로 ──
  statement {
    sid       = "TransactWrite"
    actions   = ["dynamodb:TransactWriteItems"]
    resources = [aws_dynamodb_table.items.arn, aws_dynamodb_table.audit.arn]
  }

  # ── S3: 지정한 두 프리픽스 아래에서만 ──
  # 버킷 루트가 아니라 프리픽스까지 좁힌다. presigned URL 은 이 역할의 권한을 빌려
  # 발급되므로, 여기서 허용한 범위가 곧 사용자가 올리거나 받을 수 있는 범위다.
  statement {
    sid     = "FilesObjects"
    actions = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = [
      "${aws_s3_bucket.files.arn}/uploads/*",
      "${aws_s3_bucket.files.arn}/exports/*",
    ]
  }

  # ── 외부 연동 키 조회 ──
  statement {
    sid       = "AppSecret"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.app_secret.arn]
  }

  # ── Cognito 관리 권한은 주지 않는다 ──
  # 예전에는 이 툴이 자기 풀을 갖고 있어서 사용자 초대·역할 부여·비활성화 권한을 줬다.
  # 이제 풀은 모든 사내 프로젝트가 함께 쓰는 공용 풀이다. 여기에 AdminCreateUser 나
  # AdminUpdateUserAttributes 를 주면 이 툴의 Lambda 가 전사 계정을 건드릴 수 있게 되고,
  # ListUsers 만 줘도 전사 명단이 프로젝트마다 새어 나간다.
  # 계정 관리는 공용 풀을 관리하는 쪽에서 한 곳으로 한다.
  #
  # 지금 이 코드는 Cognito API 를 부르는 곳이 없어서 권한이 필요하지도 않다.
  # 정말 필요해지면 공용 풀 담당자와 합의한 뒤, 필요한 동작 하나만 좁혀서 추가한다.

  # ── CloudWatch Logs ── (API + 배치. 배치를 끄면 그 그룹은 목록에서 빠진다)
  statement {
    sid     = "Logs"
    actions = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = concat(
      ["${aws_cloudwatch_log_group.api.arn}:*"],
      [for lg in aws_cloudwatch_log_group.scheduled : "${lg.arn}:*"],
    )
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${local.prefix}-lambda-policy"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_policy.json
}
