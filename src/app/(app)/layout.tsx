import { AppShell } from "@/components/shell";
import { NotificationManager } from "@/components/notification-manager";
import { RefreshLoop } from "@/components/refresh-loop";
import { fetchUpcomingTasks } from "@/server/queries";

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
