import type { ApiEvent, AuthContext, Role } from "./aws.types.ts";
import { forbidden, unauthorized } from "./errors.ts";

// 등급 비교용. 문자열 비교가 아니라 이 표를 통해서만 판단한다.
const RANK: Record<Role, number> = { user: 1, manager: 2, admin: 3 };

interface JwtCtx {
  authorizer?: { jwt?: { claims?: Record<string, unknown> } };
}

/** API Gateway 의 JWT authorizer 가 검증해 이벤트에 붙여 준 클레임을 꺼낸다.
 *  서명 검증은 게이트웨이가 이미 했다 — 여기서 토큰을 다시 파싱하지 않는다.
 *  authorizer 를 타지 않는 라우트(health/webhook)에서는 null 이다. */
export function extractAuth(event: ApiEvent): AuthContext | null {
  const claims = (event.requestContext as unknown as JwtCtx).authorizer?.jwt?.claims;
  if (!claims) return null;

  const sub = String(claims.sub ?? "");
  if (!sub) return null;

  // 알 수 없는 값이 오면 가장 낮은 권한으로 떨어뜨린다(fail closed).
  const raw = String(claims["custom:role"] ?? "user");
  const role: Role = raw === "admin" || raw === "manager" ? raw : "user";

  return {
    sub,
    role,
    dept: String(claims["custom:dept"] ?? ""),
    email: typeof claims.email === "string" ? claims.email : undefined,
    name: claims.name ? String(claims.name) : undefined,
  };
}

export function requireAuth(auth: AuthContext | null): AuthContext {
  if (!auth) throw unauthorized();
  return auth;
}

/**
 * 등급 확인. **지금은 어떤 사용자도 admin 이나 manager 가 되지 못한다.**
 *
 * 왜 안 되는가
 *   1. 공용 사용자 풀 ap-northeast-2_pjubwRozp 에는 커스텀 속성이 하나도 없다.
 *      확인: aws cognito-idp describe-user-pool --user-pool-id ap-northeast-2_pjubwRozp \
 *              --query 'UserPool.SchemaAttributes[].Name'
 *      그래서 위 extractAuth 의 claims["custom:role"] 은 언제나 undefined 이고 "user" 로 떨어진다.
 *   2. 속성을 만들어도 앱 클라이언트의 read_attributes 가 ["email","email_verified"] 뿐이라
 *      토큰에 실리지 않는다(cognito.tf).
 *
 * 그래서 이 함수를 쓰던 /admin/* 라우트는 router.ts 에서 뺐다. 다 만든 뒤에 403 을 발견하는
 * 것보다 처음부터 없는 편이 낫다.
 *
 * 켜려면 셋 다 해야 한다. 1번은 공용 풀을 바꾸는 일이라 이 저장소만의 결정이 아니다.
 *   1. 공용 풀에 custom:role 속성 추가 (모든 팀의 모든 툴에 영향)
 *   2. cognito.tf 의 read_attributes 에 "custom:role" 추가
 *      write_attributes 에는 절대 넣지 않는다. 넣으면 사용자가 스스로 admin 이 된다.
 *   3. 값을 누가 언제 넣을지 정하기
 *
 * 재료는 이미 있다. item.service.ts 의 listItemsByStatus(상태별 전체 목록), deleteItem(삭제),
 * assertCanAccess 의 관리자 우회, dynamodb.tf 의 gsi_status_created 인덱스가 그대로 남아 있다.
 * 라우트만 다시 이으면 된다.
 *
 * 등급을 아예 쓰지 않기로 했다면 이 함수와 hasRole, Role 타입을 지우면 된다.
 */
export function requireRole(auth: AuthContext | null, min: Role): AuthContext {
  const a = requireAuth(auth);
  if (RANK[a.role] < RANK[min]) throw forbidden(`${min} 권한이 필요합니다`);
  return a;
}

export function hasRole(auth: AuthContext, min: Role): boolean {
  return RANK[auth.role] >= RANK[min];
}
