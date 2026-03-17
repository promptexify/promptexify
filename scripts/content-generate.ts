/**
 * Enqueues a content generation job into the ContentAutomation BullMQ queue.
 *
 * The worker fetches the CSV from S3/Spaces, so fileUrl must be a valid
 * storage URL for the uploaded CSV file.
 *
 * Prerequisites: Redis running, worker running (npm run worker).
 *
 * Usage: tsx scripts/content-generate.ts <fileUrl> <fileName> [userId]
 * Example: tsx scripts/content-generate.ts https://bucket.s3.amazonaws.com/file.csv file.csv user-123
 */

import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { Queue } from "bullmq";
import IORedis from "ioredis";

const [fileUrl, fileName, userId] = process.argv.slice(2);
if (!fileUrl || !fileName) {
  console.error(
    "Usage: tsx scripts/content-generate.ts <fileUrl> <fileName> [userId]"
  );
  process.exit(1);
}

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});
const queue = new Queue("ContentAutomation", { connection });

await queue.add("process-csv", { fileUrl, fileName, userId });
console.log(`Enqueued process-csv job: ${fileName}`);

await queue.close();
await connection.quit();
