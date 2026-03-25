"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AppSidebar } from "@/components/dashboard/admin-sidebar";
import { SiteHeader } from "@/components/dashboard/site-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import {
  ArrowLeft,
  Upload,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useCSRFForm } from "@/hooks/use-csrf";
import { postBulkImportItemSchema, type PostBulkImportItem } from "@/lib/schemas";
import { bulkImportPostsAction, type BulkImportResult } from "@/actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ParsedItem {
  index: number;
  raw: unknown;
  data?: PostBulkImportItem;
  errors: string[];
  /** Set after category list is fetched — null means unknown yet */
  categoryValid: boolean | null;
}

type Stage = "input" | "preview" | "importing" | "done";

interface Category {
  id: string;
  slug: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLACEHOLDER = `[
  {
    "title": "Summarise in 3 Bullets",
    "content": "You are a concise assistant. Summarise the following text in exactly three bullet points...",
    "category": "writing",
    "description": "Condenses any text to three bullet points",
    "tags": ["summarization", "productivity"]
  },
  {
    "title": "Code Review Assistant",
    "content": "Review the following code for bugs, security issues, and style...",
    "category": "coding",
    "tags": ["code-review", "debugging"]
  }
]`;

function parseItems(
  text: string,
  categories: Category[]
): { items: ParsedItem[]; parseError: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { items: [], parseError: null };

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return {
      items: [],
      parseError: "Invalid JSON — check for missing quotes, commas, or brackets.",
    };
  }

  if (!Array.isArray(json)) {
    return {
      items: [],
      parseError: "Expected a JSON array (starting with [ and ending with ]).",
    };
  }

  const slugSet = new Set(categories.map((c) => c.slug));

  return {
    items: json.map((raw, index) => {
      const result = postBulkImportItemSchema.safeParse(raw);
      if (!result.success) {
        return {
          index,
          raw,
          errors: result.error.errors.map(
            (e) => `${e.path.join(".") || "root"}: ${e.message}`
          ),
          categoryValid: null,
        };
      }
      const data = result.data;
      const categoryValid =
        categories.length === 0 ? null : slugSet.has(data.category);
      return {
        index,
        raw,
        data,
        errors: categoryValid === false ? [`category "${data.category}" not found`] : [],
        categoryValid,
      };
    }),
    parseError: null,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BulkImportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { createFormDataWithCSRF, isReady } = useCSRFForm();

  const [categories, setCategories] = useState<Category[]>([]);
  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [stage, setStage] = useState<Stage>("input");
  const [importResults, setImportResults] = useState<BulkImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth guard — admin only
  useEffect(() => {
    if (!loading && (!user || user.userData?.role !== "ADMIN")) {
      router.push("/dashboard");
    }
  }, [user, loading, router]);

  // Fetch categories for client-side slug validation
  useEffect(() => {
    if (user?.userData?.role !== "ADMIN") return;
    fetch("/api/categories", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: unknown) => {
        if (Array.isArray(data)) setCategories(data as Category[]);
      })
      .catch(() => { });
  }, [user]);

