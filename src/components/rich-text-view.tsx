// 渲染富文本 HTML（描述 / 留言）。一律 DOMPurify sanitize 防 XSS（使用者輸入）。
import DOMPurify from "isomorphic-dompurify";

export function RichTextView({
  html,
  className,
}: {
  html: string | null | undefined;
  className?: string;
}) {
  const clean = DOMPurify.sanitize(html ?? "");
  return (
    <div
      className={`orion-richtext ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}

// 純文字摘要（卡片預覽用，避免顯示 HTML 標籤）
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
