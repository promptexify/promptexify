import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL!,
    ssl: process.env.NODE_ENV === "production" || process.env.VERCEL ? "require" : false,
  },
  entities: {
    roles: {
      provider: "supabase",
    },
  },
});
