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
import { ArrowLeft, Upload, FileJson, CheckCircle2, AlertCircle, Loader2, X, ClipboardCopy } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useCSRFForm } from "@/hooks/use-csrf";
import { blogBulkImportItemSchema, type BlogBulkImportItem } from "@/lib/schemas";
import { bulkImportBlogPostsAction, type BlogBulkImportResult } from "@/actions";

interface ParsedItem {
  index: number;
  raw: unknown;
  data?: BlogBulkImportItem;
  errors: string[];
}

type Stage = "input" | "preview" | "importing" | "done";

const PLACEHOLDER = `[
  {
    "title": "Getting Started with Cursor Rules",
    "content": "<p>Cursor rules are a powerful way to...</p>",
    "excerpt": "Learn how to set up your first Cursor rules file.",
    "status": "DRAFT"
  },
  {
    "title": "Top 10 MCP Configs for Developers",
    "content": "<h2>Introduction</h2><p>Model Context Protocol configs allow...</p>",
    "status": "PUBLISHED"
  }
]`;

function parseItems(text: string): { items: ParsedItem[]; parseError: string | null } {
  const trimmed = text.trim();
  if (!trimmed) return { items: [], parseError: null };
  let json: unknown;
  try { json = JSON.parse(trimmed); } catch {
    return { items: [], parseError: "Invalid JSON — check for missing quotes, commas, or brackets." };
  }
  if (!Array.isArray(json)) {
    return { items: [], parseError: "Expected a JSON array (starting with [ and ending with ])." };
  }
  return {
    items: json.map((raw, index) => {
      const result = blogBulkImportItemSchema.safeParse(raw);
      if (!result.success) {
        return { index, raw, errors: result.error.errors.map((e) => `${e.path.join(".") || "root"}: ${e.message}`) };
      }
      return { index, raw, data: result.data, errors: [] };
    }),
    parseError: null,
  };
}

