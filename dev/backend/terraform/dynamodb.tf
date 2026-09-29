# ─────────────────────────────────────────────────────────────────────────────
# DynamoDB — 엔티티별 테이블. 전부 온디맨드(PAY_PER_REQUEST)라 트래픽이 없으면
# 요금도 없다. 사내 툴 규모에서 용량 계획은 낭비다.
#
# items 가 "이 툴이 다루는 데이터" 자리다. 복제한 뒤 이름과 키 설계를 바꿔 쓴다.
# 키 설계 규칙(사내 공통):
#   · pk/sk 는 항상 문자열이고, 접두사로 종류를 구분한다(OWNER#… / ITEM#…).
#   · 시각은 epoch-ms 숫자 또는 ISO8601 문자열 하나로 통일한다(둘을 섞지 않는다).
#   · 목록 조회 축이 늘면 Scan 이 아니라 GSI 를 추가한다.
# ─────────────────────────────────────────────────────────────────────────────

# 1) 도메인 데이터(샘플) — 소유자별 아이템.
#    PK = OWNER#<cognito sub>   SK = ITEM#<itemId>
resource "aws_dynamodb_table" "items" {
  name         = "${local.prefix}-items"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  # GSI: 상태별 최신순 목록. gsi1pk = STATUS#<status>, gsi1sk = createdAt(ISO)
  # 소유자를 가로지르는 조회를 Scan 없이 처리하려고 둔다.
  # item.service.ts 의 listItemsByStatus 가 쓴다. 지금은 그 함수에 이어진 라우트가 없어
  # 실제로는 아무도 읽지 않는다(등급이 생기면 다시 잇는다). 온디맨드라 안 쓰면 요금도 없다.
  attribute {
    name = "gsi1pk"
    type = "S"
  }
  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name            = "gsi_status_created"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  tags = { Entity = "items" }
}

# 2) 감사 로그 — 누가 무엇을 언제 바꿨는지. 추가만 하고 수정하지 않는다.
#    PK = ITEM#<itemId>   SK = <epochMs>#<actorSub>
#    ttl 은 켜 두되 값을 쓸지는 서비스 코드가 정한다(감사 보존 기간 정책).
resource "aws_dynamodb_table" "audit" {
  name         = "${local.prefix}-audit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  tags = { Entity = "audit" }
}
