/**
 * Automation Service
 *
 * Main automation service for content generation
 * Consolidates all automation functionality following Next.js best practices
 */

import { db } from "@/lib/db";
import { logs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { SecurityMonitor, SecurityEventType } from "@/lib/security/monitor";
import { automationConfig } from "./config";
import { ContentFileSchema, sanitizeContent } from "./validation";
import {
  validateAuthorExists,
  processContentFile,
  saveGenerationLog,
  getGenerationLogs,
} from "./database";
import type {
  ContentFile,
  GenerationResult,
  ProcessingStats,
  GenerationLog,
} from "./types";

/**
 * Processed content interface for direct JSON execution
 */
interface ProcessedContent {
  source: string;
  contentData: ContentFile;
  dataSize: number;
}

/**
 * Main automation service class
 */
export class AutomationService {
  /**
   * Executes content generation from JSON input directly
   */
  static async executeFromJsonInput(
    jsonData: ContentFile | ContentFile[],
    userId?: string,
    source: string = "direct-input"
  ): Promise<GenerationResult> {
    const stats: ProcessingStats = {
      filesProcessed: 0,
      postsCreated: 0,
      tagsCreated: 0,
      categoriesCreated: 0,
      errors: [],
      warnings: [],
    };

    const startTime = Date.now();
    const statusMessages: string[] = [];

    try {
      if (automationConfig.logging.enabled) {
        console.log(
          "🌱 Starting secure automated content generation from JSON input..."
        );
        statusMessages.push(
          "🌱 Starting secure automated content generation from JSON input..."
        );
      }

      // Validate author exists
      await validateAuthorExists(automationConfig.authorId);

      if (automationConfig.logging.enabled) {
        console.log(
          `📝 Using author: ${automationConfig.authorId} for generated content`
        );
        statusMessages.push(
          `📝 Using author: ${automationConfig.authorId} for generated content`
        );
      }

      // Normalize input to array
      const contentArray = Array.isArray(jsonData) ? jsonData : [jsonData];

      // Process content data
      const validatedContent = await this.validateAndProcessJsonData(
        contentArray,
        statusMessages,
        source
      );

      if (validatedContent.length === 0) {
        const message = "⚠️  No valid content data provided";
        console.log(message);
        statusMessages.push(message);

        const duration = Math.round((Date.now() - startTime) / 1000);
        return {
          output: statusMessages.join("\n"),
          duration,
          filesProcessed: 0,
          postsCreated: 0,
          statusMessages,
        };
      }

      if (automationConfig.logging.enabled) {
        console.log(`📁 Processing ${validatedContent.length} content items`);
        statusMessages.push(
          `📁 Processing ${validatedContent.length} content items`
        );
      }

      // Process content with concurrency control
      await this.processContentInBatches(
        validatedContent,
        stats,
        statusMessages
      );

      const duration = Math.round((Date.now() - startTime) / 1000);

      if (automationConfig.logging.enabled) {
        console.log(
          "\n🎉 Secure automated content generation completed successfully!"
        );
        console.log(`📊 Statistics:`, {
          filesProcessed: stats.filesProcessed,
          postsCreated: stats.postsCreated,
          tagsCreated: stats.tagsCreated,
          categoriesCreated: stats.categoriesCreated,
          errors: stats.errors.length,
          warnings: stats.warnings.length,
          duration: `${duration}s`,
        });
        statusMessages.push(
          "🎉 Secure automated content generation completed successfully!"
        );
      }

      // Save success log
      await saveGenerationLog({
        status: "success",
        message: `Content generation completed in ${duration}s`,
        filesProcessed: stats.filesProcessed,
        postsCreated: stats.postsCreated,
        statusMessages,
        userId,
        duration,
      });

      return {
        output: statusMessages.join("\n"),
        duration,
        filesProcessed: stats.filesProcessed,
        postsCreated: stats.postsCreated,
        statusMessages,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const duration = Math.round((Date.now() - startTime) / 1000);

      stats.errors.push(errorMessage);
      statusMessages.push(`❌ Error: ${errorMessage}`);

      await SecurityMonitor.logSecurityEvent(
        SecurityEventType.MALICIOUS_PAYLOAD,
        { error: errorMessage, context: "json_content_generation" },
        "high"
      );

      // Save error log
      await saveGenerationLog({
        status: "error",
        message: "Content generation failed",
        error: errorMessage,
        userId,
        duration,
      });

      console.error("❌ Error during content generation:", error);
      throw error;
    } finally {
      // intentionally not disconnecting the global Drizzle client here
    }
  }

  /**
   * Validates and processes raw JSON data
   */
  private static async validateAndProcessJsonData(
    contentArray: ContentFile[],
    statusMessages: string[],
    source: string = "direct-input"
  ): Promise<ProcessedContent[]> {
    const validatedContent: ProcessedContent[] = [];

    for (let i = 0; i < contentArray.length; i++) {
      try {
        const contentData = contentArray[i];

        // Use Buffer to avoid webpack serialization warnings for large strings
        const jsonBuffer = Buffer.from(JSON.stringify(contentData));
        const jsonSize = jsonBuffer.length;

        // Validate data size
        if (jsonSize > automationConfig.security.maxFileSize) {
          const message = `⚠️  Content item ${i + 1} exceeds size limit (${jsonSize} bytes), skipping...`;
          console.warn(message);
          statusMessages.push(message);
          continue;
        }

        // Parse from buffer to ensure data integrity
        const parsedData = JSON.parse(jsonBuffer.toString());

        // Validate against schema
        const validatedData = ContentFileSchema.parse(parsedData);

        // Additional security sanitization
        validatedData.posts = await Promise.all(
          validatedData.posts.map(async (post) => ({
            ...post,
            title: await sanitizeContent(post.title),
            description: await sanitizeContent(post.description),
            content: await sanitizeContent(post.content),
          }))
        );

        validatedContent.push({
          source: `${source}-${i + 1}`,
          contentData: validatedData,
          dataSize: jsonSize,
        });

        if (automationConfig.logging.verbose) {
          console.log(
            `✅ Validated content item ${i + 1} (${validatedData.posts.length} posts)`
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        const message = `❌ Error validating content item ${i + 1}: ${errorMessage}`;
        console.error(message);
        statusMessages.push(message);

        await SecurityMonitor.logSecurityEvent(
          SecurityEventType.MALICIOUS_PAYLOAD,
          { source: `${source}-${i + 1}`, error: errorMessage },
          "medium"
        );
      }
    }

    return validatedContent;
  }

  /**
   * Processes content in controlled batches to prevent overwhelming the database
   */
  private static async processContentInBatches(
    content: ProcessedContent[],
    stats: ProcessingStats,
    statusMessages: string[]
  ) {
    const { maxConcurrentFiles } = automationConfig.performance;

    // Process content in controlled batches
    for (let i = 0; i < content.length; i += maxConcurrentFiles) {
      const batch = content.slice(i, i + maxConcurrentFiles);

      await Promise.all(
        batch.map((item) => this.processContent(item, stats, statusMessages))
      );
    }
  }

  /**
   * Processes a single validated content item within a transaction
   */
  private static async processContent(
    content: ProcessedContent,
    stats: ProcessingStats,
    statusMessages: string[]
  ): Promise<void> {
    const { source, contentData } = content;

    try {
      if (automationConfig.logging.enabled) {
        console.log(`\n📄 Processing ${source}...`);
        statusMessages.push(`📄 Processing ${source}...`);
      }

      // Use transaction for data consistency
      await db.transaction((tx) =>
        processContentFile(tx, contentData, automationConfig.authorId, stats)
      );

      if (automationConfig.logging.enabled) {
        console.log(`✅ Completed processing ${source}`);
        statusMessages.push(`✅ Completed processing ${source}`);
      }

      stats.filesProcessed++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const message = `❌ Error processing ${source}: ${errorMessage}`;
      stats.errors.push(message);
      statusMessages.push(message);
      console.error(message);
    }
  }

  /**
   * Retrieves generation logs
   */
  static async getGenerationLogs(): Promise<GenerationLog[]> {
    return getGenerationLogs();
  }

  /**
   * Clears generation logs (admin only)
   */
  static async clearGenerationLogs(): Promise<void> {
    await db.delete(logs).where(eq(logs.action, "automation"));
    if (automationConfig.logging.enabled) {
      console.log("Cleared all generation logs.");
    }
  }
}
