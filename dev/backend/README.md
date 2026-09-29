# 백엔드 — 서버리스 템플릿

사내 툴 하나를 굴리는 데 필요한 최소한의 AWS 백엔드를 Terraform 으로 통째로 담았다.
`terraform apply` 한 번이면 **로그인 · API · 데이터베이스 · 파일 저장소 · 배치 · 알람**이
한꺼번에 선다. 새 툴은 이 폴더를 복사해 `project` 이름만 바꾸는 것으로 시작한다.

서버(EC2/ECS)가 없어 쓰지 않을 때는 요금이 거의 0 이고, 관리할 OS 도 없다.

## 무엇이 만들어지나

| 구성요소 | AWS 서비스 | 하는 일 |
|---|---|---|
| 로그인 | 사내 공용 Cognito 풀 + 구글 | 풀은 이 Terraform 이 만들지 않고 참조만 한다. 프로젝트는 앱 클라이언트만 만든다 |
| API | API Gateway (HTTP API v2) | 공개 주소. 기본이 "로그인 필수"이고 예외만 열려 있다 |
| 애플리케이션 | Lambda (Node 22, arm64) | 함수 하나가 모든 라우트를 처리한다 |
| 데이터 | DynamoDB 2개 | `items`(도메인 데이터 샘플), `audit`(변경 이력) |
| 파일 | S3 1개 | 브라우저가 서명된 URL 로 직접 올리고 받는다 |
| 배치 | EventBridge + Lambda | 하루 한 번 도는 정리/집계 자리 |
| 시크릿 | SSM Parameter Store | 외부 연동 키. 코드·환경변수에 평문으로 두지 않는다 |
| 알람 | CloudWatch + SNS | 함수 실패 / 처리량 제한 / API 5xx / 배치 실패 |

## 폴더

```
backend/
├─ terraform/               # 인프라. 리소스 종류별로 파일을 나눈다
│  ├─ bootstrap/            # ① state 저장용 S3 버킷 (계정당 한 번만)
│  ├─ backend.tf            # remote state 설정 (bootstrap 이 만든 버킷을 가리킨다)
│  ├─ variables.tf          # ★ 새 툴에서 바꾸는 값은 거의 다 여기 있다
│  ├─ locals.tf             # 이름 접두사(<project>-<env>), 공통 태그, CORS 허용 출처
│  ├─ cognito.tf apigw.tf lambda.tf scheduled.tf
│  ├─ dynamodb.tf s3.tf ssm.tf
│  ├─ iam.tf                # 최소 권한 실행 역할 (와일드카드 없음)
│  ├─ monitoring.tf outputs.tf
│  └─ terraform.tfvars.example
└─ lambda/api/              # 애플리케이션 코드 (TypeScript, ESM, esbuild)
   └─ src/
      ├─ index.ts           # API 진입점 — 이벤트 정규화 + 예외 처리만
      ├─ router.ts          # ★ API 목차. 라우트 추가는 여기 한 줄
      ├─ scheduled.ts       # 배치 진입점
      ├─ shared/            # config, aws, auth, errors, response, files, time, pagination
      └─ domain/
         ├─ item/           # ★ 갈아엎을 샘플 도메인 (model / repository / service)
         └─ audit/          # 변경 이력
```

## 계층 규칙

지키면 코드가 커져도 어디를 고쳐야 할지 헷갈리지 않는다.

| 계층 | 하는 일 | 하지 않는 일 |
|---|---|---|
| `router.ts` | 입력 파싱, "로그인했나 / 등급이 되나", 응답 모양 | 업무 규칙 |
| `*.service.ts` | 업무 규칙, "이 데이터의 주인인가" | DynamoDB 직접 호출 |
| `*.repository.ts` | DB 호출 | 권한 판단 |
| `*.model.ts` | 키 조립·검증·상태 전이 (**순수 함수**) | AWS SDK import |

테스트는 `*.model.ts` 같은 순수 파일만 겨냥한다. AWS 목킹 없이 빠르게 돌고,
정작 틀리면 데이터가 깨지는 규칙이 거기 모여 있다.

## 처음 배포하기

전제: AWS 자격증명(`aws sts get-caller-identity` 가 성공), Terraform ≥ 1.11, Node ≥ 22.

```bash
# ① state 저장소 (AWS 계정당 한 번만. 이미 있으면 건너뛴다)
cd terraform/bootstrap
terraform init && terraform apply
terraform output -raw state_bucket        # 버킷 이름을 복사

# ② 설정
cd ..
cp backend.hcl.example backend.hcl        # bucket 값을 위에서 복사한 것으로
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars                  # project 이름부터 바꾼다

# ③ 코드 빌드 — dist/ 가 없으면 apply 가 plan 단계에서 멈춘다
cd ../lambda/api && npm install && npm run build

# ④ 배포
cd ../../terraform
terraform init -backend-config=backend.hcl
terraform apply

# ⑤ 프론트에 넘길 값
terraform output -json user_app_env
terraform output -json admin_console_env   # 클라이언트 비밀이 들어 있다
```

