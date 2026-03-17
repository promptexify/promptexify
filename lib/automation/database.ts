/**
 * Automation Database Operations
 * Uses Drizzle ORM for all database interactions.
 */

import { db } from "@/lib/db";
import {
  users,
  categories,
  tags,
  posts,
  postToTag,
  logs,
} from "@/lib/db/schema";
import { eq, inArray, desc, and } from "drizzle-orm";
import { automationConfig } from "./config";
import type { ContentFile, PostData, TagData, ProcessingStats } from "./types";

/** Type for db or transaction client (both support select/insert/update/delete). */
export type TransactionClient =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function validateAuthorExists(authorId: string): Promise<void> {
  const [author] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.id, authorId))
    .limit(1);

  if (!author) {
    throw new Error(`Author with ID ${authorId} not found`);
  }

  if (
    automationConfig.requiredAuthorRole &&
    author.role !== automationConfig.requiredAuthorRole
  ) {
    throw new Error(
      `Author ${authorId} does not have the required role: ${automationConfig.requiredAuthorRole}`
    );
  }
}

export async function processContentFile(
  tx: TransactionClient,
  contentData: ContentFile,
  authorId: string,
  stats: ProcessingStats
): Promise<void> {
  const category = await upsertCategory(tx, contentData.category, stats);
  const tagRows = await upsertTags(tx, contentData.tags, stats);

  const postSlugs = contentData.posts.map((p) => p.slug);
  const existingRows = await tx
    .select({ slug: posts.slug })
    .from(posts)
    .where(inArray(posts.slug, postSlugs));
  const existingPostSlugs = new Set(existingRows.map((p) => p.slug));
  const newPostsData = contentData.posts.filter(
    (p) => !existingPostSlugs.has(p.slug)
  );

  for (const postData of newPostsData) {
    await createPost(tx, postData, category.id, tagRows, authorId, stats);
  }

  const skippedCount = contentData.posts.length - newPostsData.length;
  if (skippedCount > 0) {
    stats.warnings.push(
      `${skippedCount} posts already existed and were skipped.`
    );
  }
}

async function upsertCategory(
  tx: TransactionClient,
  categorySlug: string,
  stats: ProcessingStats
) {
  const [existing] = await tx
    .select()
    .from(categories)
    .where(eq(categories.slug, categorySlug))
    .limit(1);

  if (existing) return existing;

  stats.categoriesCreated++;
  const categoryName =
    categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1);
  const [created] = await tx
    .insert(categories)
    .values({
      name: categoryName,
      slug: categorySlug,
      description: `${categoryName} prompts and tools`,
    })
    .returning();
  return created!;
}

async function upsertTags(
  tx: TransactionClient,
  tagsData: TagData[],
  stats: ProcessingStats
) {
  const tagSlugs = tagsData.map((t) => t.slug);
  const existingRows = await tx
    .select()
    .from(tags)
    .where(inArray(tags.slug, tagSlugs));
  const existingTagSlugs = new Set(existingRows.map((t) => t.slug));
  const newTagsData = tagsData.filter((t) => !existingTagSlugs.has(t.slug));

  for (const t of newTagsData) {
    await tx.insert(tags).values({ name: t.name, slug: t.slug });
  }
  stats.tagsCreated += newTagsData.length;

  const allRows = await tx
    .select()
    .from(tags)
    .where(inArray(tags.slug, tagSlugs));
  return allRows.map((r) => ({ id: r.id }));
}

async function createPost(
  tx: TransactionClient,
  postData: PostData,
  categoryId: string,
  tagRows: { id: string }[],
  authorId: string,
  stats: ProcessingStats
) {
  const [post] = await tx
    .insert(posts)
    .values({
      title: postData.title,
      slug: postData.slug,
      description: postData.description ?? null,
      content: postData.content,
      authorId,
      categoryId,
      isPublished: postData.isPublished ?? false,
      status: postData.status ?? "DRAFT",
    })
    .returning();
  if (!post) return;

  for (const tag of tagRows) {
    await tx.insert(postToTag).values({ A: post.id, B: tag.id });
  }
  stats.postsCreated++;
}

export async function saveGenerationLog(log: {
  status: "success" | "error";
  message: string;
  filesProcessed?: number;
  postsCreated?: number;
  statusMessages?: string[];
  error?: string;
  userId?: string;
  duration?: number;
}) {
  try {
    await db.insert(logs).values({
      action: "automation",
      userId: log.userId ?? null,
      entityType: "content_generation",
      entityId: null,
      ipAddress: null,
      userAgent: null,
      metadata: {
        status: log.status,
        message: log.message,
        filesProcessed: log.filesProcessed ?? 0,
        postsCreated: log.postsCreated ?? 0,
        statusMessages: log.statusMessages ?? [],
        error: log.error,
        duration: log.duration ?? 0,
      },
      severity: log.status === "error" ? "HIGH" : "LOW",
    });
  } catch (error) {
    console.error("Error saving generation log:", error);
  }
}

export async function getGenerationLogs() {
  const dbLogsRows = await db
    .select()
    .from(logs)
    .where(
      and(eq(logs.action, "automation"), eq(logs.entityType, "content_generation"))
    )
    .orderBy(desc(logs.createdAt))
    .limit(50);

  return dbLogsRows.map((log) => {
    const metadata =
      log.metadata &&
      typeof log.metadata === "object" &&
      !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : {};

    return {
      id: log.id,
      timestamp: log.createdAt.toISOString(),
      status:
        typeof metadata.status === "string" &&
        (metadata.status === "success" || metadata.status === "error")
          ? (metadata.status as "success" | "error")
          : "error",
      message:
        typeof metadata.message === "string" ? metadata.message : "No message",
      filesProcessed:
        typeof metadata.filesProcessed === "number"
          ? metadata.filesProcessed
          : 0,
      postsCreated:
        typeof metadata.postsCreated === "number" ? metadata.postsCreated : 0,
      statusMessages: Array.isArray(metadata.statusMessages)
        ? metadata.statusMessages
        : [],
      error: typeof metadata.error === "string" ? metadata.error : undefined,
      userId: log.userId ?? undefined,
      severity: log.severity,
      duration: typeof metadata.duration === "number" ? metadata.duration : 0,
    };
  });
}
