// esbuild 번들 → dist/*.mjs (ESM, node22, arm64 Lambda).
// 핸들러 두 개가 zip 하나에 들어간다(terraform/lambda.tf 의 archive_file 이 dist/ 를 묶는다):
//   index.mjs     → API Gateway   (handler "index.handler")
//   scheduled.mjs → EventBridge   (handler "scheduled.handler")
//
// @aws-sdk 를 external 로 빼지 않고 번들에 포함시킨다. Lambda 런타임에도 SDK 가 있지만
// 버전이 언제 바뀔지 알 수 없어, 로컬에서 테스트한 그 버전이 그대로 올라가게 한다.
import { build } from "esbuild";
import { rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  minify: false,
  // ESM 출력 안에서 전이 의존성이 require() 를 쓰는 경우를 위한 shim.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
};

await build({ ...common, entryPoints: ["src/index.ts"], outfile: "dist/index.mjs" });
await build({ ...common, entryPoints: ["src/scheduled.ts"], outfile: "dist/scheduled.mjs" });

console.log("built dist/index.mjs, dist/scheduled.mjs");