⑤ 의 출력을 각각 `dev/frontend/user-app/.env.local` 과 `admin-console/.env.local` 에 넣는다.
`admin_console_env` 에는 `SESSION_SECRET` 이 없다. Terraform 이 만들지 않으므로 직접 만든다:
`openssl rand -base64 48`. 다섯 개가 다 있어야 로그인이 켜진다.
Amplify 로 배포한 뒤에는 그 도메인을 `terraform.tfvars` 의 `user_app_base_url` /
`admin_app_base_url` 에 적고 다시 `apply` 한다 — 그 값으로 Cognito 로그인 리다이렉트
주소와 CORS 허용 출처가 만들어지기 때문이다.

### 계정은 만들지 않는다

풀이 사내 공용이므로 이 프로젝트에서 계정을 만들거나 비밀번호를 넣지 않는다.
`@openiot.app` 구글 계정이면 첫 로그인에 그대로 들어온다. 풀의 PreSignUp Lambda 가
그 외 계정을 가입 단계에서 자른다.

CLI 로 `admin-create-user` / `admin-set-user-password` 를 부르면 구글을 거치지 않는
네이티브 계정이 생긴다. 같은 메일로 사용자가 둘 생기고, 퇴사자를 구글에서 끊어도
그 계정은 살아남는다. 부르지 않는다.

> **등급은 쓰지 않는다. 지금 구조로는 쓸 수 없다.**
>
> 공용 풀 `ap-northeast-2_pjubwRozp` 에는 커스텀 속성이 하나도 없다. 확인:
>
> ```bash
> aws cognito-idp describe-user-pool --user-pool-id ap-northeast-2_pjubwRozp \
>   --query 'UserPool.SchemaAttributes[].Name'
> ```
>
> 그래서 `extractAuth` 의 `claims["custom:role"]` 은 언제나 없고 모두 `user` 로 떨어진다
> (fail closed). 속성을 만들어도 앱 클라이언트의 `read_attributes` 가
> `["email","email_verified"]` 뿐이라 토큰에 실리지 않는다.
>
> 그래서 `/admin/*` 라우트는 표본에서 뺐다. 다 만든 뒤에 403 을 발견하는 것보다 처음부터
> 없는 편이 낫다. 켜는 데 필요한 것과 이미 있는 재료는
> `lambda/api/src/shared/auth.ts` 의 `requireRole` 주석에 적어 두었다.
> 1번(공용 풀에 속성 추가)은 다른 팀의 툴에도 영향이 가므로 이 저장소만의 결정이 아니다.

## 코드 고치고 다시 배포

```bash
cd lambda/api && npm run build && cd ../../terraform && terraform apply
```

인프라를 안 건드리고 코드만 바꿨다면 `terraform apply` 는 Lambda 코드만 교체한다
(`source_code_hash` 가 달라지므로 자동으로 감지된다).

## 개발 중 확인

```bash
cd lambda/api
npm run typecheck     # tsc --noEmit
npm test              # vitest — 순수 로직 테스트
npm run build         # esbuild → dist/

cd ../../terraform
terraform fmt -recursive
terraform validate    # AWS 접속 없이 문법·참조 검증
terraform plan        # 실제로 무엇이 바뀌는지 (apply 전 항상 확인)
```

## 샘플 API

