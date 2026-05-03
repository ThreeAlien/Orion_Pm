// Prisma client singleton（避免 Next dev hot reload 重建多個 instance）
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __orion_prisma__: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });

export const db: PrismaClient =
  globalThis.__orion_prisma__ ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.__orion_prisma__ = db;
}
