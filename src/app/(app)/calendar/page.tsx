import { CalendarView } from "@/components/calendar-view";
import { fetchCalendarTasks, fetchCalendarRangeTasks } from "@/server/queries";
import { getTeamScope, inTeamScope } from "@/lib/team-scope";
import { listGoogleEvents } from "@/server/google-calendar";
import { auth } from "@/auth";
import type { CalEventItem, GoogleCalStatus, ProjectColor } from "@/lib/data";

// 從任務集合推導出現過的專案（給行事曆篩選 chip 用），去重、依名稱排序
function deriveCalProjects(
  tasks: {
    projectId: string | null;
    projectName: string | null;
    projectColor: ProjectColor | null;
  }[]
) {
  const map = new Map<
    string,
    { id: string; name: string; color: ProjectColor | null }
  >();
  for (const t of tasks) {
    if (t.projectId && !map.has(t.projectId)) {
      map.set(t.projectId, {
        id: t.projectId,
        name: t.projectName ?? "（未命名）",
        color: t.projectColor,
      });
    }
  }
  return [...map.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-Hant")
  );
}

// 讀登入者的 Google 事件（純 proxy）+ 回傳狀態（未連結 / 授權過期 → 前台提示重新登入）
async function loadGoogleEvents(
  userId: string | undefined,
  start: Date,
  end: Date
): Promise<{ events: CalEventItem[]; status: GoogleCalStatus }> {
  if (!userId) return { events: [], status: "no_token" };
  let res;
  try {
    res = await listGoogleEvents(userId, start, end);
  } catch {
    // 網路 / 例外不能讓整個行事曆頁 500，降級成讀取失敗提示
    return { events: [], status: "api_error" };
  }
  if (!res.ok) return { events: [], status: res.reason };
  return {
    events: res.events.map((e) => ({
      googleEventId: e.googleEventId,
      title: e.title,
      description: e.description,
      location: e.location,
      startIso: e.start.toISOString(),
      endIso: e.end.toISOString(),
      allDay: e.allDay,
    })),
    status: "ok",
  };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    m?: string;
    d?: string;
    project?: string;
  }>;
}) {
  const params = await searchParams;
  const view = params.view === "week" ? "week" : "month";
  const activeProject = params.project;
  const scope = await getTeamScope();
  const session = await auth();
  const uid = session?.user?.id;
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  if (view === "week") {
    let anchor = now;
    if (params.d) {
      const m = params.d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        if (!isNaN(d.getTime())) anchor = d;
      }
    }
    const weekStart = new Date(anchor);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const scoped = (await fetchCalendarRangeTasks(weekStart, weekEnd)).filter(
      (t) => inTeamScope(t.teamSlug, scope)
    );
    const filterProjects = deriveCalProjects(scoped);
    const tasks = activeProject
      ? scoped.filter((t) => t.projectId === activeProject)
      : scoped;
    const { events, status } = await loadGoogleEvents(uid, weekStart, weekEnd);
    return (
      <CalendarView
        mode="week"
        year={weekStart.getFullYear()}
        month={weekStart.getMonth()}
        weekStart={weekStart}
        tasks={tasks}
        events={events}
        googleStatus={status}
        filterProjects={filterProjects}
        activeProject={activeProject}
      />
    );
  }

  // month
  let year = now.getFullYear();
  let month = now.getMonth();
  if (params.m) {
    const match = params.m.match(/^(\d{4})-(\d{1,2})$/);
    if (match) {
      const y = Number(match[1]);
      const mm = Number(match[2]);
      if (!isNaN(y) && !isNaN(mm) && mm >= 1 && mm <= 12) {
        year = y;
        month = mm - 1;
      }
    }
  }

  const scoped = (await fetchCalendarTasks(year, month)).filter((t) =>
    inTeamScope(t.teamSlug, scope)
  );
  const filterProjects = deriveCalProjects(scoped);
  const tasks = activeProject
    ? scoped.filter((t) => t.projectId === activeProject)
    : scoped;
  // 涵蓋月曆網格前後補格（上/下個月露出的日子）
  const gStart = new Date(year, month, -6);
  const gEnd = new Date(year, month + 1, 8);
  const { events, status } = await loadGoogleEvents(uid, gStart, gEnd);
  return (
    <CalendarView
      mode="month"
      year={year}
      month={month}
      tasks={tasks}
      events={events}
      googleStatus={status}
      filterProjects={filterProjects}
      activeProject={activeProject}
    />
  );
}
