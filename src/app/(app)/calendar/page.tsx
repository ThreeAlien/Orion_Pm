import { CalendarView } from "@/components/calendar-view";
import { fetchCalendarTasks, fetchCalendarRangeTasks } from "@/server/queries";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; m?: string; d?: string }>;
}) {
  const params = await searchParams;
  const view = params.view === "week" ? "week" : "month";
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
    const tasks = await fetchCalendarRangeTasks(weekStart, weekEnd);
    return (
      <CalendarView
        mode="week"
        year={weekStart.getFullYear()}
        month={weekStart.getMonth()}
        weekStart={weekStart}
        tasks={tasks}
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
      const m = Number(match[2]);
      if (!isNaN(y) && !isNaN(m) && m >= 1 && m <= 12) {
        year = y;
        month = m - 1;
      }
    }
  }

  const tasks = await fetchCalendarTasks(year, month);
  return (
    <CalendarView mode="month" year={year} month={month} tasks={tasks} />
  );
}
