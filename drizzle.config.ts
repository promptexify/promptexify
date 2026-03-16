import "dotenv/config";
import { defineConfig } from "drizzle-kit";

function getDatabaseUrl(): string {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DIRECT_URL or DATABASE_URL must be set");

  // Ensure SSL is enabled for production/Vercel environments
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("sslmode")) {
      parsed.searchParams.set("sslmode", "require");
    }
    return parsed.toString();
  }

  return url;
}

export default defineConfig({
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
  entities: {
    roles: {
      provider: "supabase",
    },
  },
});