  // Re-validate whenever categories load
  useEffect(() => {
    if (raw) handleParse(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories]);

  function handleParse(text: string) {
    const { items: parsed, parseError: err } = parseItems(text, categories);
    setParseError(err);
    setItems(parsed);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setRaw(value);
    handleParse(value);
  }

  function handleFileRead(file: File) {
    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      setParseError("Only .json files are accepted.");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRaw(text);
      handleParse(text);
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }

  function handleClear() {
    setRaw("");
    setItems([]);
    setParseError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const validItems = items.filter(
    (it) => it.data && it.errors.length === 0
  );
  const invalidItems = items.filter((it) => it.errors.length > 0);

  async function handleImport() {
    if (!isReady) {
      toast.error("Security verification in progress. Please wait.");
      return;
    }
    if (validItems.length === 0) return;

    setStage("importing");

    try {
      const fd = createFormDataWithCSRF();
      fd.set(
        "posts_json",
        JSON.stringify(validItems.map((it) => it.raw))
      );

      const result = await bulkImportPostsAction(fd);
      setImportResults(result);
      setStage("done");

      if (result.created > 0) {
        toast.success(
          `${result.created} post${result.created !== 1 ? "s" : ""} imported as drafts.`
        );
      }
      if (result.failed > 0) {
        toast.warning(
          `${result.failed} post${result.failed !== 1 ? "s" : ""} failed to import.`
        );
      }
    } catch (err) {
      setStage("preview");
      const msg = err instanceof Error ? err.message : "Import failed";
      toast.error(msg);
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  if (loading || !user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (user.userData?.role !== "ADMIN") return null;

  const isImporting = stage === "importing";

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "200px",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-6 p-6">
          {/* Header */}
          <div className="flex items-center gap-4">
            <Link href="/posts">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Posts
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold">Bulk Import</h1>
            </div>
          </div>

          {/* Stage: input */}
          {(stage === "input" || stage === "preview") && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileJson className="h-5 w-5" />
                    JSON Input
                  </CardTitle>
                  <CardDescription>
                    Paste a JSON array or drop a{" "}
                    <code className="text-xs">.json</code> file. Each item
                    needs at minimum{" "}
                    <code className="text-xs">title</code>,{" "}
                    <code className="text-xs">content</code>, and{" "}
                    <code className="text-xs">category</code> (use a category
                    slug, e.g. <code className="text-xs">writing</code>).
                    Maximum 50 posts per import.{" "}
                    <code className="text-xs">
                      Import multiple posts at once from a JSON file. All posts are
                      created as <strong>drafts</strong> — review and publish after
                      import.
                    </code>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Drop zone */}
                  <div
                    className={cn(
                      "relative rounded-lg border-2 border-dashed transition-colors",
                      isDragging
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-muted-foreground/40"
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    <Textarea
                      value={raw}
                      onChange={handleTextChange}
                      className="min-h-[240px] font-mono text-xs border-0 bg-transparent resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      spellCheck={false}
                      placeholder={raw ? undefined : PLACEHOLDER}
                      disabled={isImporting}
                    />
                  </div>

                  {/* File / clear controls */}
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileRead(f);
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Browse file…
                    </Button>
                    {raw && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleClear}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Clear
                      </Button>
                    )}
                  </div>

                  {/* Parse error */}
                  {parseError && (
                    <div className="flex items-center gap-2 text-sm text-destructive rounded-md bg-destructive/10 border border-destructive/30 p-3">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      {parseError}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Preview table — shown once there are parsed items */}
              {items.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Preview</CardTitle>
                        <CardDescription>
                          {validItems.length} valid ·{" "}
                          {invalidItems.length > 0 && (
                            <span className="text-destructive">
                              {invalidItems.length} invalid (will be skipped)
                            </span>
                          )}
                          {invalidItems.length === 0 && "0 invalid"}
                        </CardDescription>
                      </div>
                      <Button
                        onClick={() => {
                          setStage("preview");
                          handleImport();
                        }}
                        disabled={validItems.length === 0 || isImporting}
                      >
                        {isImporting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Importing…
                          </>
                        ) : (
                          <>Import {validItems.length} post{validItems.length !== 1 ? "s" : ""}</>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PreviewTable items={items} />
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Stage: importing */}
          {stage === "importing" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Importing {validItems.length} post
                  {validItems.length !== 1 ? "s" : ""}…
                </p>
              </CardContent>
            </Card>
          )}

          {/* Stage: done */}
          {stage === "done" && importResults && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Import Complete</CardTitle>
                    <CardDescription>
                      <span className="text-green-600 dark:text-green-400 font-medium">
                        {importResults.created} created
                      </span>
                      {importResults.failed > 0 && (
                        <>
                          {" · "}
                          <span className="text-destructive font-medium">
                            {importResults.failed} failed
                          </span>
                        </>
                      )}
                      {" · "}All successful posts are saved as drafts.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setStage("input");
                        setImportResults(null);
                        handleClear();
                      }}
                    >
                      Import More
                    </Button>
                    <Link href="/posts">
                      <Button>View Posts</Button>
                    </Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResultsTable results={importResults.results} items={items} />
              </CardContent>
            </Card>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

// ---------------------------------------------------------------------------
// Preview table
// ---------------------------------------------------------------------------

function PreviewTable({ items }: { items: ParsedItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Content</TableHead>
          <TableHead>Tags</TableHead>
          <TableHead className="w-8"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const isValid = item.errors.length === 0;
          return (
            <TableRow
              key={item.index}
              className={cn(!isValid && "bg-destructive/5")}
            >
              <TableCell className="text-muted-foreground text-xs">
                {item.index + 1}
              </TableCell>
              <TableCell className="font-medium max-w-[220px] truncate">
                {item.data?.title ??
                  String(
                    (item.raw as Record<string, unknown>)?.title ?? "—"
                  )}
              </TableCell>
              <TableCell>
                {item.data ? (
                  <Badge
                    variant={
                      item.categoryValid === false ? "destructive" : "secondary"
                    }
                    className="text-xs font-mono"
                  >
                    {item.data.category}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {item.data
                  ? `${item.data.content.length.toLocaleString()} chars`
                  : "—"}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {item.data?.tags?.map((t) => (
                    <Badge key={t} variant="outline" className="text-xs">
                      {t}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                {isValid ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                ) : (
                  <div className="group relative">
                    <AlertCircle className="h-4 w-4 text-destructive cursor-help" />
                    <div className="absolute right-0 top-5 z-10 hidden group-hover:block w-64 rounded-md bg-popover border shadow-md p-2 text-xs space-y-1">
                      {item.errors.map((e, i) => (
                        <p key={i} className="text-destructive">
                          {e}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

function ResultsTable({
  results,
  items,
}: {
  results: BulkImportResult["results"];
  items: ParsedItem[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8">#</TableHead>
          <TableHead>Title</TableHead>
          <TableHead className="w-24">Status</TableHead>
          <TableHead>Detail</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((r) => (
          <TableRow
            key={r.index}
            className={cn(!r.success && "bg-destructive/5")}
          >
            <TableCell className="text-muted-foreground text-xs">
              {r.index + 1}
            </TableCell>
            <TableCell className="font-medium max-w-[280px] truncate">
              {r.title}
            </TableCell>
            <TableCell>
              {r.success ? (
                <Badge
                  variant="secondary"
                  className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Created
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Failed
                </Badge>
              )}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {r.success ? "Saved as draft" : r.error}
            </TableCell>
          </TableRow>
        ))}
        {/* Skipped (invalid) items from preview */}
        {items
          .filter((it) => it.errors.length > 0)
          .map((it) => (
            <TableRow key={`skip-${it.index}`} className="bg-muted/30">
              <TableCell className="text-muted-foreground text-xs">
                {it.index + 1}
              </TableCell>
              <TableCell className="font-medium max-w-[280px] truncate text-muted-foreground">
                {it.data?.title ??
                  String(
                    (it.raw as Record<string, unknown>)?.title ?? "—"
                  )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="text-muted-foreground">
                  Skipped
                </Badge>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {it.errors.join("; ")}
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
