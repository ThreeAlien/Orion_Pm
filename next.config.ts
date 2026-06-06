import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署用：產生 minimal standalone bundle 含必要 node_modules
  output: "standalone",
  // 把 prisma migrations + generated client 帶進 standalone
  outputFileTracingIncludes: {
    "/": ["./prisma/**/*", "./src/generated/prisma/**/*"],
  },
  // 自架在 nginx + Cloudflare 反向代理後面：Server Action 會驗 Origin vs Host，
  // proxy 後對不上會噴「Invalid Server Actions request」。把對外網域列為信任來源。
  experimental: {
    serverActions: {
      allowedOrigins: ["orion-pm.allwebs.com.tw"],
    },
  },
};

export default nextConfig;
