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

## Deploy（Vercel — 現行 production）

push `main` → Vercel 自動 build + 部署。prod DB 是 Neon（serverless，閒置會休眠）。

> **build 不跑 migration。** build script 刻意只有 `prisma generate && next build`，不含
> `prisma migrate deploy`。原因：Neon 休眠時 build 階段連不到 DB（P1001）會讓整個部署失敗、
> 線上卡舊版。所以 build 完全不碰 DB。

**改了 schema 要上 prod 時**，push 前先手動套 migration：
```bash
npm run db:migrate          # 本機產生 migration
npm run db:deploy:prod      # 套到 Neon prod（讀 .env 的 PROD_DATABASE_URL）
git push                    # 再推，觸發 Vercel 部署
```
純前端 / 沒動 schema 的改動，直接 push 即可。
