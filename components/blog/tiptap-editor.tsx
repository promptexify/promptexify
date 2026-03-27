"use client";

import { useMemo } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { GeistSans } from "geist/font/sans";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import CharacterCount from "@tiptap/extension-character-count";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { TiptapToolbar } from "./tiptap-toolbar";
import { cn } from "@/lib/utils";

const lowlight = createLowlight(common);

interface TiptapEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function TiptapEditor({
  value = "",
  onChange,
  placeholder = "Write your article here…",
  className,
  minHeight = "400px",
}: TiptapEditorProps) {
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        codeBlock: false, // replaced by CodeBlockLowlight
      }),
      CodeBlockLowlight.configure({ lowlight }),
      Image.configure({ allowBase64: false, inline: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    [placeholder]
  );

  const editor = useEditor({
    extensions,
    content: value,
    editorProps: {
      attributes: {
        class: cn(
          GeistSans.className,
          "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
          "prose-headings:font-semibold prose-headings:tracking-tight",
          "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono",
          "prose-pre:bg-muted prose-pre:text-sm",
          "prose-blockquote:border-l-primary",
          "prose-a:text-primary prose-a:underline",
          "p-4"
        ),
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
    immediatelyRender: false,
  });

  if (!editor) return null;

  const words = editor.storage.characterCount?.words?.() ?? 0;

  return (
    <div className={cn("rounded-md border border-input bg-background overflow-hidden", className)}>
      <TiptapToolbar editor={editor} />
      <EditorContent
        editor={editor}
        style={{ minHeight }}
        className="cursor-text"
        onClick={() => editor.commands.focus()}
      />
      <div className="flex items-center justify-end border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        {words} {words === 1 ? "word" : "words"}
      </div>
    </div>
  );
}
