/**
 * Content sanitization utilities to prevent XSS attacks
 * and ensure safe content handling
 */

import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

// HTML entity mapping for basic sanitization
const HTML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

/**
 * Initialize DOMPurify for server-side usage with enhanced error handling
 */
function createDOMPurify() {
  try {
    if (typeof window === "undefined") {
      // Server-side: use JSDOM
      const dom = new JSDOM("<!DOCTYPE html>");
      return DOMPurify(dom.window as unknown as Window & typeof globalThis);
    } else {
      // Client-side: use browser window
      return DOMPurify;
    }
  } catch (error) {
    console.error("[SECURITY] Failed to initialize DOMPurify:", error);
    throw new Error("DOMPurify initialization failed");
  }
}

/**
 * DOMPurify configuration for different content types
 */
const DOMPURIFY_CONFIGS = {
  // Strict configuration for general content
  strict: {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
  },
  
  // Configuration for rich content (comments, user-generated HTML)
  rich: {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "b", "i", "s", "del", "ins",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "dl", "dt", "dd",
      "blockquote", "pre", "code", "kbd", "samp", "var",
      "a", "img", "figure", "figcaption",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th",
      "div", "span", "section", "article", "aside", "header", "footer",
      "nav", "main", "address", "time", "mark", "small", "sub", "sup",
      "cite", "q", "abbr", "acronym", "dfn", "em", "strong"
    ],
    ALLOWED_ATTR: [
      "href", "title", "alt", "src", "width", "height", "class", "id",
      "target", "rel", "download", "hreflang", "type", "cite", "datetime",
      "lang", "dir", "accesskey", "tabindex", "style"
    ],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
    // Custom hooks for additional sanitization
    HOOKS: {
      uponSanitizeElement: (node: Element, data: { tagName: string }) => {
        // Remove any remaining dangerous attributes
        const dangerousAttrs = ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"];
        dangerousAttrs.forEach(attr => {
          if (node.hasAttribute(attr)) {
            node.removeAttribute(attr);
          }
        });
        
        // Ensure external links open in new tab
        if (data.tagName === "a" && node.hasAttribute("href")) {
          const href = node.getAttribute("href");
          if (href && (href.startsWith("http://") || href.startsWith("https://"))) {
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
          }
        }
      }
    }
  },
  
  // Configuration for basic HTML content
  basic: {
    ALLOWED_TAGS: ["p", "br", "strong", "em", "u", "a", "ul", "ol", "li"],
    ALLOWED_ATTR: ["href", "title"],
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    KEEP_CONTENT: true,
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false,
    RETURN_TRUSTED_TYPE: false,
  }
};

/**
 * Check if running in production environment
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Check if running in development environment
 */
function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

/**
 * Escape HTML entities to prevent XSS
 */
export function escapeHtml(text: string): string {
  if (typeof text !== "string") {
    return String(text);
  }

  return text.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Sanitize user input for safe database storage and display
 * Enhanced with DOMPurify for better XSS protection
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== "string") {
    return String(input);
  }

  // First apply basic sanitization
  let sanitized = input
    .trim()
    // Remove null bytes
    .replace(/\0/g, "")
    // Remove potential script tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove javascript: URLs
    .replace(/javascript:/gi, "")
    // Remove on* event handlers
    .replace(/\bon\w+\s*=/gi, "")
    // Remove data: URLs (except images)
    .replace(/data:(?!image\/)/gi, "data-blocked:")
    // Remove vbscript: URLs
    .replace(/vbscript:/gi, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    .trim();

  // Then use DOMPurify for additional protection
  try {
    const purify = createDOMPurify();
    sanitized = purify.sanitize(sanitized, DOMPURIFY_CONFIGS.strict);
  } catch (error) {
    // Fallback to original sanitization if DOMPurify fails
    console.warn("[SECURITY] DOMPurify failed, using fallback sanitization:", error);
  }

  return sanitized;
}

/**
 * Sanitize and validate URLs
 */
export function sanitizeUrl(url: string): string | null {
  if (typeof url !== "string") {
    return null;
  }

  const trimmedUrl = url.trim();

  // Empty URL
  if (!trimmedUrl) {
    return null;
  }

  // Block dangerous protocols
  const dangerousProtocols = [
    "javascript:",
    "vbscript:",
    "file:",
    "ftp:",
    "data:",
  ];

  const lowerUrl = trimmedUrl.toLowerCase();
  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      return null;
    }
  }

  // Only allow http, https, and relative URLs
  if (!/^(https?:\/\/|\/|#)/.test(trimmedUrl)) {
    return null;
  }

  // Basic URL validation
  try {
    if (trimmedUrl.startsWith("http")) {
      new URL(trimmedUrl);
    }
    return trimmedUrl;
  } catch {
    return null;
  }
}

