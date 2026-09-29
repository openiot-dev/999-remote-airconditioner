# 사용자 앱

사내 계정을 가진 사람이 쓰는 화면입니다. 관리자 콘솔과 달리 **브라우저가 직접 API 를 부릅니다.**

## 두 앱의 로그인이 다른 이유

| | 관리자 콘솔 | 사용자 앱 (여기) |
| --- | --- | --- |
| 앱 클라이언트 | 비밀 있음 | 비밀 없음 (공개 클라이언트) |
| 코드를 교환하는 곳 | 서버 라우트 (`/api/auth/callback`) | 브라우저 (`/auth/callback`) |
| 코드 교환을 지키는 것 | 클라이언트 비밀 | PKCE |
| API 를 부르는 곳 | (아직 없음) | 브라우저가 `Authorization: Bearer` 로 직접 |
| 토큰을 두는 곳 | 서명된 쿠키 | 갱신 토큰은 `sessionStorage`, ID 토큰은 메모리 |

브라우저에는 비밀을 숨길 자리가 없습니다. 그래서 비밀 대신 PKCE 를 씁니다.
자세한 내용은 [src/lib/auth/session.ts](src/lib/auth/session.ts) 맨 위 주석에 있습니다.

## 시작하기

앱 클라이언트는 백엔드의 [cognito.tf](../../backend/terraform/cognito.tf) 가 만듭니다.
**콘솔에서 손으로 만들지 않습니다.**

```bash
cp .env.example .env.local

cd ../../backend/terraform
terraform output -json user_app_env    # 다섯 값을 여기서 뽑아 채웁니다

cd ../../frontend/user-app
npm install
npm run dev                            # http://localhost:3000
```

`.env.local` 이 없으면 화면이 로그인 단추 대신 무엇이 비었는지 알려 줍니다.
반쯤 채운 채로 로그인을 시작하면 콜백에서 실패해 원인을 찾기 어렵습니다.

## 들어 있는 것

| 파일 | 하는 일 |
| --- | --- |
| [src/lib/auth/config.ts](src/lib/auth/config.ts) | 환경변수를 읽습니다. 값이 없으면 `null` 이라 로그인 단추를 감춥니다 |
| [src/lib/auth/pkce.ts](src/lib/auth/pkce.ts) | PKCE 의 verifier 와 challenge |
| [src/lib/auth/session.ts](src/lib/auth/session.ts) | 로그인 시작, 코드 교환, 토큰 갱신, 로그아웃 |
| [src/lib/api.ts](src/lib/api.ts) | 토큰을 붙여 백엔드를 부릅니다. 화면은 토큰을 직접 다루지 않습니다 |
| [src/app/auth/callback/page.tsx](src/app/auth/callback/page.tsx) | Cognito 가 돌아오는 자리 |
| [src/app/page.tsx](src/app/page.tsx) | 표본 화면. 로그인, 사용자 표시, `GET /items` 호출 |

새 화면을 만들 때는 `api()` 만 부르면 됩니다.

```ts
const data = await api<{ items: Item[] }>('/items')
```

## 주소를 바꿀 때

`/auth/callback` 경로는 [cognito.tf](../../backend/terraform/cognito.tf) 의 `callback_urls` 에
등록돼 있습니다. 경로를 바꾸면 거기도 바꾸고 다시 `apply` 해야 합니다.
문자 하나만 달라도 로그인이 시작조차 되지 않습니다.

배포 주소가 정해지면 `user_app_base_url` 을 채우고 다시 `apply` 합니다.
Cognito 가 바뀐 목록을 반영하는 데 1~2분 걸립니다. 그동안 `redirect_mismatch` 가 나도
설정을 더 고치지 말고 기다립니다.

## 배포

Amplify 앱을 만들 때 모노레포 경로는 `dev/frontend/user-app` 으로 적습니다.
환경변수 `AMPLIFY_MONOREPO_APP_ROOT` 도 같은 값이어야 합니다.

`NEXT_PUBLIC_` 값은 빌드할 때 화면 코드에 박히므로 Amplify 콘솔 환경변수에 넣어 두면
그대로 들어갑니다. 관리자 콘솔처럼 `.env.production` 을 따로 남길 필요가 없습니다.
