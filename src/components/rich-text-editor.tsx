"use client";

// react-quill-new 包一層：Next 15 App Router 必須 dynamic ssr:false（Quill 吃 document）。
// 存 HTML 字串，跟既有 CMS 的 quill HTML 格式一致。
import dynamic from "next/dynamic";
import { useMemo } from "react";
import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
  loading: () => (
    <div className="text-sm text-text-faint px-3 py-2 bg-surface-2 border border-rule rounded-lg">
      載入編輯器…
    </div>
  ),
});

const TOOLBAR = [
  [{ header: [1, 2, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ indent: "-1" }, { indent: "+1" }],
  [{ color: [] }],
  [{ align: [] }],
  ["blockquote", "code-block", "link"],
  ["clean"],
];

// Quill 空內容會回 "<p><br></p>"，視為空字串方便上層判斷 / 儲存
export function isRichTextEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  return html.replace(/<(p|br|div|span)[^>]*>/gi, "").replace(/<\/(p|div|span)>/gi, "").trim() === "";
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const modules = useMemo(() => ({ toolbar: TOOLBAR }), []);
  return (
    <div className="orion-quill">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={(html) => onChange(html)}
        modules={modules}
        placeholder={placeholder}
      />
    </div>
  );
}
