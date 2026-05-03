// Seed Orion DB — idempotent，可重複執行。
// 跑法：cd app && npx prisma db seed
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  TaskStatus,
  TaskPriority,
} from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

const DAY = 24 * 60 * 60 * 1000;
const today = new Date();
const day = (offset: number) => new Date(today.getTime() + offset * DAY);

// user.id 用 stable prefix，這樣 Google 登入後（callback 用 email upsert）會 update 同一筆，不會重複。
const userFixtures = [
  {
    key: "weider",
    id: "seed-u-weider",
    email: "allways.weider@gmail.com",
    name: "weider",
  },
  { key: "lou", id: "seed-u-lou", email: "lou@orion.local", name: "L OU" },
  {
    key: "sandy",
    id: "seed-u-sandy",
    email: "sandy@orion.local",
    name: "Sandy",
  },
  {
    key: "yixuan",
    id: "seed-u-yixuan",
    email: "yixuan@orion.local",
    name: "YiXuan",
  },
];

const projectFixtures = [
  { id: "p-vivaldi", name: "威瓦第", color: "red", endIn: 7 },
  { id: "p-orvis", name: "奧維斯官網", color: "green", endIn: 32 },
  { id: "p-cms", name: "CMS 模組", color: "orange", endIn: 90 },
  { id: "p-subscription", name: "產品訂閱", color: "purple", endIn: -180 },
  { id: "p-personal", name: "個人", color: "blue", endIn: null },
];

interface TaskFixture {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string | null;
  assigneeKey: string;
  dueOffset: number | null;
}

const taskFixtures: TaskFixture[] = [
  // 尚未開始（5）
  { id: "t-001", title: "forgot password rate-limit 加 IP 黑名單", description: "同一 IP 5 分鐘 5 次失敗即封 1 小時，記 audit log", status: "TODO", priority: "HIGH", projectId: "p-vivaldi", assigneeKey: "lou", dueOffset: 7 },
  { id: "t-002", title: "商品分類 chip hover 顏色微調", status: "TODO", priority: "LOW", projectId: "p-cms", assigneeKey: "weider", dueOffset: 14 },
  { id: "t-003", title: "W18 weekly sync 議程", description: "列 4-29 ~ 5-2 完成 / 卡點 / 下週重點", status: "TODO", priority: "MEDIUM", projectId: "p-personal", assigneeKey: "weider", dueOffset: 2 },
  { id: "t-004", title: "Hero 區 mockup 二輪", status: "TODO", priority: "MEDIUM", projectId: "p-orvis", assigneeKey: "yixuan", dueOffset: 8 },
  { id: "t-005", title: "deploy script 寫 docker-compose", status: "TODO", priority: "MEDIUM", projectId: "p-personal", assigneeKey: "weider", dueOffset: 5 },

  // 進行中（5）
  { id: "t-101", title: "i18n config 拆兩份 schema", description: "首頁池跟內頁池不同 contentText 結構，要拆兩份 config", status: "IN_PROGRESS", priority: "HIGH", projectId: "p-vivaldi", assigneeKey: "weider", dueOffset: 2 },
  { id: "t-102", title: "商品分類多群組 OR/AND 篩選 API", description: "同群組 OR、跨群組 AND，前端 chip 多選", status: "IN_PROGRESS", priority: "HIGH", projectId: "p-cms", assigneeKey: "weider", dueOffset: 3 },
  { id: "t-103", title: "後台 layout scaffold", status: "IN_PROGRESS", priority: "MEDIUM", projectId: "p-orvis", assigneeKey: "yixuan", dueOffset: 13 },
  { id: "t-104", title: ".claude/rules/i18n 12 章沉澱", status: "IN_PROGRESS", priority: "MEDIUM", projectId: "p-personal", assigneeKey: "weider", dueOffset: 0 },
  { id: "t-105", title: "vivaldi product list filter UI", status: "IN_PROGRESS", priority: "MEDIUM", projectId: "p-vivaldi", assigneeKey: "weider", dueOffset: 2 },

  // 等待驗收（3）
  { id: "t-201", title: "vivaldi detail page innerHTML 穿透修補", description: ":host ::ng-deep 處理 Emulated encapsulation 失效", status: "WAITING_REVIEW", priority: "MEDIUM", projectId: "p-vivaldi", assigneeKey: "weider", dueOffset: 0 },
  { id: "t-202", title: "vivaldi article-detail UI 上線", description: "刪舊 preview 改跳測試站，commit ab33285", status: "WAITING_REVIEW", priority: "MEDIUM", projectId: "p-vivaldi", assigneeKey: "weider", dueOffset: -1 },
  { id: "t-203", title: "image-manage popover 取代 mat-menu", status: "WAITING_REVIEW", priority: "MEDIUM", projectId: "p-cms", assigneeKey: "sandy", dueOffset: -2 },

  // 已完成（5）
  { id: "t-301", title: "image-manage Cmd 多選 + Shift 連選", status: "DONE", priority: "MEDIUM", projectId: "p-cms", assigneeKey: "weider", dueOffset: -3 },
  { id: "t-302", title: "i18n schema-driven 全棧重構（7 phase）", status: "DONE", priority: "HIGH", projectId: "p-vivaldi", assigneeKey: "weider", dueOffset: -1 },
  { id: "t-303", title: "商品分類 ProductTagGroup 全鏈路", status: "DONE", priority: "HIGH", projectId: "p-cms", assigneeKey: "weider", dueOffset: -2 },
  { id: "t-304", title: "forgot password 全鏈路 + dialog SCSS partial", status: "DONE", priority: "MEDIUM", projectId: "p-vivaldi", assigneeKey: "weider", dueOffset: -3 },
  { id: "t-305", title: "W17 週報 retro 排程", status: "DONE", priority: "LOW", projectId: "p-personal", assigneeKey: "weider", dueOffset: -4 },
];

