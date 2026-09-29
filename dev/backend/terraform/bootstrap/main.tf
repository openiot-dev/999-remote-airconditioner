# bootstrap — Terraform state 를 담을 S3 버킷.
#
# 닭과 달걀 문제라 이 스택만 로컬 state 로 한 번 apply 한 뒤, 상위 스택이 여기서
# 만든 버킷을 backend 로 쓴다. 계정마다 한 번만 돌리면 되고, 여러 툴이 같은 버킷을
# key 만 달리해 공유해도 된다(예: backend/<tool>/<env>/terraform.tfstate).
#
#   cd terraform/bootstrap
#   terraform init && terraform apply
#   terraform output -raw state_bucket
#
# 잠금은 S3 네이티브 락파일(use_lockfile)로 한다 — 예전처럼 DynamoDB 락 테이블을
# 따로 만들 필요가 없다(Terraform 1.11+).
#
# 버킷 이름은 openiot-tfstate-<계정번호> 다. 계정 공용이므로 이름에 툴 이름을 넣지 않는다.
# 넣으면 이 스택을 가장 먼저 돌린 툴의 이름이 그 계정의 모든 툴 상태에 영영 남는다.

terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Component = "tfstate"
      Scope     = "account" # 특정 툴의 것이 아니라 계정 공용이다
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  bucket_name = var.state_bucket_name != "" ? var.state_bucket_name : "openiot-tfstate-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket" "state" {
  bucket = local.bucket_name

  # state 에는 전 리소스의 식별자가 들어 있다. 실수로 지우면 인프라 전체가 고아가 된다.
  lifecycle {
    prevent_destroy = true
  }
}

# 버저닝은 선택이 아니다 — 깨진 state 를 되돌릴 유일한 수단이다.
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

variable "state_bucket_name" {
  description = <<-EOT
    상태 버킷 이름을 직접 지정할 때만 채운다. 비우면 openiot-tfstate-<계정번호> 가 된다.

    이 템플릿의 예전 판은 이름에 툴 이름을 넣어 openiot-<project>-tfstate-<계정번호> 로
    만들었다. 그렇게 만들어 둔 계정에서 이 스택을 다시 돌릴 때는 기존 이름을 여기에 적는다.
    적지 않으면 Terraform 이 새 이름의 버킷을 만들려 하고, 기존 버킷은 prevent_destroy 에
    걸려 오류로 멈춘다(지워지지는 않지만 apply 가 끝나지 않는다).

    이미 쓰고 있는 이름은 backend.hcl 의 bucket 값이다.
  EOT
  type        = string
  default     = ""
}

variable "region" {
  type    = string
  default = "ap-northeast-2"
}

output "state_bucket" {
  description = "상위 스택 backend.hcl 의 bucket 값."
  value       = aws_s3_bucket.state.id
}
