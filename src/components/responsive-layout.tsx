// 整套 layout 的 client wrapper —— 含 sidebar (desktop sticky / mobile drawer) + topbar + main
"use client";

import { useState } from "react";
import type { ViewProject, ViewUser } from "@/lib/data";
import { resolveProjectColor } from "@/lib/data";
import { NavItem } from "./nav-item";
import { Topbar } from "./topbar";
import { signOut } from "next-auth/react";

export function ResponsiveLayout({
  projects,
  users,
  sessionUser,
  currentUserId,
  children,
}: {
  projects: ViewProject[];
  users: ViewUser[];
  sessionUser: { name: string; image: string | null } | null;
  currentUserId: string | undefined;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const totalTasks = projects.reduce((sum, p) => sum + p.taskCount, 0);
  const closeMobile = () => setMobileOpen(false);
  const toggleCollapse = () => setCollapsed((c) => !c);

  // grid template column 動態：collapsed 時 60px，否則 240px
  const gridClass = collapsed
    ? "min-h-screen p-3 gap-3 md:grid md:grid-cols-[60px_1fr] flex flex-col"
    : "min-h-screen p-3 gap-3 md:grid md:grid-cols-[240px_1fr] flex flex-col";

  // sidebar 寬度：mobile drawer 固定 260px，desktop 隨 collapsed 切換 ('w-auto' 由 grid track 決定)
  const sidebarClass = `bg-surface rounded-2xl ${
    collapsed ? "p-2" : "p-3"
  } flex flex-col shadow-soft z-40 fixed top-3 left-3 h-[calc(100dvh-1.5rem)] w-[260px] transition-all duration-200 ease-out md:sticky md:top-3 md:left-auto md:w-auto md:translate-x-0 ${
    mobileOpen ? "translate-x-0" : "-translate-x-[110%] md:translate-x-0"
  }`;

  return (
    <div className={gridClass}>
      {/* Mobile backdrop */}
      <div
        onClick={closeMobile}
        className={`md:hidden fixed inset-0 bg-black/30 backdrop-blur-[2px] z-30 transition-opacity duration-200 ${
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />

      {/* Sidebar */}
      <aside className={sidebarClass}>
        <div
          className={`flex items-center pt-1.5 pb-4 ${
            collapsed
              ? "justify-center px-0"
              : "gap-2.5 px-2"
          }`}
        >
          <div className="w-[30px] h-[30px] rounded-lg bg-gradient-to-br from-orange to-pink text-white font-bold text-sm flex items-center justify-center shadow-[0_2px_6px_rgba(255,149,0,0.28)] flex-shrink-0">
            O
          </div>
          {!collapsed && (
            <>
              <div className="font-semibold text-base tracking-tight">Orion</div>
              <div className="flex-1" />
              {/* Desktop collapse button */}
              <button
                type="button"
                onClick={toggleCollapse}
                className="hidden md:flex w-7 h-7 rounded-md text-text-faint hover:text-text hover:bg-rule-soft items-center justify-center text-sm cursor-pointer"
                title="收合側邊欄"
                aria-label="收合側邊欄"
              >
                ‹
              </button>
            </>
          )}
        </div>

        {/* Collapsed 時顯示展開按鈕（icon 下方一格）*/}
        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapse}
            className="hidden md:flex w-9 h-7 mb-2 mx-auto rounded-md text-text-faint hover:text-text hover:bg-rule-soft items-center justify-center text-sm cursor-pointer"
            title="展開側邊欄"
            aria-label="展開側邊欄"
          >
            ›
          </button>
        )}

        <NavBlock label="主要" collapsed={collapsed}>
          <NavItem
            icon="⌂"
            label="儀表板"
            href="/"
            onClick={closeMobile}
            collapsed={collapsed}
          />
          <NavItem
            icon="◇"
            label="專案"
            href="/projects"
            count={projects.length}
            onClick={closeMobile}
            collapsed={collapsed}
          />
          <NavItem
            icon="✓"
            label="任務"
            href="/tasks"
            count={totalTasks}
            onClick={closeMobile}
            collapsed={collapsed}
          />
          <NavItem
            icon="▦"
            label="甘特圖"
            href="/gantt"
            onClick={closeMobile}
            collapsed={collapsed}
          />
          <NavItem
            icon="▤"
            label="行事曆"
            href="/calendar"
            onClick={closeMobile}
            collapsed={collapsed}
          />
          <NavItem
            icon="◰"
            label="文件"
            href="/documents"
            onClick={closeMobile}
            collapsed={collapsed}
          />
          <NavItem
            icon="👥"
            label="成員"
            href="/members"
            onClick={closeMobile}
            collapsed={collapsed}
          />
          <NavItem
            icon="📦"
            label="封存區"
            href="/archive"
            onClick={closeMobile}
            collapsed={collapsed}
          />
        </NavBlock>

        {projects.filter((p) => p.taskCount > 0).length > 0 && (
          <NavBlock label="專案" collapsed={collapsed}>
            {projects
              .filter((p) => p.taskCount > 0)
              .map((p) => (
                <NavItem
                  key={p.id}
                  icon="●"
                  iconColor={resolveProjectColor(p.color)}
                  label={p.name}
                  href={`/projects/${p.id}`}
                  count={p.taskCount}
                  onClick={closeMobile}
                  collapsed={collapsed}
                />
              ))}
          </NavBlock>
        )}

        <UserMenu user={sessionUser} collapsed={collapsed} />
      </aside>

      {/* Main */}
      <main className="flex flex-col gap-3 min-w-0">
        <Topbar
          projects={projects}
          users={users}
          currentUserId={currentUserId}
          onMobileMenuOpen={() => setMobileOpen(true)}
        />
        {children}
      </main>
    </div>
  );
}

function NavBlock({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-[18px]">
      {!collapsed && (
        <div className="px-2.5 pt-1.5 pb-1 text-[11px] text-text-faint font-semibold uppercase tracking-wider">
          {label}
        </div>
      )}
      {children}
    </div>
  );
}

function UserMenu({
  user,
  collapsed,
}: {
  user: { name: string; image: string | null } | null;
  collapsed?: boolean;
}) {
  if (!user) {
    return (
      <div className="mt-auto p-2.5 flex items-center gap-2.5 rounded-lg text-text-dim text-xs">
        {collapsed ? "—" : "未登入"}
      </div>
    );
  }

  const initial = user.name[0]?.toUpperCase() ?? "?";

  if (collapsed) {
    return (
      <div className="mt-auto flex flex-col items-center gap-1.5 pt-2">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name}
            className="w-8 h-8 rounded-full object-cover"
            title={user.name}
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full bg-gradient-to-br from-blue to-purple text-white font-semibold text-[13px] flex items-center justify-center"
            title={user.name}
          >
            {initial}
          </div>
        )}
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-7 h-7 rounded-md text-text-faint hover:text-red hover:bg-red/[.08] flex items-center justify-center cursor-pointer"
          title="登出"
        >
          ↩
        </button>
      </div>
    );
  }

  return (
    <div className="mt-auto p-2.5 flex items-center gap-2.5 rounded-lg hover:bg-rule-soft group">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.image}
          alt={user.name}
          className="w-8 h-8 rounded-full object-cover"
        />
      ) : (
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue to-purple text-white font-semibold text-[13px] flex items-center justify-center">
          {initial}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[13px] truncate">{user.name}</div>
        <div className="text-[11px] text-text-dim">線上</div>
      </div>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="w-7 h-7 rounded-md text-text-faint hover:text-red hover:bg-red/[.08] flex items-center justify-center cursor-pointer transition-opacity"
        title="登出"
      >
        ↩
      </button>
    </div>
  );
}
