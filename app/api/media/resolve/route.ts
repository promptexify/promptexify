import { NextRequest, NextResponse } from "next/server";
import { resolveMediaUrl, resolveMediaUrls } from "@/lib/image/path";
import { z } from "zod";
import { rateLimits, getClientIdentifier, getRateLimitHeaders } from "@/lib/security/limits";
import { SECURITY_HEADERS } from "@/lib/security/sanitize";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientId = getClientIdentifier(request);
    const rateLimitResult = await rateLimits.mediaResolve(clientId);

    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        {
          error: "Too many media resolution requests. Please try again later.",
          retryAfter: Math.ceil(
            (rateLimitResult.resetTime - Date.now()) / 1000
          ),
        },
        {
          status: 429,
          headers: {
            ...SECURITY_HEADERS,
            ...getRateLimitHeaders(rateLimitResult),
            "Retry-After": String(
              Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
            ),
          },
        }
      );
    }

    // Relative media paths must start with a known prefix or be full https URLs.
    // This prevents SSRF/path-disclosure by blocking traversal attempts and
    // arbitrary path construction before any storage URL is resolved.
    const VALID_PATH_PREFIXES = ["images/", "videos/", "preview/", "data-uploads/"];
    const mediaPathSchema = z
      .string()
      .min(1)
      .refine(
        (p) =>
          p.startsWith("https://") ||
          p.startsWith("http://") ||
          VALID_PATH_PREFIXES.some((prefix) => p.startsWith(prefix)),
        "Path must start with images/, videos/, preview/, data-uploads/, or be a full URL"
      )
      .refine((p) => !p.includes("..") && !p.includes("\0"), "Invalid path");

    const bodySchema = z.object({
      paths: z.array(mediaPathSchema).max(50).nonempty("paths array required"),
    });

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request body",
          details: parsed.error.errors.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { 
          status: 400,
          headers: SECURITY_HEADERS,
        }
      );
    }

    const { paths } = parsed.data;

    // Handle single path
    if (paths.length === 1) {
      const resolvedUrl = await resolveMediaUrl(paths[0]);
      return NextResponse.json(
        { url: resolvedUrl },
        { headers: SECURITY_HEADERS }
      );
    }

    // Handle multiple paths
    const resolvedUrls = await resolveMediaUrls(paths);
    return NextResponse.json(
      { urls: resolvedUrls },
      { headers: SECURITY_HEADERS }
    );
  } catch (error) {
    console.error("Error resolving media URLs:", error);
    return NextResponse.json(
      { error: "Failed to resolve media URLs" },
      { 
        status: 500,
        headers: SECURITY_HEADERS,
      }
    );
  }
}
