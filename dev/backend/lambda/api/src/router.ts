// ─────────────────────────────────────────────────────────────────────────────
// 라우터 — 경로/메서드 → 핸들러.
//
// 함수를 라우트마다 쪼개지 않고 하나로 두는 대신, 인프라가 아니라 이 표가 API 의
// 목차 역할을 한다. 라우트를 추가할 때 Terraform 은 건드리지 않는다.
//
// 계층 규칙:
//   라우터  = 입력 파싱 + "로그인했는가/등급이 되는가" + 응답 모양
//   서비스  = 업무 규칙 + "이 데이터의 주인인가"
// 라우터에 if 가 쌓이기 시작하면 그건 서비스로 내려가야 할 규칙이다.
// ─────────────────────────────────────────────────────────────────────────────
import { requireAuth } from "./shared/auth.ts";
import type { ApiResult, Handler, RouteRequest } from "./shared/aws.types.ts";
import { notFound } from "./shared/errors.ts";
import { presignUpload } from "./shared/files.ts";
import { parseLimit } from "./shared/pagination.ts";
import { created, ok, parseBody } from "./shared/response.ts";
import { requireWebhookSecret } from "./shared/webhook-auth.ts";

import { listAudit } from "./domain/audit/audit.repository.ts";
import { createItemSchema, updateItemSchema } from "./domain/item/item.model.ts";
import {
  createItem,
  getItemFor,
  listMyItems,
  updateItem,
} from "./domain/item/item.service.ts";

// ── 공개 ────────────────────────────────────────────────────────────────────
// 배포가 살아 있는지 확인하는 용도. 여기서 DB 를 찌르지 않는다 —
// 헬스체크가 DB 장애에 같이 죽으면 "무엇이 고장났는지" 구분할 수 없게 된다.
const health: Handler = async () =>
  ok({ ok: true, env: process.env.ENV ?? "dev", ts: new Date().toISOString() });

// ── 내 정보 ─────────────────────────────────────────────────────────────────
// 프론트가 로그인 직후 호출해 화면(메뉴/권한)을 정하는 데 쓴다. 토큰 클레임을 그대로 돌려준다.
const me: Handler = async (req) => {
  const auth = requireAuth(req.auth);
  return ok({ sub: auth.sub, email: auth.email, name: auth.name, role: auth.role, dept: auth.dept });
};

// ── 내 아이템 ───────────────────────────────────────────────────────────────
const listMine: Handler = async (req) => {
  const auth = requireAuth(req.auth);
  return ok(await listMyItems(auth, parseLimit(req.query.limit), req.query.cursor));
};

const create: Handler = async (req) => {
  const auth = requireAuth(req.auth);
  return created(await createItem(auth, parseBody(createItemSchema, req.body)));
};

const getMine: Handler = async (req) => {
  const auth = requireAuth(req.auth);
  return ok(await getItemFor(auth, auth.sub, req.params.id));
};

const updateMine: Handler = async (req) => {
  const auth = requireAuth(req.auth);
  return ok(await updateItem(auth, auth.sub, req.params.id, parseBody(updateItemSchema, req.body)));
};

const auditMine: Handler = async (req) => {
  const auth = requireAuth(req.auth);
  await getItemFor(auth, auth.sub, req.params.id); // 접근 권한 확인 겸 존재 확인
  return ok({ items: await listAudit(req.params.id) });
};

// ── 첨부 업로드 ─────────────────────────────────────────────────────────────
// 파일 자체는 Lambda 를 통과하지 않는다. 브라우저가 이 URL 로 S3 에 직접 PUT 하고,
// 응답으로 받은 key 를 아이템 생성/수정 요청의 fileKey 로 보낸다.
const uploadUrl: Handler = async (req) => {
  const auth = requireAuth(req.auth);
  const b = (req.body ?? {}) as { fileName?: string; contentType?: string };
  return ok(
    await presignUpload(
      auth.sub,
      b.fileName ?? "upload.bin",
      b.contentType ?? "application/octet-stream",
    ),
  );
};

// ── 관리자 ──────────────────────────────────────────────────────────────────
// 여기에는 라우트가 없다. 일부러 비워 두었다.
//
// 공용 사용자 풀에는 custom:role 속성이 없다(describe-user-pool 로 확인). 그래서
// requireRole(..., "admin") 이 걸린 라우트는 "아직" 403 이 아니라 "구조상 언제나" 403 이다.
// 표본으로 두면 복사해서 관리자 기능을 다 만든 뒤에야 아무도 쓸 수 없다는 것을 알게 된다.
//
// 켜는 데 필요한 것과 서비스 계층에 이미 있는 재료는 shared/auth.ts 의 requireRole 주석에 있다.
//
// ── 웹훅 ────────────────────────────────────────────────────────────────────
// Cognito 를 타지 않는 라우트다(apigw.tf 에서 열어 뒀다). 검증은 여기서 직접 한다 —
// requireWebhookSecret 을 빼먹으면 인터넷 전체에 열린 엔드포인트가 된다.
const webhook: Handler = async (req) => {
  await requireWebhookSecret(req.headers);
  console.log("webhook", { source: req.params.source, body: req.body });
  // 외부 서비스는 대개 2초 안에 200 을 못 받으면 재시도한다. 무거운 일은 여기서 하지 말고
  // 큐/비동기로 넘기고 즉시 200 을 돌려준다.
  return ok({ received: true });
};

// ─────────────────────────────────────────────────────────────────────────────
// 라우트 표. 위에서부터 먼저 맞는 것이 이긴다 — 구체적인 경로를 위에 둔다.
// ─────────────────────────────────────────────────────────────────────────────
const ROUTES: [method: string, pattern: string, handler: Handler][] = [
  ["GET", "/health", health],
  ["GET", "/me", me],

  ["GET", "/items", listMine],
  ["POST", "/items", create],
  ["GET", "/items/{id}/audit", auditMine],
  ["GET", "/items/{id}", getMine],
  ["PATCH", "/items/{id}", updateMine],

  ["POST", "/files/upload-url", uploadUrl],

  ["POST", "/webhook/{source}", webhook],
];

/** "/items/{id}" 같은 패턴을 실제 경로에 맞춰 보고, 맞으면 뽑은 파라미터를 돌려준다.
 *  정규식으로 바꾸지 않는 이유: 경로 조각 수가 같아야 매치되는 규칙을 그대로 드러내기 위해서다. */
export function matchPath(
  pattern: string,
  path: string,
): Record<string, string> | null {
  const p = pattern.split("/");
  const a = path.split("/");
  if (p.length !== a.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    if (seg.startsWith("{") && seg.endsWith("}")) {
      if (!a[i]) return null; // 빈 조각("/items//audit")은 매치로 치지 않는다
      params[seg.slice(1, -1)] = decodeURIComponent(a[i]);
    } else if (seg !== a[i]) {
      return null;
    }
  }
  return params;
}

export async function dispatch(req: RouteRequest): Promise<ApiResult> {
  for (const [method, pattern, handler] of ROUTES) {
    if (method !== req.method) continue;
    const params = matchPath(pattern, req.path);
    if (!params) continue;
    return handler({ ...req, params });
  }
  throw notFound(`${req.method} ${req.path}`);
}

/** 라우트 목록(문서·테스트용). "GET /items/{id}" 같은 문자열 배열. */
export const routeTable = ROUTES.map(([m, p]) => `${m} ${p}`);
