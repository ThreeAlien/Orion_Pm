"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyProfile } from "@/server/actions";
import { resolveProjectColor } from "@/lib/data";

const AVATAR_SWATCHES = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
];

// 把選的圖檔置中裁成正方形、縮到 size px、壓成 webp data URL（無物件儲存，直接存 DB）。
function fileToWebp(file: File, size = 128): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas ctx"));
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        resolve(canvas.toDataURL("image/webp", 0.85));
      };
      img.onerror = () => reject(new Error("圖片讀取失敗"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("檔案讀取失敗"));
    reader.readAsDataURL(file);
  });
}

export function EditProfileButton({
  name: initialName,
  image,
  avatarColor,
  children,
}: {
  name: string;
  image: string | null;
  avatarColor: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialName);
  // avatar：undefined = 不變動；string = 新頭貼；null = 清掉自訂回退 Google
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined);
  const [preview, setPreview] = useState<string | null>(image);
  const [color, setColor] = useState<string>(avatarColor ?? "blue");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setAvatar(undefined);
      setPreview(image);
      setColor(avatarColor ?? "blue");
      setSaving(false);
      setError(null);
    }
  }, [open, initialName, image, avatarColor]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("請選圖片檔");
      return;
    }
    try {
      const webp = await fileToWebp(file);
      setAvatar(webp);
      setPreview(webp);
      setError(null);
    } catch {
      setError("圖片處理失敗，換一張試試");
    }
  }

  function handleClearAvatar() {
    setAvatar(null);
    setPreview(null);
  }

  function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const res = await updateMyProfile({
        name: name.trim(),
        // undefined 時不送 avatarUrl（維持原值）；null 清除；string 更新
        ...(avatar !== undefined ? { avatarUrl: avatar } : {}),
        avatarColor: color || null,
      });
      setSaving(false);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      {/* 整張卡片可點：hover 浮起 + 藍框 + 右上角浮現「編輯」提示 */}
      <div
        onClick={() => setOpen(true)}
        title="點擊編輯個人資料"
        className="relative group bg-surface-2 rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-card-hover hover:ring-1 hover:ring-blue/40"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        {children}
        <span className="absolute top-2.5 right-2.5 text-[10px] px-1.5 py-0.5 rounded bg-blue/[.12] text-blue font-semibold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          ✏ 編輯
        </span>
      </div>

      <div
        className={`fixed inset-0 bg-black/30 backdrop-blur-[2px] transition-opacity duration-200 z-40 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
      />
      <div
        className={`fixed left-1/2 top-1/2 -translate-x-1/2 z-50 w-[420px] max-w-[92vw] bg-surface rounded-2xl shadow-2xl transition-all duration-200 ${
          open
            ? "opacity-100 scale-100 -translate-y-1/2"
            : "opacity-0 scale-95 -translate-y-[55%] pointer-events-none"
        }`}
      >
        <div className="px-6 py-4 border-b border-rule flex items-center gap-3">
          <h2 className="text-lg font-bold tracking-tight">編輯個人資料</h2>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-8 h-8 rounded-lg bg-rule-soft hover:bg-rule flex items-center justify-center text-text-dim text-base cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* 頭貼 */}
          <div className="flex items-center gap-4">
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview}
                alt="頭貼預覽"
                className="w-16 h-16 rounded-full object-cover ring-1 ring-rule"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full text-white font-bold text-2xl flex items-center justify-center"
                style={{ background: resolveProjectColor(color) }}
              >
                {name[0]?.toUpperCase() ?? "?"}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-blue/[.1] hover:bg-blue/[.16] text-blue text-[13px] font-semibold cursor-pointer"
              >
                上傳頭貼
              </button>
              {preview && (
                <button
                  type="button"
                  onClick={handleClearAvatar}
                  className="px-3 py-1 rounded-lg text-text-faint hover:text-red text-[11px] cursor-pointer text-left"
                >
                  移除自訂頭貼
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleFile}
              className="hidden"
            />
          </div>

          {/* 頭貼底色 — 沒上傳照片時生效（用名字首字 + 這個底色）*/}
          {!preview && (
            <div>
              <div className="text-[11px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
                頭貼底色
              </div>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_SWATCHES.map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setColor(tok)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs transition-transform ${
                      color === tok
                        ? "ring-2 ring-text ring-offset-2 ring-offset-surface scale-105"
                        : "hover:scale-105"
                    }`}
                    style={{ background: resolveProjectColor(tok) }}
                    title={tok}
                  >
                    {color === tok ? "✓" : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 姓名 */}
          <label className="block">
            <div className="text-[11px] text-text-faint font-semibold uppercase tracking-wider mb-1.5">
              姓名
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              className="w-full bg-surface-2 border border-rule rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue focus:bg-surface"
              placeholder="顯示名稱"
            />
          </label>

          {error && <div className="text-xs text-red">{error}</div>}
        </div>

        <div className="px-6 py-3 border-t border-rule flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 bg-rule-soft hover:bg-rule rounded-lg font-medium text-sm text-text-dim cursor-pointer"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="bg-blue text-white px-4 py-2 rounded-lg font-semibold text-sm cursor-pointer hover:brightness-95 disabled:opacity-40"
          >
            {saving ? "儲存中..." : "儲存"}
          </button>
        </div>
      </div>
    </>
  );
}
