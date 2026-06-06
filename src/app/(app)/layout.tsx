import { AppShell } from "@/components/shell";
import { NotificationManager } from "@/components/notification-manager";
import { RefreshLoop } from "@/components/refresh-loop";
import { fetchUpcomingTasks } from "@/server/queries";

// 登入後的儀表板皆為依使用者即時查 DB 的動態頁面，不可在 build 時靜態預渲染
// （否則 next build 會嘗試 prerender 並連 DB → P1001）。
// 設在 layout 會連同底下所有 (app) 子頁一併強制動態渲染。
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const upcoming = await fetchUpcomingTasks();
  return (
    <AppShell>
      {children}
      <NotificationManager upcoming={upcoming} />
      <RefreshLoop intervalSec={30} />
    </AppShell>
  );
}
