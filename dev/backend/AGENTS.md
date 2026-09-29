# backend — 에이전트용 요약

사내 툴 서버리스 백엔드 템플릿. 상세는 [README.md](./README.md).

## 구조

- `terraform/` — 인프라. 리소스 종류별 파일 분리, 이름 접두사는 `<project>-<env>`.
- `lambda/api/` — TypeScript ESM, esbuild 번들. 핸들러 두 개(`index.handler`, `scheduled.handler`)가 zip 하나에 들어간다.

## 반드시 지킬 것

- **계층**: `router`(인증 등급 + 입출력) → `service`(업무 규칙 + 소유권) → `repository`(DB 호출) → `model`(순수 함수). 테스트는 `model` 과 `shared` 의 순수 함수만 겨냥한다.
- **IAM 에 와일드카드 리소스를 쓰지 않는다.** 테이블·인덱스·버킷 프리픽스·파라미터를 ARN 으로 지정한다. 새 리소스를 추가하면 `iam.tf` 에 권한도 같이 추가한다.
- **시크릿은 SSM SecureString**. Lambda 환경변수에는 파라미터 "이름"만 넣는다. `terraform.tfvars` 는 커밋하지 않는다.
- **권한 클레임(`custom:role`)은 `write_attributes` 에 넣지 않는다.** 넣으면 사용자가 스스로 admin 이 될 수 있다.
- **시간은 UTC 로 저장하고 표시할 때만 KST 로 바꾼다.** 변환은 `shared/time.ts` 만 쓴다(로케일 포맷 금지).
- **크론은 UTC.** KST 기준 시각에서 9시간을 뺀다.
- **apply 전에 `cd lambda/api && npm run build`.** `dist/` 가 없으면 plan 이 실패한다.

## 검증 명령

```bash
cd lambda/api && npm run typecheck && npm test && npm run build
cd ../../terraform && terraform fmt -recursive && terraform validate
```

화면을 고쳤으면 앞단도 같이 본다. 저장소 뿌리에서:

```bash
cd dev/frontend/admin-console && npm run lint && npm run build
cd ../user-app && npm run lint && npm run build
```