전부 로그인 필요(`Authorization: Bearer <ID 토큰>`). 예외는 `/health` 와 `/webhook/*`.

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/health` | 헬스체크 (인증 없음) |
| GET | `/me` | 내 계정·권한 — 프론트가 로그인 직후 화면을 정할 때 |
| GET | `/items` | 내 항목 목록 (`?limit=&cursor=`) |
| POST | `/items` | 생성 |
| GET | `/items/{id}` | 상세 |
| PATCH | `/items/{id}` | 수정 (상태 전이 규칙 적용) |
| GET | `/items/{id}/audit` | 변경 이력 |
| POST | `/files/upload-url` | 첨부 업로드용 서명 URL 발급 |
| GET | `/admin/items?status=open` | 전체 목록 (admin) |
| GET · DELETE | `/admin/items/{ownerSub}/{id}` | 남의 항목 조회·삭제 (admin) |
| POST | `/webhook/{source}` | 외부 콜백 (`x-webhook-secret` 헤더로 검증) |

## 새 툴로 바꿔 쓰는 순서

1. `terraform.tfvars` 의 `project` 를 바꾼다 → 모든 리소스 이름이 따라 바뀐다.
2. `dynamodb.tf` 의 `items` 테이블을 실제 엔티티에 맞게 고친다(이름·키·GSI).
3. `src/domain/item/` 을 복사해 실제 도메인으로 바꾸고 `item.model.ts` 부터 채운다.
4. `router.ts` 에 라우트를 추가한다.
5. `iam.tf` 에 새 테이블/버킷 권한을 추가한다 — 안 하면 AccessDenied 로 막힌다.
6. 필요 없는 것은 지운다(배치가 없으면 `enable_daily_task = false`).
7. 배포 주소가 생기면 저장소 최상단 `tools-console.json` 의 `name` 과 `url` 을 채우고 main 에 push 한다.
   사내 툴 콘솔에 등록된다(아래 '툴 콘솔 등록').

## 툴 콘솔 등록

main 에 push 하면 [register-tool.yml](../../.github/workflows/register-tool.yml) 이 이 툴을
사내 툴 콘솔(`openiot-devteam/000-tools-console`)에 등록하고, 이후 push 할 때마다 정보를 갱신한다.

키나 시크릿은 넣지 않는다. GitHub 이 실행마다 발급하는 증명서로 콘솔이
"openiot-devteam 조직의 이 저장소, main 브랜치"인지 확인한다. 저장소 이름을 바꿔도 같은 툴로 이어진다.

[tools-console.json](../../tools-console.json) 의 `name` 과 `url` 이 비어 있으면 등록하지 않고 안내만 남긴다.
Amplify 로 배포해 주소가 생긴 뒤 채우면 된다.

| 항목 | 설명 |
|---|---|
| `name` | 콘솔 카드에 보이는 이름. **필수** |
| `url` | 사용자 앱 주소. 카드를 누르면 열린다. **필수** |
| `slug` | 콘솔에서 툴을 구분하는 이름. 비우면 저장소 이름을 쓴다 |
| `description` | 한 줄 설명 |
| `category` | 분류 하나 |
| `tags` | 검색용 태그 배열 |
| `adminUrl` | 관리자 콘솔 주소. 카드에는 안 보이고 부가 정보로 저장된다 |
| `iconUrl` | 아이콘 이미지 주소 |
| `owner`, `ownerEmail` | 담당 팀과 연락처 |

버전은 `dev/frontend/user-app/package.json` 의 `version` 을 자동으로 보낸다.

**이 파일이 기준이다.** 콘솔 화면에서 설명을 고쳐도 다음 push 때 이 파일 내용으로 돌아간다.

보낼 내용만 확인하려면 `node scripts/register-tool.mjs --dry-run` 을 쓴다. 실제 등록은 GitHub Actions 안에서만 된다.

## 자주 걸리는 것

| 증상 | 원인 |
|---|---|
| apply 가 "no such file or directory .../dist" 로 멈춤 | `lambda/api` 빌드를 안 했다 |
| 브라우저에서 "CORS 오류" | 프론트 URL 이 `user_app_base_url`/`admin_app_base_url` 에 없다 |
| 로그인 후 리다이렉트가 거부됨 | 같은 이유. Cognito callback 목록이 그 값으로 만들어진다 |
| 값을 넣고 apply 했는데도 `redirect_mismatch` | Cognito 가 바뀐 callback 목록을 반영하는 데 1~2분 걸린다. 설정을 더 고치지 말고 잠시 뒤 다시 시도한다 |
| API 가 403 | 남의 항목에 접근했다. 서비스 계층이 소유자를 본다(`assertCanAccess`) |
| 새 기능이 AccessDenied | `iam.tf` 에 해당 액션/리소스를 추가하지 않았다 |
| `iam.tf` 에 추가하고 apply 했는데도 계속 AccessDenied | IAM 변경은 즉시 반영되지 않는다. 설정을 더 고치지 말고 1~2분 기다린 뒤 다시 시도한다. `aws iam simulate-principal-policy` 가 allowed 라고 답해도 마찬가지다. 확실히 하려면 함수를 새로 띄운다: `aws lambda update-function-configuration --function-name <이름> --description "권한 반영 $(date +%s)"` |
| 권한을 더했는데도 AccessDenied 가 영영 안 풀림 | 경계 정책(`OpenIoTLambdaExecutionBoundary`)에 없는 액션이다. 경계는 `iam.tf` 의 상한이라 여기에 적어도 거부된다. `iam.tf` 의 `permissions_boundary` 주석에 허용 범위와 확인 명령이 있다 |
| Actions 에 "툴 콘솔이 이 요청을 거절했습니다" 경고 | main 이 아닌 브랜치에서 수동 실행했거나, openiot-devteam 조직 밖(개인 계정 등)의 저장소다 |
| Actions 에 "이미 다른 툴이 쓰는 slug입니다" 경고 | 콘솔에 같은 slug 의 툴이 이미 있다. `tools-console.json` 의 `slug` 를 바꾼다 |
| SSM 에 넣은 실값이 자리표시자로 되돌아감 | 그럴 일 없다 — `ignore_changes = [value]` 로 막아 뒀다 |
