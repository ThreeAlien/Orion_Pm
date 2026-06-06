"use client";

// 對外入口：用 next/dynamic ssr:false 載真正的編輯器（react-quill-new 吃 document，
// 不能 SSR）。貼圖壓 webp 上傳的邏輯都在 rich-text-editor-inner.tsx。
import dynamic from "next/dynamic";

const RichTextEditorInner = dynamic(
  () => import("./rich-text-editor-inner").then((m) => m.RichTextEditorInner),
  {
    ssr: false,
    loading: () => (
      <div className="text-sm text-text-faint px-3 py-2 bg-surface-2 border border-rule rounded-lg">
        載入編輯器…
      </div>
    ),
  },
);

// Quill 空內容會回 "<p><br></p>"，視為空字串方便上層判斷 / 儲存
export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  return (
    html
      .replace(/<(p|br|div|span)[^>]*>/gi, "")
      .replace(/<\/(p|div|span)>/gi, "")
      .trim() === ""
  );
}

export function RichTextEditor(props: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  mentionUsers?: { id: string; name: string }[];
}) {
  return <RichTextEditorInner {...props} />;
}
