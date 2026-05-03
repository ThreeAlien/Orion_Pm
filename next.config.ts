import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker 部署用：產生 minimal standalone bundle 含必要 node_modules
  output: "standalone",
  // 把 prisma migrations + generated client 帶進 standalone
  outputFileTracingIncludes: {
    "/": ["./prisma/**/*", "./src/generated/prisma/**/*"],
  },
};

export default nextConfig;
