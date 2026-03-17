import { NextRequest, NextResponse } from "next/server";
import { SecurityHeaders } from "@/lib/security/csp";

// CSP reports are sent as application/csp-report or application/reports+json
const ALLOWED_CONTENT_TYPES = [
  "application/csp-report",
  "application/reports+json",
  "application/json",
];

// Reject oversized payloads — legitimate CSP reports are small
const MAX_BODY_BYTES = 8_192; // 8 KB

/**
 * POST - CSP Violation Report Endpoint
 *
 * Receives CSP violation reports from browsers. CSRF is intentionally
 * skipped for this endpoint (browsers send these without tokens) — the
 * middleware skipCSRF list already excludes it from CSRF validation.
 */
export async function POST(request: NextRequest) {
  const securityHeaders = SecurityHeaders.getSecurityHeaders();

  try {
    // Validate Content-Type
    const contentType = request.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      return new NextResponse(null, { status: 415, headers: securityHeaders });
    }

    // Enforce body size limit before parsing
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413, headers: securityHeaders });
    }

    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413, headers: securityHeaders });
    }

    let violation: Record<string, unknown>;
    try {
      violation = JSON.parse(body);
    } catch {
      return new NextResponse(null, { status: 400, headers: securityHeaders });
    }

    // Extract the report — browsers wrap it in "csp-report" or send flat reports+json
    const report = (violation["csp-report"] as Record<string, unknown>) ?? violation;

    if (process.env.NODE_ENV === "development") {
      console.log("[CSP-VIOLATION]", {
        directive: report["violated-directive"],
        blockedUri: report["blocked-uri"],
        documentUri: report["document-uri"],
        timestamp: new Date().toISOString(),
      });
    } else {
      console.warn("[CSP-VIOLATION]", {
        directive: report["violated-directive"],
        blockedUri: report["blocked-uri"],
        documentUri: report["document-uri"],
        timestamp: new Date().toISOString(),
      });
    }

    return new NextResponse(null, { status: 204, headers: securityHeaders });
  } catch (error) {
    console.error("CSP report processing error:", error);
    return new NextResponse(null, { status: 500, headers: securityHeaders });
  }
}
