import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DATABASE_HOST || "localhost",
    port: Number(process.env.DATABASE_PORT) || 5432,
    user: process.env.DATABASE_USER || "blossom",
    password: process.env.DATABASE_PASSWORD || "blossom",
    database: process.env.DATABASE_NAME || "blossom",
    ssl: false,
  },
});