async function main() {
  console.log("🌱 Seeding Orion DB...");

  // ==== Users（stable id，Google 登入會 upsert 同一筆）====
  const userIdMap = new Map<string, string>();
  for (const u of userFixtures) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { email: u.email, name: u.name },
      create: { id: u.id, email: u.email, name: u.name },
    });
    userIdMap.set(u.key, u.id);
    console.log(`  user: ${u.name} (${u.email})`);
  }
  const weiderId = userIdMap.get("weider")!;

  // ==== Projects ====
  for (const p of projectFixtures) {
    await prisma.project.upsert({
      where: { id: `seed-${p.id}` },
      update: { name: p.name, color: p.color },
      create: {
        id: `seed-${p.id}`,
        name: p.name,
        color: p.color,
        ownerId: weiderId,
        status: p.id === "p-subscription" ? "DONE" : "IN_PROGRESS",
        startDate: day(-30),
        endDate: p.endIn === null ? null : day(p.endIn),
      },
    });
    console.log(`  project: ${p.name}`);
  }

  // ==== Tasks ====
  let position = 0;
  for (const t of taskFixtures) {
    position += 1024;
    const due = t.dueOffset !== null ? day(t.dueOffset) : null;
    const completed = t.status === "DONE" ? day(t.dueOffset ?? 0) : null;
    await prisma.task.upsert({
      where: { id: `seed-${t.id}` },
      update: {
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: due,
        completedAt: completed,
      },
      create: {
        id: `seed-${t.id}`,
        title: t.title,
        description: t.description ?? null,
        status: t.status,
        priority: t.priority,
        projectId: t.projectId ? `seed-${t.projectId}` : null,
        assigneeId: userIdMap.get(t.assigneeKey),
        position,
        dueDate: due,
        completedAt: completed,
      },
    });
  }
  console.log(`  tasks: seeded ${taskFixtures.length} rows`);

  // ==== Task Dependencies (demo)====
  const dependencies: Array<{ blocker: string; blocked: string }> = [
    { blocker: "t-101", blocked: "t-105" }, // i18n config → product list filter UI（威瓦第）
    { blocker: "t-301", blocked: "t-203" }, // Cmd 多選 → popover 取代 mat-menu（CMS）
    { blocker: "t-001", blocked: "t-005" }, // forgot password → deploy script（個人）
  ];
  for (const dep of dependencies) {
    await prisma.taskDependency.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: `seed-${dep.blocker}`,
          blockedId: `seed-${dep.blocked}`,
        },
      },
      update: {},
      create: {
        blockerId: `seed-${dep.blocker}`,
        blockedId: `seed-${dep.blocked}`,
      },
    });
  }
  console.log(`  dependencies: ${dependencies.length} rows`);

  // ==== Documents ====
  await prisma.document.upsert({
    where: { id: "seed-doc-w17" },
    update: {},
    create: {
      id: "seed-doc-w17",
      name: "2026-W17 weekly sync",
      docType: "MEETING",
      date: day(-3),
      authorId: weiderId,
    },
  });
  await prisma.document.upsert({
    where: { id: "seed-doc-i18n" },
    update: {},
    create: {
      id: "seed-doc-i18n",
      name: "i18n schema-driven 設計沉澱",
      docType: "DEV_NOTE",
      date: day(-1),
      authorId: weiderId,
    },
  });
  console.log("  documents: 2 rows");

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
