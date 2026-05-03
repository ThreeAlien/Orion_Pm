// Cover 全部 (app) 子路由的共用 loading skeleton
// — 點擊 sidebar 切頁時立即顯示，避免凍結 1 秒沒回饋。
// 用 animate-pulse 的中性灰塊代表標題/卡片/列表，套用跟頁面同一個外殼。
export default function Loading() {
  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3.5 mb-5 flex-wrap">
        <div className="h-8 w-40 rounded bg-rule animate-pulse" />
        <div className="h-5 w-20 rounded-full bg-rule-soft animate-pulse" />
      </div>

      <div className="flex gap-3 mb-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-7 w-24 rounded-full bg-rule-soft animate-pulse" />
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="bg-surface-2 rounded-xl p-4 flex flex-col gap-3 animate-pulse"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="h-5 w-3/4 rounded bg-rule" />
            <div className="h-3 w-full rounded bg-rule-soft" />
            <div className="h-3 w-2/3 rounded bg-rule-soft" />
            <div className="flex gap-2 mt-2">
              <div className="h-6 w-16 rounded-full bg-rule-soft" />
              <div className="h-6 w-12 rounded-full bg-rule-soft" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
