# ─────────────────────────────────────────────────────────────────────────────
# S3 — 비공개 파일 버킷 하나. 프리픽스로 용도를 나눈다.
#   uploads/  브라우저가 presigned PUT 으로 올린 원본(엑셀 업로드 등)
#   exports/  서버가 만들어 presigned GET 으로 내려주는 산출물(CSV/XLSX)
# 둘 다 임시 파일이므로 7일 뒤 만료시킨다. 영구 보관이 필요하면 프리픽스를 하나 더
# 만들고 그 프리픽스만 lifecycle 에서 빼면 된다.
#
# 버킷 이름은 전 세계 유일해야 해서 계정 ID 를 붙인다.
# ─────────────────────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "files" {
  bucket = "${local.prefix}-files-${data.aws_caller_identity.current.account_id}"

  # dev 는 지우고 다시 만드는 일이 잦아 강제 삭제를 허용한다.
  # 운영(prd)에서는 남은 객체가 있으면 destroy 가 막히는 편이 안전하다.
  force_destroy = var.env != "prd"

  tags = { Purpose = "uploads-and-exports" }
}

resource "aws_s3_bucket_public_access_block" "files" {
  bucket                  = aws_s3_bucket.files.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "files" {
  bucket = aws_s3_bucket.files.id

  rule {
    id     = "expire-uploads"
    status = "Enabled"
    filter {
      prefix = "uploads/"
    }
    expiration {
      days = 7
    }
  }

  rule {
    id     = "expire-exports"
    status = "Enabled"
    filter {
      prefix = "exports/"
    }
    expiration {
      days = 7
    }
  }

  # 실패한 멀티파트 업로드 조각이 남아 조용히 요금을 먹는 것을 막는다.
  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }
}

# 브라우저가 presigned URL 로 직접 PUT/GET 하므로 CORS 가 필요하다.
resource "aws_s3_bucket_cors_configuration" "files" {
  bucket = aws_s3_bucket.files.id
  cors_rule {
    allowed_methods = ["PUT", "GET"]
    allowed_origins = local.allowed_origins
    allowed_headers = ["*"]
    expose_headers  = ["etag"]
    max_age_seconds = 3000
  }
}
