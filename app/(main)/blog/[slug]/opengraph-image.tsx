import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getBlogPostBySlug } from "@/lib/blog-query";

export const alt = "Blog article preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [geistMonoBold, geistMonoRegular, post] = await Promise.all([
    readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-mono/GeistMono-Bold.ttf")),
    readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf")),
    getBlogPostBySlug(slug).catch(() => null),
  ]);

  const title        = post?.title ?? "Promptexify Blog";
  const excerpt      = post?.excerpt ?? "Guides and insights on AI-powered development.";
  const author       = post?.author?.name ?? null;
  const publishedDate = post?.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
    : null;
  const readingTime  = post?.readingTime ? `${post.readingTime} min read` : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          padding: "60px 70px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "GeistMono",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "36px", height: "36px", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "white", fontSize: "20px", fontWeight: "bold" }}>P</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 400, color: "#94a3b8", letterSpacing: "-0.02em" }}>promptexify.com</span>
          </div>
          <div style={{ display: "flex", background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: "9999px", padding: "6px 18px", color: "#a78bfa", fontSize: 16, fontWeight: 400 }}>
            Blog
          </div>
        </div>

        {/* Title + excerpt */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "90%" }}>
          <div style={{ fontSize: title.length > 60 ? 40 : 52, fontWeight: 700, color: "#f8fafc", lineHeight: 1.15, letterSpacing: "-0.03em", wordBreak: "break-word" }}>
            {title}
          </div>
          {excerpt && (
            <div style={{ fontSize: 20, fontWeight: 400, color: "#94a3b8", lineHeight: 1.4 }}>
              {excerpt.length > 120 ? excerpt.substring(0, 117) + "…" : excerpt}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", width: "100%" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {author && <div style={{ display: "flex", fontSize: 18, fontWeight: 400, color: "#94a3b8" }}>{author}</div>}
            <div style={{ display: "flex", gap: "16px" }}>
              {publishedDate && <div style={{ display: "flex", fontSize: 16, fontWeight: 400, color: "#64748b" }}>{publishedDate}</div>}
              {readingTime && <div style={{ display: "flex", fontSize: 16, fontWeight: 400, color: "#64748b" }}>{readingTime}</div>}
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 42, color: "#8b5cf6" }}>→</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "GeistMono", data: geistMonoBold,    style: "normal", weight: 700 },
        { name: "GeistMono", data: geistMonoRegular, style: "normal", weight: 400 },
      ],
    }
  );
}
