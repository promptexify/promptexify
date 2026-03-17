import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js uses .env.local; load it first so it takes precedence over .env
config({ path: ".env.local" });
config();

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  tablesFilter: [
    "users", "categories", "tags", "posts", "post_to_tag",
    "bookmarks", "favorites", "logs", "media", "settings",
  ],
  entities: {
    roles: {
      provider: "supabase",
    },
  },
});
