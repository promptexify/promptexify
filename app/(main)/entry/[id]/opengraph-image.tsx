import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Queries } from "@/lib/query";

export const alt = "Prompt or rule preview";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function OGImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [geistMonoBold, geistMonoRegular, post] = await Promise.all([
    readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-mono/GeistMono-Bold.ttf")),
    readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-mono/GeistMono-Regular.ttf")),
    Queries.posts.getById(id).catch(() => null),
  ]);

  const title = post?.isPublished ? post.title : "Promptexify";
  const category = post?.category?.name ?? null;
  const tags = post?.tags?.slice(0, 3).map((t) => t.name) ?? [];
  const publishedDate = post?.createdAt
    ? new Date(post.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 70px",
          background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
          fontFamily: "GeistMono",
        }}
      >
        {/* Header: site name + category badge */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            {/* Logo mark */}
            <div
              style={{
                width: "36px",
                height: "36px",
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "white", fontSize: "20px", fontWeight: "bold" }}>P</span>
            </div>
            <span style={{ fontSize: 22, fontWeight: 400, color: "#94a3b8", letterSpacing: "-0.02em" }}>
              promptexify.com
            </span>
          </div>

          {category && (
            <div
              style={{
                display: "flex",
                background: "rgba(59, 130, 246, 0.15)",
                border: "1px solid rgba(59, 130, 246, 0.35)",
                borderRadius: "9999px",
                padding: "6px 18px",
                color: "#60a5fa",
                fontSize: 18,
                fontWeight: 400,
              }}
            >
              {category}
            </div>
          )}
        </div>

        {/* Title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "90%",
          }}
        >
          <div
            style={{
              fontSize: title.length > 60 ? 44 : 56,
              fontWeight: 700,
              color: "#f8fafc",
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              wordBreak: "break-word",
            }}
          >
            {title}
          </div>

          {/* Tag pills */}
          {tags.length > 0 && (
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {tags.map((tag) => (
                <div
                  key={tag}
                  style={{
                    display: "flex",
                    background: "rgba(148, 163, 184, 0.1)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    borderRadius: "6px",
                    padding: "4px 12px",
                    color: "#94a3b8",
                    fontSize: 16,
                    fontWeight: 400,
                  }}
                >
                  #{tag}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            width: "100%",
          }}
        >
          {publishedDate ? (
            <div style={{ display: "flex", fontSize: 18, fontWeight: 400, color: "#64748b" }}>
              {publishedDate}
            </div>
          ) : (
            <div style={{ display: "flex" }} />
          )}
          <div style={{ display: "flex", fontSize: 42, color: "#3b82f6" }}>→</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "GeistMono", data: geistMonoBold, style: "normal", weight: 700 },
        { name: "GeistMono", data: geistMonoRegular, style: "normal", weight: 400 },
      ],
    }
  );
}
