# remote state — terraform/bootstrap 이 먼저 apply 돼 있어야 한다.
#
# state 버킷 이름에는 계정 ID 가 들어가므로 아래 bucket 값은 자리표시자다. init 시
# -backend-config 로 덮어쓴다. (Terraform 은 backend 블록이 완전해야 validate 를
# 통과시키므로 비워둘 수 없다.) 자리표시자는 대문자·언더스코어를 써서 S3 버킷 이름
# 규칙에 **어긋나게** 뒀다 — 그대로 init 하면 조용히 엉뚱한 버킷을 쓰지 않고 실패한다.
#
#   cd terraform/bootstrap && terraform init && terraform apply
#   terraform output -raw state_bucket
#   cd ..
#   cp backend.hcl.example backend.hcl     # bucket 값을 채운다 (backend.hcl 은 .gitignore)
#   terraform init -backend-config=backend.hcl
#
# 잠금은 S3 네이티브 락파일(use_lockfile)이다. DynamoDB 락 테이블은 쓰지 않는다.
#
# state 를 아직 원격에 두고 싶지 않다면(1인 PoC) 이 블록을 통째로 주석 처리하면
# 로컬 state 로 동작한다. 사람이 둘 이상 붙는 순간 반드시 원격으로 되돌릴 것.
terraform {
  backend "s3" {
    bucket       = "CHANGE_ME_STATE_BUCKET"
    key          = "backend/dev/terraform.tfstate"
    region       = "ap-northeast-2"
    use_lockfile = true
    encrypt      = true
  }
}
