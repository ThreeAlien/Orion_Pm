"use client";

// 真正的 Quill 編輯器（直接 import react-quill-new 才能拿到 ref / Quill 實例來掛
// 貼圖攔截）。外層 rich-text-editor.tsx 用 next/dynamic ssr:false 載這支，避免
// Quill 在 SSR 期吃 document 爆掉。
import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactQuill from "react-quill-new";
import { Mention, MentionBlot } from "quill-mention";
import "react-quill-new/dist/quill.snow.css";
import "quill-mention/dist/quill.mention.css";

export type MentionUser = { id: string; name: string };

// 把 quill-mention 的 blot / module 註冊到 react-quill-new 用的同一個 Quill。
// 只跑一次（這支只在 client 載入）。
let mentionRegistered = false;
function ensureMentionRegistered() {
  if (mentionRegistered) return;
  mentionRegistered = true;
  // react-quill-new 內部就是用 'quill' 這顆，ReactQuill.Quill 即同一個 class
  (ReactQuill.Quill as typeof import("quill").default).register(
    { "blots/mention": MentionBlot, "modules/mention": Mention },
    true,
  );
}

const TOOLBAR = [
  [{ header: [1, 2, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ indent: "-1" }, { indent: "+1" }],
  [{ color: [] }],
  [{ align: [] }],
  ["blockquote", "code-block", "link", "image"],
  ["clean"],
];

// 把圖檔等比縮到 maxDim 內、壓成 webp Blob。截圖動輒幾 MB → 壓完通常數十~數百 KB。
async function fileToWebp(
  file: Blob,
  maxDim = 1600,
  quality = 0.82,
): Promise<Blob> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("讀取圖片失敗"));
    r.readAsDataURL(file);
  });
  const img: HTMLImageElement = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("解析圖片失敗"));
    i.src = dataUrl;
  });
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const scale = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 不支援");
  ctx.drawImage(img, 0, 0, width, height);
  return await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("壓縮失敗"))),
      "image/webp",
      quality,
    ),
  );
}

async function uploadWebp(blob: Blob): Promise<string> {
  const res = await fetch("/api/images", {
    method: "POST",
    headers: { "Content-Type": "image/webp" },
    body: blob,
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `上傳失敗 (${res.status})`);
  }
  const { url } = await res.json();
  return url as string;
}

export function RichTextEditorInner({
  value,
  onChange,
  placeholder,
  mentionUsers,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  mentionUsers?: MentionUser[];
}) {
  const quillRef = useRef<ReactQuill>(null);
  const mentionEnabled = Array.isArray(mentionUsers);
  // 用 ref 餵 source，讓 modules 物件保持穩定（不隨 users 重建、避免 Quill 重新初始化）
  const usersRef = useRef<MentionUser[]>(mentionUsers ?? []);
  usersRef.current = mentionUsers ?? [];
  if (mentionEnabled) ensureMentionRegistered();

  // 壓 webp → 上傳 → 在游標處插入 <img src=短網址>
  const insertImage = useCallback(async (file: File) => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    try {
      const webp = await fileToWebp(file);
      const url = await uploadWebp(webp);
      const range = editor.getSelection(true);
      const index = range ? range.index : editor.getLength();
      editor.insertEmbed(index, "image", url, "user");
      editor.setSelection(index + 1, 0);
    } catch (err) {
      alert("圖片插入失敗：" + (err instanceof Error ? err.message : String(err)));
    }
  }, []);

  // 工具列圖片按鈕：開檔案選擇器
  const imageHandler = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) insertImage(f);
    };
    input.click();
  }, [insertImage]);

  const modules = useMemo(() => {
    const base = {
      toolbar: { container: TOOLBAR, handlers: { image: imageHandler } },
    };
    if (!mentionEnabled) return base;
    return {
      ...base,
      mention: {
        mentionDenotationChars: ["@"],
        // 預設只允許英數底線 → 會擋掉中文名字；放寬成任何語言字母/數字（含 CJK）
        allowedChars: /^[\p{L}\p{N}_]*$/u,
        dataAttributes: ["id", "value"],
        spaceAfterInsert: true,
        // 夾在 overflow 容器（drawer / dialog）內，用 fixed 定位避免被裁掉
        positioningStrategy: "fixed",
        renderItem: (item: { value: string }) => {
          const el = document.createElement("div");
          el.textContent = item.value;
          return el;
        },
        source: (
          searchTerm: string,
          renderList: (
            matches: { id: string; value: string }[],
            searchTerm: string,
          ) => void,
        ) => {
          const q = searchTerm.trim().toLowerCase();
          const matches = usersRef.current
            .filter((u) => !q || u.name.toLowerCase().includes(q))
            .slice(0, 8)
            .map((u) => ({ id: u.id, value: u.name }));
          renderList(matches, searchTerm);
        },
      },
    };
  }, [imageHandler, mentionEnabled]);

  // 貼上 / 拖放圖片 → 攔截 Quill 預設的 base64 內嵌，改走壓縮上傳
  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const root = editor.root;

    // 掛在 document 的 capture 階段：一定比 Quill 在 root（事件 target）上的 clipboard
    // listener 早跑。確認事件落在「自己這個編輯器」(root.contains) 才攔，preventDefault
    // + stopPropagation 直接擋掉 Quill 把圖塞成 base64 的預設行為 → 只留壓縮上傳那張，
    // 避免一次貼上變兩張（壓縮那張 + base64 那張）。
    const onPaste = (e: ClipboardEvent) => {
      if (!e.target || !root.contains(e.target as Node)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            e.stopPropagation();
            insertImage(f);
            return;
          }
        }
      }
    };
    const onDrop = (e: DragEvent) => {
      if (!e.target || !root.contains(e.target as Node)) return;
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const imgFile = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (imgFile) {
        e.preventDefault();
        e.stopPropagation();
        insertImage(imgFile);
      }
    };

    document.addEventListener("paste", onPaste, true);
    document.addEventListener("drop", onDrop, true);
    return () => {
      document.removeEventListener("paste", onPaste, true);
      document.removeEventListener("drop", onDrop, true);
    };
  }, [insertImage]);

  return (
    <div className="orion-quill">
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={(html) => onChange(html)}
        modules={modules}
        placeholder={placeholder}
      />
    </div>
  );
}