export default function BlogImportPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { createFormDataWithCSRF, isReady } = useCSRFForm();

  const [raw, setRaw] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [items, setItems] = useState<ParsedItem[]>([]);
  const [stage, setStage] = useState<Stage>("input");
  const [importResults, setImportResults] = useState<BlogBulkImportResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && (!user || user.userData?.role !== "ADMIN")) router.push("/dashboard");
  }, [user, loading, router]);

  function handleParse(text: string) {
    const { items: parsed, parseError: err } = parseItems(text);
    setParseError(err);
    setItems(parsed);
  }

  function handleFileRead(file: File) {
    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      setParseError("Only .json files are accepted."); return;
    }
    const reader = new FileReader();
    reader.onload = (e) => { const text = e.target?.result as string; setRaw(text); handleParse(text); };
    reader.readAsText(file);
  }

  function handleClear() { setRaw(""); setItems([]); setParseError(null); if (fileInputRef.current) fileInputRef.current.value = ""; }

  const validItems   = items.filter((it) => it.errors.length === 0);
  const invalidItems = items.filter((it) => it.errors.length > 0);

  async function handleImport() {
    if (!isReady) { toast.error("Security verification in progress. Please wait."); return; }
    if (validItems.length === 0) return;
    setStage("importing");
    try {
      const fd = createFormDataWithCSRF();
      fd.set("posts_json", JSON.stringify(validItems.map((it) => it.raw)));
      const result = await bulkImportBlogPostsAction(fd);
      setImportResults(result);
      setStage("done");
      if (result.created > 0) toast.success(`${result.created} article${result.created !== 1 ? "s" : ""} imported.`);
      if (result.failed > 0) toast.warning(`${result.failed} article${result.failed !== 1 ? "s" : ""} failed.`);
    } catch (err) {
      setStage("preview");
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  }

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
      style={{ "--sidebar-width": "200px", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}
    >
      <AppSidebar variant="inset" user={user} />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="flex items-center gap-4">
            <Link href="/blog/admin">
              <Button variant="outline" size="sm"><ArrowLeft className="mr-2 h-4 w-4" />Back to Blog</Button>
            </Link>
            <h1 className="text-xl font-semibold">Import Articles</h1>
          </div>

          {(stage === "input" || stage === "preview") && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><FileJson className="h-5 w-5" />JSON Input</CardTitle>
                  <CardDescription>
                    Paste a JSON array or drop a <code className="text-xs">.json</code> file. Each item needs at minimum <code className="text-xs">title</code> and <code className="text-xs">content</code> (HTML string). Maximum 50 articles per import. All articles are created as <strong>drafts</strong> unless <code className="text-xs">status: "PUBLISHED"</code> is set.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div
                    className={cn("relative rounded-lg border-2 border-dashed transition-colors", isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/40")}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFileRead(f); }}
                  >
                    <Textarea
                      value={raw}
                      onChange={(e) => { setRaw(e.target.value); handleParse(e.target.value); }}
                      className="min-h-[240px] font-mono text-xs border-0 bg-transparent resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      spellCheck={false}
                      placeholder={raw ? undefined : PLACEHOLDER}
                      disabled={isImporting}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileRead(f); }} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Upload className="mr-2 h-4 w-4" />Browse file…
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(PLACEHOLDER); toast.success("Template copied to clipboard"); }}>
                      <ClipboardCopy className="mr-2 h-4 w-4" />Copy template
                    </Button>
                    {raw && (
                      <Button type="button" variant="ghost" size="sm" onClick={handleClear}>
                        <X className="mr-2 h-4 w-4" />Clear
                      </Button>
                    )}
                  </div>
                  {parseError && (
                    <div className="flex items-center gap-2 text-sm text-destructive rounded-md bg-destructive/10 border border-destructive/30 p-3">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />{parseError}
                    </div>
                  )}
                </CardContent>
              </Card>

              {items.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Preview</CardTitle>
                        <CardDescription>
                          {validItems.length} valid ·{" "}
                          {invalidItems.length > 0 ? <span className="text-destructive">{invalidItems.length} invalid (will be skipped)</span> : "0 invalid"}
                        </CardDescription>
                      </div>
                      <Button onClick={handleImport} disabled={validItems.length === 0 || isImporting}>
                        {isImporting ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Importing…</>
                        ) : (
                          <>Import {validItems.length} article{validItems.length !== 1 ? "s" : ""}</>
                        )}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-8">#</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Content</TableHead>
                          <TableHead className="w-8"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item) => (
                          <TableRow key={item.index} className={cn(item.errors.length > 0 && "bg-destructive/5")}>
                            <TableCell className="text-muted-foreground text-xs">{item.index + 1}</TableCell>
                            <TableCell className="font-medium max-w-[280px] truncate">{item.data?.title ?? String((item.raw as Record<string, unknown>)?.title ?? "—")}</TableCell>
                            <TableCell><Badge variant={item.data?.status === "PUBLISHED" ? "default" : "secondary"} className="text-xs">{item.data?.status ?? "—"}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{item.data ? `${item.data.content.length.toLocaleString()} chars` : "—"}</TableCell>
                            <TableCell>
                              {item.errors.length === 0 ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /> : (
                                <div className="group relative">
                                  <AlertCircle className="h-4 w-4 text-destructive cursor-help" />
                                  <div className="absolute right-0 top-5 z-10 hidden group-hover:block w-64 rounded-md bg-popover border shadow-md p-2 text-xs space-y-1">
                                    {item.errors.map((e, i) => <p key={i} className="text-destructive">{e}</p>)}
                                  </div>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {stage === "importing" && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Importing {validItems.length} article{validItems.length !== 1 ? "s" : ""}…</p>
              </CardContent>
            </Card>
          )}

          {stage === "done" && importResults && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Import Complete</CardTitle>
                    <CardDescription>
                      <span className="text-green-600 dark:text-green-400 font-medium">{importResults.created} created</span>
                      {importResults.failed > 0 && <> · <span className="text-destructive font-medium">{importResults.failed} failed</span></>}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => { setStage("input"); setImportResults(null); handleClear(); }}>Import More</Button>
                    <Link href="/blog/admin"><Button>View Articles</Button></Link>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
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
                    {importResults.results.map((r) => (
                      <TableRow key={r.index} className={cn(!r.success && "bg-destructive/5")}>
                        <TableCell className="text-muted-foreground text-xs">{r.index + 1}</TableCell>
                        <TableCell className="font-medium max-w-[280px] truncate">{r.title}</TableCell>
                        <TableCell>{r.success ? <Badge variant="secondary" className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30"><CheckCircle2 className="mr-1 h-3 w-3" />Created</Badge> : <Badge variant="destructive"><AlertCircle className="mr-1 h-3 w-3" />Failed</Badge>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.success ? "Saved" : r.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
