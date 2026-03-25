"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  FileJson,
  Upload,
  CheckCircle2,
  AlertCircle,
  X,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { postImportSchema, type PostImportData } from "@/lib/schemas";

interface PostJsonImportProps {
  onImport: (data: PostImportData) => void;
  disabled?: boolean;
}

type ParseState =
  | { status: "idle" }
  | { status: "valid"; data: PostImportData }
  | { status: "error"; errors: string[] };

const PLACEHOLDER = `{
  "title": "My Prompt Title",
  "content": "The full prompt content goes here...",
  "description": "Optional brief description",
  "slug": "optional-custom-slug",
  "tags": ["tag1", "tag2"]
}`;

export function PostJsonImport({ onImport, disabled }: PostJsonImportProps) {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState("");
  const [parseState, setParseState] = useState<ParseState>({ status: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parse(text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      setParseState({ status: "idle" });
      return;
    }

    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      setParseState({
        status: "error",
        errors: [
          "Invalid JSON — check for missing quotes, commas, or brackets.",
        ],
      });
      return;
    }

    const result = postImportSchema.safeParse(json);
    if (!result.success) {
      setParseState({
        status: "error",
        errors: result.error.errors.map(
          (e) => `${e.path.join(".") || "root"}: ${e.message}`
        ),
      });
      return;
    }

    setParseState({ status: "valid", data: result.data });
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setRaw(value);
    parse(value);
  }

  function handleFileRead(file: File) {
    if (!file.name.endsWith(".json") && file.type !== "application/json") {
      setParseState({
        status: "error",
        errors: ["Only .json files are accepted."],
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      setRaw(text);
      parse(text);
    };
    reader.readAsText(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileRead(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }

  function handleApply() {
    if (parseState.status !== "valid") return;
    onImport(parseState.data);
    handleClose();
  }

  function handleClose() {
    setOpen(false);
    // Small delay so the dialog close animation isn't janky
    setTimeout(() => {
      setRaw("");
      setParseState({ status: "idle" });
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }, 150);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <FileJson className="mr-2 h-4 w-4" />
        Import JSON
      </Button>

      <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Post from JSON</DialogTitle>
            <DialogDescription>
              Paste JSON below or drop a <code className="text-xs">.json</code>{" "}
              file. Fields populated:{" "}
              <code className="text-xs">title</code>,{" "}
              <code className="text-xs">content</code>,{" "}
              <code className="text-xs">description</code>,{" "}
              <code className="text-xs">slug</code>,{" "}
              <code className="text-xs">tags</code>.{" "}
              Category and publishing options must be set manually.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Drop zone / paste area */}
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
                className="min-h-[200px] font-mono text-xs border-0 bg-transparent resize-none focus-visible:ring-0 focus-visible:ring-offset-0"
                spellCheck={false}
                placeholder={raw ? undefined : PLACEHOLDER}
              />
            </div>

            {/* File picker + clear */}
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileInput}
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
                  onClick={() => {
                    setRaw("");
                    setParseState({ status: "idle" });
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>

            {/* Validation errors */}
            {parseState.status === "error" && (
              <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 space-y-1">
                <div className="flex items-center gap-2 text-destructive text-sm font-medium">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  Cannot import
                </div>
                {parseState.errors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive/80 ml-6">
                    {err}
                  </p>
                ))}
              </div>
            )}

            {/* Preview */}
            {parseState.status === "valid" && (
              <div className="rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 space-y-3">
                <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  Ready to import
                </div>
                <div className="space-y-2 text-sm">
                  <PreviewRow label="Title" value={parseState.data.title} />
                  {parseState.data.description && (
                    <PreviewRow
                      label="Description"
                      value={parseState.data.description}
                    />
                  )}
                  <PreviewRow
                    label="Content"
                    value={`${parseState.data.content.length.toLocaleString()} characters`}
                  />
                  {parseState.data.slug && (
                    <PreviewRow
                      label="Slug"
                      value={parseState.data.slug}
                      mono
                    />
                  )}
                  {parseState.data.tags && parseState.data.tags.length > 0 && (
                    <div className="flex items-start gap-3">
                      <span className="w-24 flex-shrink-0 text-muted-foreground">
                        Tags
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {parseState.data.tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={parseState.status !== "valid"}
              onClick={handleApply}
            >
              Apply to Form
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-24 flex-shrink-0 text-muted-foreground">{label}</span>
      <span
        className={cn(
          "min-w-0 break-words",
          mono && "font-mono text-xs"
        )}
      >
        {value}
      </span>
    </div>
  );
}
