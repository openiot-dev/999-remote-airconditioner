import type { NextConfig } from "next";

/**
 * 이 화면을 자기 안에 끼워 넣어(iframe) 띄워도 되는 사이트.
 *
 * 세션 쿠키가 SameSite=None 이라 아무 사이트나 이 화면을 끼워 넣으면 로그인된 채로 뜹니다.
 * 투명하게 덮어 클릭을 훔치는 공격(클릭재킹)을 막으려고 노션만 엽니다.
 * 다른 곳에 끼워 넣어야 하면 FRAME_ANCESTORS 에 공백으로 나눠 적습니다. 빌드 때 읽습니다.
 */
const frameAncestors =
  process.env.FRAME_ANCESTORS ??
  "'self' https://notion.so https://*.notion.so https://*.notion.site https://*.notion.com";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors}` }],
      },
    ];
  },
};

export default nextConfig;
