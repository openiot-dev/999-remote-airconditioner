import type { APIGatewayProxyEventV2 } from "aws-lambda";

export type ApiEvent = APIGatewayProxyEventV2;

export interface ApiResult {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
  isBase64Encoded?: boolean;
}

/** 권한 등급. 숫자 비교가 아니라 이 순서(user < manager < admin)로만 판단한다. */
export type Role = "user" | "manager" | "admin";

export interface AuthContext {
  /** Cognito sub — 사용자 식별자. 이메일은 바뀔 수 있지만 sub 는 안 바뀐다. */
  sub: string;
  role: Role;
  dept: string;
  email?: string;
  name?: string;
}

export interface RouteRequest {
  method: string;
  path: string;
  /** 경로 패턴에서 뽑은 값. 예: "/items/{id}" → { id: "abc" } */
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  /** 키는 전부 소문자로 정규화돼 있다. */
  headers: Record<string, string | undefined>;
  body: unknown;
  /** 인증 없는 라우트(health/webhook)에서는 null. */
  auth: AuthContext | null;
  event: ApiEvent;
}

export type Handler = (req: RouteRequest) => Promise<ApiResult>;
