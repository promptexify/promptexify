import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";
import { GeistSans } from "geist/font/sans";

interface ArticleContentProps {
  html: string;
  className?: string;
}

export function ArticleContent({ html, className }: ArticleContentProps) {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1","h2","h3","h4","h5","h6",
      "p","br","hr",
      "strong","em","code","pre","s","u","sub","sup",
      "ul","ol","li",
      "blockquote",
      "a","img",
      "table","thead","tbody","tr","th","td",
      "div","span",
    ],
    ALLOWED_ATTR: ["href","src","alt","title","class","target","rel","width","height"],
    ALLOW_DATA_ATTR: false,
  });

  return (
    <div
      className={cn(
        GeistSans.className,
        "prose prose-neutral dark:prose-invert max-w-none",
        "prose-headings:font-semibold prose-headings:tracking-tight",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:rounded-lg prose-pre:bg-muted prose-pre:text-sm prose-pre:overflow-x-auto",
        "prose-blockquote:border-l-4 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-img:rounded-lg prose-img:shadow-sm",
        "prose-hr:border-border",
        className
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
