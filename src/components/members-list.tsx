// 團隊成員頁 — 列出所有 User（Google 登入後自動 upsert 進來）
import type { ViewMember } from "@/server/queries";
import { RemoveMemberButton } from "./remove-member-button";

const GRADIENT_MAP: Record<"w" | "l" | "s" | "y", string> = {
  w: "from-blue to-purple",
  l: "from-green to-teal",
  s: "from-pink to-orange",
  y: "from-purple to-pink",
};

export function MembersList({
  members,
  currentUserId,
}: {
  members: ViewMember[];
  currentUserId?: string;
}) {
  return (
    <div className="bg-surface rounded-2xl p-6 shadow-soft flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3.5 mb-5 flex-wrap">
        <h1 className="text-[28px] font-bold tracking-tight">團隊成員</h1>
        <span className="text-[13px] text-text-dim tabular">
          {members.length} 人
        </span>
        <div className="flex-1" />
      </div>

      <div className="bg-blue/[.06] border-l-[3px] border-blue rounded-lg px-4 py-3 mb-5 text-xs text-text-dim leading-relaxed">
        💡 <b className="text-text">自動納入</b> — Google
        登入後系統會自動把帳號加進團隊（用 email 比對），名稱跟頭像從 Google profile
        抓。在 GCP OAuth consent screen 加 test user 才能登入；不要的成員可在這裡看到後
        從 GCP 移除。
      </div>

      <div className="flex-1 overflow-auto -mx-6 px-6">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              currentUserId={currentUserId}
            />
          ))}
        </div>

        {members.length === 0 && (
          <div className="text-center text-text-faint py-16 text-sm">
            還沒有成員 — Google 登入後自動加入
          </div>
        )}
      </div>
    </div>
  );
}

function MemberCard({
  member,
  currentUserId,
}: {
  member: ViewMember;
  currentUserId?: string;
}) {
  const isGoogleAccount = !member.email.endsWith("@orion.local");
  const isSelf = member.id === currentUserId;
  return (
    <div
      className="bg-surface-2 rounded-xl p-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-start gap-3 mb-3">
        {member.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={member.image}
            alt={member.name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div
            className={`w-12 h-12 rounded-full bg-gradient-to-br ${
              GRADIENT_MAP[member.gradient]
            } text-white font-bold text-lg flex items-center justify-center`}
          >
            {member.initial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-base tracking-tight truncate">
              {member.name}
            </span>
            {isGoogleAccount ? (
              <span
                className="text-[10px] px-1.5 py-0.5 bg-blue/[.12] text-blue rounded font-semibold"
                title="Google 登入帳號"
              >
                Google
              </span>
            ) : (
              <span
                className="text-[10px] px-1.5 py-0.5 bg-rule text-text-faint rounded font-semibold"
                title="Demo 帳號（seed 灌進來的）"
              >
                Demo
              </span>
            )}
          </div>
          <div className="text-[11px] text-text-dim truncate mt-0.5">
            {member.email}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-rule">
        <Stat label="負責專案" value={member.ownedProjects} />
        <Stat label="進行中" value={member.activeTasks} />
        <Stat label="總任務" value={member.assignedTasks} />
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-rule">
        <span className="text-[10px] text-text-faint tabular">
          加入於 {fmt(member.joinedAt)}
        </span>
        <RemoveMemberButton
          memberId={member.id}
          memberName={member.name}
          isSelf={isSelf}
          currentUserId={currentUserId}
          ownedProjects={member.ownedProjects}
        />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-base font-bold tabular">{value}</div>
      <div className="text-[10px] text-text-faint">{label}</div>
    </div>
  );
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
