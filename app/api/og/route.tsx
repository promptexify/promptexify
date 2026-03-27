import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const title = searchParams.get("title") || "Promptexify — Cursor Rules, MCP & Claude Code Prompts";
    const description =
      searchParams.get("description") ||
      "The largest directory of Cursor rules, MCP configs, Claude Code skills, and AI coding prompts.";
    // Optional type parameter for future use
    // const type = searchParams.get("type") || "website";

    return new ImageResponse(
      (
        <div
          style={{
            height: "100%",
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#000",
            backgroundImage:
              "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
            padding: "40px",
            fontFamily: '"Inter", system-ui, sans-serif',
          }}
        >
          {/* Logo/Brand Area */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              marginBottom: "32px",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                borderRadius: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginRight: "16px",
              }}
            >
              <span
                style={{ color: "white", fontSize: "32px", fontWeight: "bold" }}
              >
                P
              </span>
            </div>
            <span
              style={{
                color: "white",
                fontSize: "32px",
                fontWeight: "bold",
                letterSpacing: "-0.02em",
              }}
            >
              Promptexify
            </span>
          </div>

          {/* Main Content */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              maxWidth: "900px",
            }}
          >
            <h1
              style={{
                color: "white",
                fontSize: title.length > 50 ? "48px" : "64px",
                fontWeight: "bold",
                lineHeight: "1.1",
                marginBottom: "24px",
                textAlign: "center",
              }}
            >
              {title}
            </h1>

            <p
              style={{
                color: "#94a3b8",
                fontSize: "24px",
                lineHeight: "1.4",
                marginBottom: "40px",
                textAlign: "center",
              }}
            >
              {description}
            </p>

            {/* Feature badges */}
            <div
              style={{
                display: "flex",
                gap: "16px",
                flexWrap: "wrap",
                justifyContent: "center",
              }}
            >
              {["Cursor Rules", "Claude Code", "MCP Configs", "AI Prompts"].map((platform) => (
                <div
                  key={platform}
                  style={{
                    background: "rgba(59, 130, 246, 0.1)",
                    border: "1px solid rgba(59, 130, 246, 0.3)",
                    borderRadius: "9999px",
                    padding: "8px 20px",
                    color: "#60a5fa",
                    fontSize: "16px",
                    fontWeight: "500",
                  }}
                >
                  {platform}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom decoration */}
          <div
            style={{
              position: "absolute",
              bottom: "0",
              left: "0",
              right: "0",
              height: "8px",
              background:
                "linear-gradient(90deg, #3b82f6, #8b5cf6, #ec4899, #f59e0b)",
            }}
          />
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error("Error generating OG image:", error);
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}
