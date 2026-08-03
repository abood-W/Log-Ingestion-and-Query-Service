import { defineConfig } from "drizzle-kit";

process.loadEnvFile();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not defined");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",

  dbCredentials: {
    url: databaseUrl,
  },

  strict: true,
  verbose: true,
});
