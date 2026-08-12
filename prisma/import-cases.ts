// 案件進度表匯入 — Google 試算表「01.案件進度表」→ Project / Task。
// 資料檔 prisma/data/import-cases.json 由本機 xlsx 轉出（一頁籤一專案、一列一任務）。
//
// 跑法（prod，經 GitHub Actions「Import cases」workflow）：
//   docker compose --profile import run --rm import-cases
// 環境變數：
//   DRY_RUN=1  只印將要建立什麼，不寫入（預設 0）
//   SYNC=1     已存在的專案/任務也用 Excel 內容覆寫（預設 0＝只建立缺的，不動系統內既有編輯）
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

const DRY = process.env.DRY_RUN === "1";
const SYNC = process.env.SYNC === "1";

interface TaskIn {
  seq: number;
  title: string;
  descriptionHtml: string | null;
  status: string;
  completedAt: string | null;
  startDate: string | null;
  dueDate: string | null;
  assigneeEmail: string | null;
  category: string[];
  archived: boolean;
}

interface ProjectIn {
  key: string;
  name: string;
  color: string;
  status: string;
  archived: boolean;
  customerName: string | null;
  brandName: string | null;
  category: string[];
  attribute: string | null;
  source: string | null;
  salesName: string | null;
  notes: string;
  fileLinks: { label: string; url: string }[];
  startDate: string | null;
  endDate: string | null;
  tasks: TaskIn[];
}

interface Payload {
  source: string;
  ownerEmail: string;
  teamSlug: string;
  projects: ProjectIn[];
}

// 由頁籤名推導固定 id，重跑同一份資料不會產生第二批
const projectId = (key: string) =>
  "imp-" + createHash("md5").update(key).digest("hex").slice(0, 16);
const taskId = (key: string, seq: number) =>
  `${projectId(key)}-t${String(seq).padStart(4, "0")}`;

const date = (v: string | null) => (v ? new Date(`${v}T00:00:00.000Z`) : null);

async function main() {
  const payload: Payload = JSON.parse(
    readFileSync(join(process.cwd(), "prisma/data/import-cases.json"), "utf8")
  );

  const team = await db.team.findUnique({ where: { slug: payload.teamSlug } });
  if (!team) throw new Error(`找不到團隊 slug=${payload.teamSlug}`);

  const owner = await db.user.findUnique({ where: { email: payload.ownerEmail } });
  if (!owner) throw new Error(`找不到專案負責人 ${payload.ownerEmail}`);

  const emails = [
    ...new Set(
      payload.projects.flatMap((p) =>
        p.tasks.map((t) => t.assigneeEmail).filter((e): e is string => !!e)
      )
    ),
  ];
  const users = await db.user.findMany({
    where: { email: { in: emails } },
    select: { id: true, email: true },
  });
  const userByEmail = new Map(users.map((u) => [u.email, u.id]));
  const missing = emails.filter((e) => !userByEmail.has(e));
  if (missing.length > 0) {
    throw new Error(`這些任務負責人在系統裡查無帳號：${missing.join(", ")}`);
  }

  console.log(
    `[import] 來源=${payload.source} 團隊=${team.name}(${team.slug}) ` +
      `owner=${owner.name} 專案=${payload.projects.length} ` +
      `任務=${payload.projects.reduce((n, p) => n + p.tasks.length, 0)} ` +
      `模式=${DRY ? "DRY_RUN" : SYNC ? "SYNC(覆寫)" : "CREATE_ONLY"}`
  );

  let pCreated = 0,
    pSkipped = 0,
    pUpdated = 0,
    tCreated = 0,
    tSkipped = 0,
    tUpdated = 0;

  for (const p of payload.projects) {
    const id = projectId(p.key);
    const existing = await db.project.findUnique({
      where: { id },
      select: { id: true },
    });

    const projectData = {
      name: p.name,
      color: p.color,
      status: p.status as never,
      archived: p.archived,
      customerName: p.customerName,
      brandName: p.brandName,
      category: p.category,
      attribute: p.attribute,
      source: p.source,
      salesName: p.salesName,
      notes: p.notes,
      fileLinks: p.fileLinks,
      startDate: date(p.startDate),
      endDate: date(p.endDate),
      ownerId: owner.id,
      teamId: team.id,
    };

    if (!existing) {
      if (!DRY) await db.project.create({ data: { id, ...projectData } });
      pCreated++;
    } else if (SYNC) {
      if (!DRY) await db.project.update({ where: { id }, data: projectData });
      pUpdated++;
    } else {
      pSkipped++;
    }

    let position = 0;
    for (const t of p.tasks) {
      const tid = taskId(p.key, t.seq);
      const existingTask = await db.task.findUnique({
        where: { id: tid },
        select: { id: true },
      });
      position += 1024;

      const assigneeId = t.assigneeEmail
        ? userByEmail.get(t.assigneeEmail) ?? null
        : null;
      const taskData = {
        title: t.title,
        description: t.descriptionHtml,
        status: t.status as never,
        priority: "MEDIUM" as never,
        projectId: id,
        category: t.category,
        teamId: null,
        assigneeId,
        startDate: date(t.startDate),
        dueDate: date(t.dueDate),
        completedAt: date(t.completedAt),
        archived: t.archived,
        position,
      };

      if (!existingTask) {
        if (!DRY) {
          await db.task.create({
            data: {
              id: tid,
              ...taskData,
              assignees: assigneeId
                ? { create: [{ userId: assigneeId }] }
                : undefined,
            },
          });
        }
        tCreated++;
      } else if (SYNC) {
        if (!DRY) {
          await db.task.update({
            where: { id: tid },
            data: {
              ...taskData,
              assignees: {
                deleteMany: {},
                create: assigneeId ? [{ userId: assigneeId }] : [],
              },
            },
          });
        }
        tUpdated++;
      } else {
        tSkipped++;
      }
    }
  }

  console.log(
    `[import] 專案 建立=${pCreated} 更新=${pUpdated} 跳過=${pSkipped}｜` +
      `任務 建立=${tCreated} 更新=${tUpdated} 跳過=${tSkipped}` +
      (DRY ? "（DRY_RUN，實際未寫入）" : "")
  );
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error("[import] 失敗：", e);
    await db.$disconnect();
    process.exit(1);
  });