/**
 * Sanitize filename for safe file uploads
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== "string") {
    return "file";
  }

  return (
    filename
      .trim()
      // Remove path traversal attempts
      .replace(/\.{2,}/g, "")
      .replace(/[/\\]/g, "")
      // Remove null bytes
      .replace(/\0/g, "")
      // Keep only safe characters
      .replace(/[^a-zA-Z0-9\-_.]/g, "_")
      // Prevent hidden files
      .replace(/^\./, "_")
      // Limit length
      .substring(0, 100)
      .trim() || "file"
  );
}

/**
 * Sanitize content for markdown/rich text
 * Enhanced with DOMPurify for better XSS protection
 */
export function sanitizeContent(content: string): string {
  if (typeof content !== "string") {
    return String(content);
  }

  // First apply basic sanitization
  let sanitized = content
    .trim()
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    // Limit extremely long content
    .substring(0, 100000);

  // Then use DOMPurify for comprehensive HTML sanitization
  try {
    const purify = createDOMPurify();
    sanitized = purify.sanitize(sanitized, DOMPURIFY_CONFIGS.strict);
  } catch (error) {
    // Fallback to original regex-based sanitization if DOMPurify fails
    console.warn("[SECURITY] DOMPurify failed, using fallback sanitization:", error);
    sanitized = sanitized
      // Remove script tags and their content
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      // Remove iframe tags
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
      // Remove object and embed tags
      .replace(/<(object|embed)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, "")
      // Remove form elements
      .replace(
        /<(form|input|button|textarea|select)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi,
        ""
      )
      // Remove dangerous event handlers
      .replace(/\bon\w+\s*=/gi, "")
      // Remove javascript: URLs
      .replace(/javascript:/gi, "")
      // Remove vbscript: URLs
      .replace(/vbscript:/gi, "")
      // Remove data: URLs except for images
      .replace(/data:(?!image\/)[^"'\s]*/gi, "")
      // Remove style attributes with expressions
      .replace(/style\s*=\s*["'][^"']*expression\s*\([^"']*["']/gi, "")
      // Remove meta refresh
      .replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi, "")
      // Remove base tags
      .replace(/<base\b[^>]*>/gi, "");
  }

  return sanitized;
}

/**
 * Sanitize tag names with strict validation
 * Only allows a-z, A-Z, 0-9, spaces, hyphens, and underscores
 */
export function sanitizeTagName(tagName: string): string {
  if (typeof tagName !== "string") {
    return "";
  }

  return (
    tagName
      .trim()
      // Remove null bytes and control characters
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
      // Only allow alphanumeric, spaces, hyphens, and underscores
      .replace(/[^a-zA-Z0-9\s\-_]/g, "")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
      // Limit length
      .substring(0, 50)
  );
}

/**
 * Sanitize and generate tag slug with strict validation
 * Only allows a-z, 0-9, and hyphens as specified in requirements
 */
export function sanitizeTagSlug(input: string): string {
  if (typeof input !== "string") {
    return "";
  }

  const slug = input
    .trim()
    .toLowerCase()
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, "-")
    // Only allow a-z, 0-9, and hyphens
    .replace(/[^a-z0-9-]/g, "")
    // Remove consecutive hyphens
    .replace(/-+/g, "-")
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, "")
    // Limit length
    .substring(0, 50);

  return slug;
}

/**
 * Validate tag slug format according to requirements
 * Only a-z, 0-9, and hyphens allowed
 */
export function validateTagSlug(slug: string): boolean {
  if (typeof slug !== "string" || slug.length === 0) {
    return false;
  }

  // Check if slug matches the required format
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return false;
  }

  // Check if slug starts or ends with hyphen
  if (slug.startsWith("-") || slug.endsWith("-")) {
    return false;
  }

  // Check for consecutive hyphens
  if (slug.includes("--")) {
    return false;
  }

  // Check length
  if (slug.length > 50) {
    return false;
  }

  return true;
}

/**
 * Advanced content sanitization for user-generated HTML content
 * Enhanced with DOMPurify for better XSS protection while allowing safe HTML
 */
