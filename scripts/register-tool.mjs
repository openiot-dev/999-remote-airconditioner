#!/usr/bin/env node
// 이 저장소의 툴을 사내 툴 콘솔(openiot-devteam/000-tools-console)에 등록하고, 이후에는 정보를 갱신한다.
//
// 키가 필요 없다. GitHub Actions 가 실행마다 발급하는 증명서(OIDC 토큰)를 콘솔에 보내면,
// 콘솔이 "openiot-devteam 조직의 어느 저장소, 어느 브랜치에서 온 요청인지"를 확인한다.
// 그래서 실제 등록은 GitHub Actions 안에서만 된다. 설치할 패키지 없이 Node 18 이상에서 돈다.
//
// 사용법 (.github/workflows/register-tool.yml 이 부른다)
//   node scripts/register-tool.mjs              tools-console.json 을 읽어 등록 또는 갱신
//   node scripts/register-tool.mjs --soft-fail  실패해도 경고만 남기고 성공으로 끝낸다
//   node scripts/register-tool.mjs --dry-run    보낼 내용만 출력한다 (로컬에서도 된다)
import { existsSync, readFileSync } from 'node:fs';

const DEFAULT_API = 'https://ubaxjiyd64.execute-api.ap-northeast-2.amazonaws.com';
// 콘솔이 받아들이는 증명서 수신자 값. 콘솔 테라폼의 github_oidc_audience 와 같아야 한다.
const AUDIENCE = 'tools-console';
const MANIFEST = 'tools-console.json';
// tools-console.json 에 version 을 적지 않으면 여기서 읽는다.
const VERSION_SOURCE = 'dev/frontend/user-app/package.json';

const args = new Set(process.argv.slice(2));
const API = (process.env.TOOLS_CONSOLE_API || DEFAULT_API).replace(/\/+$/, '');

// GitHub Actions 에서는 실행 요약 화면에도 눈에 띄게 남긴다.
function report(level, message) {
  if (process.env.GITHUB_ACTIONS === 'true') {
    const escaped = message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
    console.log(`::${level} title=툴 콘솔 등록::${escaped}`);
  }
  (level === 'error' ? console.error : console.log)(`[tools-console] ${message}`);
}

function fail(message) {
  const soft = args.has('--soft-fail');
  report(soft ? 'warning' : 'error', message);
  process.exit(soft ? 0 : 1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function readVersion() {
  try {
    const { version } = readJson(VERSION_SOURCE);
    return version ? String(version) : undefined;
  } catch {
    // 사용자 앱을 지운 툴도 있으니 없으면 버전 없이 보낸다.
    return undefined;
  }
}

async function githubToken() {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    fail('GitHub 증명서를 받을 수 없습니다. GitHub Actions 안에서 실행해야 하고, 워크플로에 "permissions: id-token: write" 가 있어야 합니다.');
  }
  const url = new URL(requestUrl);
  url.searchParams.set('audience', AUDIENCE);
  try {
    const res = await fetch(url, {
      headers: { authorization: `bearer ${requestToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) fail(`GitHub 증명서 발급에 실패했습니다 (HTTP ${res.status}).`);
    const { value } = await res.json();
    if (!value) fail('GitHub 증명서 응답이 비어 있습니다.');
    return value;
  } catch (err) {
    fail(`GitHub 증명서를 받는 중 오류가 났습니다: ${err.message}`);
  }
}

// 1. 설정 파일 읽기

if (!existsSync(MANIFEST)) fail(`${MANIFEST} 파일이 없습니다. 저장소 최상단에 있어야 합니다.`);

let manifest;
try {
  manifest = readJson(MANIFEST);
} catch (err) {
  fail(`${MANIFEST} 를 읽을 수 없습니다: ${err.message}`);
}

// 밑줄(_)로 시작하는 항목은 사람을 위한 안내라 보내지 않는다. 비어 있는 값도 보내지 않는다.
const fields = Object.fromEntries(
  Object.entries(manifest).filter(([key, value]) => !key.startsWith('_') && value !== '' && value !== null),
);

if (!fields.name || !fields.url) {
  report('notice', `${MANIFEST} 의 name 과 url 을 채우면 다음 push 때 툴 콘솔에 등록됩니다. 지금은 건너뜁니다.`);
  process.exit(0);
}

const { adminUrl, ...rest } = fields;
const body = {
  ...rest,
  // slug 는 콘솔에서 툴을 구분하는 이름이다. 비워 두면 저장소 이름을 쓴다.
  slug: rest.slug ?? process.env.GITHUB_REPOSITORY?.split('/')[1],
  version: rest.version ?? readVersion(),
};
// 관리자 콘솔 주소는 카드에 바로 보이지 않는 부가 정보로 보낸다.
if (adminUrl) body.metadata = { ...rest.metadata, adminUrl };

if (args.has('--dry-run')) {
  console.log(`[tools-console] POST ${API}/v1/tools`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

// 2. 콘솔에 보내기

const token = await githubToken();

let res;
let payload = {};
try {
  res = await fetch(`${API}/v1/tools`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await res.text();
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
} catch (err) {
  fail(`툴 콘솔에 연결할 수 없습니다 (${API}): ${err.message}`);
}

// 3. 결과 알리기

const tool = payload.tool ?? {};

if (res.status === 201) {
  report('notice', `'${tool.name}' 을(를) 툴 콘솔에 새로 등록했습니다.`);
} else if (res.status === 200) {
  if (payload.linked) report('notice', `콘솔에 이미 있던 '${tool.name}' 을(를) 이 저장소에 연결했습니다.`);
  console.log(`[tools-console] '${tool.name}' 정보를 갱신했습니다. (버전 ${tool.version ?? '없음'})`);
  if (tool.status === 'archived') {
    report('warning', `'${tool.name}' 은(는) 콘솔에서 보관 처리된 상태라 목록에 보이지 않습니다.`);
  }
} else if (res.status === 401 || res.status === 403) {
  fail('툴 콘솔이 이 요청을 거절했습니다. openiot-devteam 조직 저장소의 main 브랜치에서 실행했는지 확인하세요.');
} else {
  fail(`등록에 실패했습니다 (HTTP ${res.status}): ${payload.error?.message ?? payload.message ?? payload.raw ?? ''}`);
}
