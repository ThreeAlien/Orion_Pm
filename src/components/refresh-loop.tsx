// 多人協作 realtime — 用 polling 30 秒 router.refresh()
// 比 SSE / WebSocket 簡單可靠，內部 4 人團隊延遲 30s 完全 OK
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RefreshLoop({ intervalSec = 30 }: { intervalSec?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      // 只在頁面可見時 refresh，背景分頁不浪費
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalSec * 1000);
    return () => clearInterval(id);
  }, [router, intervalSec]);
  return null;
}