export function sanitizeRichContent(content: string): string {
  if (typeof content !== "string") {
    return String(content);
  }

  // First apply basic sanitization
  let sanitized = content
    .trim()
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    // Limit content length
    .substring(0, 50000);

  // Then use DOMPurify with rich content configuration
  try {
    const purify = createDOMPurify();
    sanitized = purify.sanitize(sanitized, DOMPURIFY_CONFIGS.rich);
  } catch (error) {
    // Fallback to original regex-based sanitization if DOMPurify fails
    console.warn("[SECURITY] DOMPurify failed, using fallback sanitization:", error);
    sanitized = sanitized
      // Remove all script tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      // Remove dangerous tags
      .replace(
        /<(iframe|object|embed|form|input|button|textarea|select|meta|base|link|style)\b[^>]*(?:\/>|>.*?<\/\1>)/gi,
        ""
      )
      // Remove event handlers
      .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
      // Remove javascript: and vbscript: URLs
      .replace(/(javascript|vbscript):[^"'\s]*/gi, "")
      // Remove data: URLs except for images
      .replace(/data:(?!image\/)[^"'\s]*/gi, "")
      // Sanitize href attributes to only allow safe URLs
      .replace(/href\s*=\s*["']([^"']*)["']/gi, (match, url) => {
        const sanitizedUrl = sanitizeUrl(url);
        return sanitizedUrl ? `href="${sanitizedUrl}"` : "";
      })
      // Remove tags not in allowlist
      .replace(
        /<(?!\/?(?:p|br|strong|em|u|h[1-6]|ul|ol|li|blockquote|a)\b)[^>]*>/gi,
        ""
      );
  }

  return sanitized;
}

/**
 * Sanitize search query to prevent injection attacks
 * Enhanced with DOMPurify for better XSS protection
 */
export async function sanitizeSearchQuery(
  query: string,
  options?: {
    userId?: string;
    ip?: string;
    logSuspicious?: boolean;
  }
): Promise<string> {
  if (typeof query !== "string") {
    return "";
  }

  const { userId, ip, logSuspicious = true } = options || {};

  // Strip null bytes and control characters first
  let sanitized = query.trim().replace(/[\x00-\x1F]/g, "");

  // Run DOMPurify BEFORE any character removal to prevent bypass sequences
  // (e.g. "uni/**/on" becoming "union" after comment stripping).
  try {
    if (typeof process !== "undefined" && process.env.NEXT_RUNTIME !== "edge") {
      const purify = createDOMPurify();
      sanitized = purify.sanitize(sanitized, DOMPURIFY_CONFIGS.strict);
    }
    // Edge runtime skips DOMPurify — the allowlist below still applies.
  } catch (error) {
    console.warn("[SECURITY] DOMPurify failed, using fallback sanitization:", error);
  }

  // Allowlist: keep only characters safe for a plain-text search query.
  // This replaces the previous denylist approach which was bypassable.
  sanitized = sanitized
    .replace(/[^a-zA-Z0-9\s\-_.,'!?&]/g, "")
    // Normalize whitespace
    .replace(/\s+/g, " ")
    // Remove leading/trailing special characters
    .replace(/^[\s\-_.]+|[\s\-_.]+$/g, "")
    // Enforce maximum length
    .substring(0, 100)
    .trim();

  // SECURITY: Additional validation - must contain at least one alphanumeric character
  if (sanitized && !/[a-zA-Z0-9]/.test(sanitized)) {
    return "";
  }

  // SECURITY: Block suspicious patterns
  const suspiciousPatterns = [
    { pattern: /union\s+select/i, name: "SQL_UNION_SELECT" },
    { pattern: /drop\s+table/i, name: "SQL_DROP_TABLE" },
    { pattern: /insert\s+into/i, name: "SQL_INSERT" },
    { pattern: /delete\s+from/i, name: "SQL_DELETE" },
    { pattern: /update\s+set/i, name: "SQL_UPDATE" },
    { pattern: /exec\s*\(/i, name: "SQL_EXEC" },
    { pattern: /script\s*>/i, name: "XSS_SCRIPT" },
    { pattern: /on\s*error/i, name: "JS_ERROR_HANDLER" },
    { pattern: /\.\.\/+/, name: "PATH_TRAVERSAL" },
    { pattern: /\$\{/, name: "TEMPLATE_INJECTION" },
    { pattern: /%[0-9a-f]{2}/i, name: "URL_ENCODING" },
  ];

  for (const { pattern, name } of suspiciousPatterns) {
    if (pattern.test(sanitized)) {
      console.warn(
        `[SECURITY] Suspicious search pattern blocked: ${name} - ${sanitized}`
      );

      // Log suspicious pattern if enabled (skip in Edge Runtime)
      if (
        logSuspicious &&
        typeof process !== "undefined" &&
        process.env.NEXT_RUNTIME !== "edge"
      ) {
        // Dynamically import to avoid circular dependencies
        try {
          const { SecurityAlert } = await import("@/lib/security/monitor");
          await SecurityAlert.suspiciousSearchPattern(
            query,
            { userId, ip },
            userId
          );
        } catch {
          // Fallback to console logging if monitor is unavailable
          console.warn(
            `[SECURITY] Suspicious search pattern: ${name} - User: ${userId} - IP: ${ip}`
          );
        }
      }

      return "";
    }
  }

  return sanitized;
}

/**
 * Sanitize slug for URL safety
 */
export function sanitizeSlug(slug: string): string {
  if (typeof slug !== "string") {
    return "";
  }

  return (
    slug
      .trim()
      .toLowerCase()
      // Remove non-alphanumeric characters except hyphens
      .replace(/[^a-z0-9-]/g, "-")
      // Remove multiple consecutive hyphens
      .replace(/-+/g, "-")
      // Remove leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
      // Limit length
      .substring(0, 100)
      .trim()
  );
}

/**
 * Validate and sanitize email addresses
 */
export function sanitizeEmail(email: string): string | null {
  if (typeof email !== "string") {
    return null;
  }

  const trimmedEmail = email.trim().toLowerCase();

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmedEmail)) {
    return null;
  }

  // Check for dangerous characters
  if (/[<>'"\\/]/.test(trimmedEmail)) {
    return null;
  }

  return trimmedEmail.substring(0, 254); // RFC 5321 limit
}

/**
 * Sanitize basic HTML content (limited tags)
 * Use this for content that needs minimal HTML formatting
 */
export function sanitizeBasicHtml(content: string): string {
  if (typeof content !== "string") {
    return String(content);
  }

  // First apply basic sanitization
  let sanitized = content
    .trim()
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    // Limit content length
    .substring(0, 10000);

  // Then use DOMPurify with basic configuration
  try {
    const purify = createDOMPurify();
    sanitized = purify.sanitize(sanitized, DOMPURIFY_CONFIGS.basic);
  } catch (error) {
    // Fallback to original regex-based sanitization if DOMPurify fails
    console.warn("[SECURITY] DOMPurify failed, using fallback sanitization:", error);
    sanitized = sanitized
      // Remove all script tags
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      // Remove dangerous tags
      .replace(/<(iframe|object|embed|form|input|button|textarea|select|meta|base|link|style)\b[^>]*(?:\/>|>.*?<\/\1>)/gi, "")
      // Remove event handlers
      .replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, "")
      // Remove javascript: and vbscript: URLs
      .replace(/(javascript|vbscript):[^"'\s]*/gi, "")
      // Remove data: URLs except for images
      .replace(/data:(?!image\/)[^"'\s]*/gi, "")
      // Remove tags not in allowlist
      .replace(/<(?!\/?(?:p|br|strong|em|u|a|ul|ol|li)\b)[^>]*>/gi, "");
  }

  return sanitized;
}

/**
 * Sanitize JSON data recursively
 */
export function sanitizeJsonData(data: unknown): unknown {
  if (typeof data === "string") {
    return sanitizeInput(data);
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeJsonData);
  }

  if (data && typeof data === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const sanitizedKey = sanitizeInput(key);
      sanitized[sanitizedKey] = sanitizeJsonData(value);
    }
    return sanitized;
  }

  return data;
}

/**
 * Remove potentially dangerous file extensions
 */
export function validateFileExtension(filename: string): boolean {
  const dangerousExtensions = [
    ".exe",
    ".bat",
    ".cmd",
    ".com",
    ".pif",
    ".scr",
    ".vbs",
    ".js",
    ".jar",
    ".php",
    ".asp",
    ".aspx",
    ".jsp",
    ".py",
    ".rb",
    ".pl",
    ".sh",
    ".ps1",
    ".app",
    ".deb",
    ".rpm",
    ".dmg",
    ".iso",
  ];

  const extension = filename.toLowerCase().split(".").pop();
  return !dangerousExtensions.includes(`.${extension}`);
}

/**
 * Get DOMPurify configuration by type
 */
export function getDOMPurifyConfig(type: "strict" | "basic" | "rich" = "strict") {
  return DOMPURIFY_CONFIGS[type];
}

/**
 * Check if DOMPurify is available and working
 */
export function isDOMPurifyAvailable(): boolean {
  try {
    const purify = createDOMPurify();
    return typeof purify.sanitize === "function";
  } catch {
    return false;
  }
}

/**
 * Get environment-aware security headers
 */
function getSecurityHeaders() {
  const baseHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "0",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy":
      "geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  };

  if (isProduction()) {
    // Production headers - maximum security
    return {
      ...baseHeaders,
      "Strict-Transport-Security":
        "max-age=63072000; includeSubDomains; preload",
      "X-Permitted-Cross-Domain-Policies": "none",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Resource-Policy": "same-origin",
      // Remove server information
      Server: "Promptexify",
      // Cache control for security
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
      Expires: "0",
    };
  } else {
    // Development headers - less restrictive for development
    return {
      ...baseHeaders,
      // Don't enforce HSTS in development (allows HTTP)
      "X-Permitted-Cross-Domain-Policies": "none",
      // COEP relaxed in dev to avoid blocking cross-origin resources in devtools.
      // COOP stays same-origin everywhere — window.opener attacks are never acceptable.
      "Cross-Origin-Embedder-Policy": "unsafe-none",
      "Cross-Origin-Opener-Policy": "same-origin",
    };
  }
}

/**
 * Security headers for API responses
 */
export const SECURITY_HEADERS = getSecurityHeaders();

/**
 * Safely serialize an object as JSON for embedding inside an HTML <script> tag.
 *
 * JSON.stringify does NOT escape <, >, /, or & — all of which can break out of
 * a <script> context when the output is placed inside dangerouslySetInnerHTML.
 * For example, a value containing "</script>" would close the tag and allow
 * arbitrary HTML/JS injection.
 *
 * This function escapes those four characters to their Unicode escape sequences,
 * which are valid JSON and safe in all HTML contexts.
 */
export function safeJsonLd(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/'/g, "\\u0027");
}



/**
 * Get rate limit configurations based on environment
 */
export function getRateLimitConfig() {
  if (isProduction()) {
    // Stricter rate limits in production
    return {
      auth: { limit: 5, window: 15 * 60 * 1000 }, // 5 requests per 15 minutes
      upload: { limit: 10, window: 60 * 1000 }, // 10 uploads per minute
      createPost: { limit: 3, window: 60 * 1000 }, // 3 posts per minute
      createTag: { limit: 15, window: 60 * 1000 }, // 15 tags per minute
      api: { limit: 60, window: 60 * 1000 }, // 60 requests per minute
      admin: { limit: 10, window: 60 * 1000 }, // 10 admin requests per minute
      search: { limit: 30, window: 60 * 1000 }, // 30 searches per minute
      interactions: { limit: 100, window: 60 * 1000 }, // 100 interactions per minute
    };
  } else {
    // More lenient rate limits in development
    return {
      auth: { limit: 20, window: 15 * 60 * 1000 }, // 20 requests per 15 minutes
      upload: { limit: 50, window: 60 * 1000 }, // 50 uploads per minute
      createPost: { limit: 20, window: 60 * 1000 }, // 20 posts per minute
      createTag: { limit: 100, window: 60 * 1000 }, // 100 tags per minute
      api: { limit: 500, window: 60 * 1000 }, // 500 requests per minute
      admin: { limit: 100, window: 60 * 1000 }, // 100 admin requests per minute
      search: { limit: 200, window: 60 * 1000 }, // 200 searches per minute
      interactions: { limit: 1000, window: 60 * 1000 }, // 1000 interactions per minute
    };
  }
}

/**
 * Validate content length based on environment
 */
export function getContentLimits() {
  return {
    postTitle: isProduction() ? 200 : 300,
    postContent: isProduction() ? 50000 : 100000,
    postDescription: isProduction() ? 500 : 1000,
    tagName: isProduction() ? 50 : 100,
    categoryName: isProduction() ? 100 : 200,
    searchQuery: isProduction() ? 100 : 200,
    filename: isProduction() ? 100 : 200,
  };
}

/**
 * Get logging configuration based on environment
 */
export function getLoggingConfig() {
  return {
    logLevel: isProduction() ? "error" : "debug",
    logSensitiveData: isDevelopment(),
    logRateLimitViolations: true,
    logSecurityEvents: true,
    logFileUploads: isProduction(),
  };
}

/**
 * Environment-aware error response
 */
export function createErrorResponse(error: Error, message: string) {
  const config = getLoggingConfig();

  return {
    error: message,
    ...(config.logSensitiveData && {
      details: error.message,
      stack: error.stack,
    }),
    timestamp: new Date().toISOString(),
    ...(isProduction() && {
      reference: `ERR_${Date.now()}_${Math.random()
        .toString(36)
        .substring(2, 15)}`,
    }),
  };
}
