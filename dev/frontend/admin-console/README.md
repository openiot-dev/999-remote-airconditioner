This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 로그인 (사내 공용 Cognito + 구글)

사내 화면은 `/admin` 과 `/api/admin` 아래에 둡니다. 미들웨어가 이 두 곳만 막습니다.
새 화면을 사내 전용으로 만들려면 `/admin` 아래에 두면 되고, 미들웨어를 고칠 필요가 없습니다.

### 1. 앱 클라이언트 (Terraform 이 만듭니다. 손으로 만들지 않습니다)

백엔드의 [cognito.tf](../../backend/terraform/cognito.tf) 가 공용 사용자 풀
`ap-northeast-2_pjubwRozp` 아래에 이 콘솔용 앱 클라이언트를 만듭니다.
풀, 구글 공급자, PreSignUp Lambda 는 이미 있으니 건드리지 않습니다.
구글 클라우드 콘솔에서 할 일은 없습니다.

**콘솔에서 손으로 하나 더 만들지 마십시오.** 클라이언트가 둘이 되면, `.env` 에 넣은
클라이언트 ID 와 Terraform 이 등록해 둔 콜백 주소 목록이 서로 다른 클라이언트의 것이 되어
로그인이 `redirect_mismatch` 로 깨집니다. 원인을 찾기 어려운 자리입니다.

<details>
<summary>Terraform 을 쓰지 않고 직접 만들어야 할 때만 펼치십시오</summary>

| 설정 | 값 |
| --- | --- |
| 클라이언트 비밀 | 생성 (서버가 코드를 교환합니다) |
| 콜백 URL | `https://<배포주소>/api/auth/callback` 과 `http://localhost:3001/api/auth/callback` 둘 다 |
| 로그아웃 URL | `https://<배포주소>/login` 과 `http://localhost:3001/login` 둘 다 |
| OAuth 흐름 | `code` (`implicit` 는 넣지 않습니다) |
| OAuth 스코프 | `openid`, `email` |
| 신원 공급자 | `Google` 만 (`COGNITO` 는 넣지 않습니다) |
| 인증 흐름 | `ALLOW_REFRESH_TOKEN_AUTH` 만 |
| ID / access 토큰 수명 | 15분 |
| 사용자 존재 오류 숨김 | 켬 |

이 표는 `cognito.tf` 의 `aws_cognito_user_pool_client.admin` 과 같은 값입니다.
한쪽을 고치면 다른 쪽도 고쳐야 합니다.

</details>

### 2. 환경변수

네 개는 `terraform apply` 뒤에 뽑아 옵니다. 손으로 찾아 적지 않습니다.

```bash
cd ../../backend/terraform
terraform output -json admin_console_env
```

`SESSION_SECRET` 만 Terraform 이 만들지 않습니다. 직접 만들어 다섯 번째로 넣습니다.

```bash
cp .env.example .env.local
openssl rand -base64 48   # SESSION_SECRET
```

다섯이 다 있어야 로그인이 켜집니다. 반쯤 채우면 콜백에서 실패해 아무도 못 들어옵니다.

배포본은 Amplify 콘솔의 환경변수에 같은 다섯 개를 넣습니다.
**설정이 없으면 배포본은 열리지 않고 503 으로 잠깁니다.** 로컬은 그냥 열립니다.

Amplify 콘솔 환경변수는 빌드까지만 전달되고, 요청을 받는 서버에는 가지 않습니다.
그래서 루트 [amplify.yml](../../../amplify.yml) 이 빌드 중에 `COGNITO_` 와 `SESSION_` 으로 시작하는 값만 골라 `.env.production` 으로 남깁니다.
다른 이름의 서버 환경변수를 추가하면 그 줄의 목록에도 넣어야 합니다. 빠뜨리면 로컬에서는 되고 배포본에서만 값이 비어 있습니다.
이 파일은 배포 결과물에 함께 들어가므로, 배포 결과물을 내려받을 수 있는 사람은 값을 읽을 수 있습니다.

Amplify 앱을 만들 때 모노레포 경로는 `dev/frontend/admin-console` 로 적습니다.
환경변수 `AMPLIFY_MONOREPO_APP_ROOT` 가 이 값과 다르면 `Invalid monorepo spec, no matching appRoot found in build spec` 으로 빌드가 바로 멈춥니다.

### 3. 백엔드 부르기

화면은 토큰을 직접 다루지 않습니다. `api()` 만 부릅니다.

```ts
import { api } from '@/lib/api'

const page = await api<{ items: Item[] }>('/items')
```

표본이 [src/app/admin/page.tsx](src/app/admin/page.tsx) 에 있습니다.

| 파일 | 하는 일 |
| --- | --- |
| [src/lib/api.ts](src/lib/api.ts) | 토큰을 붙여 백엔드 호출. 서버에서만 돕니다 |
| [src/lib/auth/tokens.ts](src/lib/auth/tokens.ts) | 쿠키의 갱신 토큰으로 ID 토큰을 받아 옵니다 |

주소는 `API_BASE_URL` 에 넣습니다. `terraform output -raw api_base_url` 값입니다.
비워 두면 로그인은 되고 API 호출만 막힙니다.

**토큰을 쿠키에 담는 방식에 함정이 하나 있습니다.** 세션 쿠키에는 서명된 이메일만 들어
있어서 백엔드를 부를 수가 없습니다. 그래서 갱신 토큰을 쿠키 하나에 따로 담고, 서버가
필요할 때마다 ID 토큰으로 바꿔 씁니다.

ID 토큰까지 쿠키에 같이 담으면 안 됩니다. 갱신 토큰과 합치면 4KB 를 넘고, 브라우저는
한도를 넘은 쿠키를 **오류 없이 통째로 버립니다.** 로그인은 성공하고 화면도 뜨는데 자료만
안 보이는 상태가 되어 원인을 찾는 데 오래 걸립니다.

사용자 앱도 같은 구조입니다. 거기는 브라우저가 직접 부르므로 쿠키 대신 `sessionStorage`
를 씁니다. [user-app/README.md](../user-app/README.md) 에 두 앱의 차이를 표로 정리해 두었습니다.

### 4. 즉시 차단

구글 계정을 끊으면 새 로그인은 그 자리에서 막히지만, 이미 나간 세션 쿠키는 만료까지 삽니다.
그 수명(`SESSION_TTL_SECONDS`, 기본 8시간)이 실제 차단 창입니다.
당장 전부 끊어야 하면 `SESSION_SECRET` 을 새로 만들어 배포합니다. 나가 있는 쿠키가 한 번에 죽습니다.
