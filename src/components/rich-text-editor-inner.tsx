"use client";

// 真正的 Quill 編輯器（直接 import react-quill-new 才能拿到 ref / Quill 實例來掛
// 貼圖攔截）。外層 rich-text-editor.tsx 用 next/dynamic ssr:false 載這支，避免
// Quill 在 SSR 期吃 document 爆掉。
import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

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
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const quillRef = useRef<ReactQuill>(null);

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

  const modules = useMemo(
    () => ({ toolbar: { container: TOOLBAR, handlers: { image: imageHandler } } }),
    [imageHandler],
  );

  // 貼上 / 拖放圖片 → 攔截 Quill 預設的 base64 內嵌，改走壓縮上傳
  useEffect(() => {
    const editor = quillRef.current?.getEditor();
    if (!editor) return;
    const root = editor.root;

    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            insertImage(f);
            return;
          }
        }
      }
    };
    const onDrop = (e: DragEvent) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      const imgFile = Array.from(files).find((f) => f.type.startsWith("image/"));
      if (imgFile) {
        e.preventDefault();
        insertImage(imgFile);
      }
    };

    root.addEventListener("paste", onPaste);
    root.addEventListener("drop", onDrop);
    return () => {
      root.removeEventListener("paste", onPaste);
      root.removeEventListener("drop", onDrop);
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
