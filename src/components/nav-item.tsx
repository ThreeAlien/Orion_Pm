"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavItem({
  icon,
  iconColor,
  label,
  href,
  count,
  onClick,
  collapsed,
}: {
  icon: string;
  iconColor?: string;
  label: string;
  href: string;
  count?: number | null;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname?.startsWith(href + "/");

  const base =
    "flex items-center gap-2.5 rounded-lg text-sm transition-colors";
  const sizing = collapsed ? "px-0 py-2 justify-center" : "px-2.5 py-1.5";
  const cls = active
    ? `${base} ${sizing} bg-blue text-white`
    : `${base} ${sizing} text-text hover:bg-rule-soft`;

  return (
    <Link
      href={href}
      className={cls}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      <span
        className="w-[18px] text-center text-[15px] flex-shrink-0"
        style={iconColor ? { color: iconColor } : undefined}
      >
        {icon}
      </span>
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          {count != null && (
            <span
              className={`ml-auto text-xs tabular ${
                active ? "text-white/70" : "text-text-faint"
              }`}
            >
              {count}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
