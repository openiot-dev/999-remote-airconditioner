# backend "s3" 의 use_lockfile(S3 네이티브 상태 잠금)은 Terraform 1.11 에서 GA 됐다.
# 하한을 낮추면 1.6~1.10 으로 init 할 때 Unsupported argument 로 즉시 실패한다.
terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = local.common_tags
  }
}
