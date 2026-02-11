import { pgTable, varchar, text, integer, serial, index } from "drizzle-orm/pg-core";

export const blobs = pgTable(
  "blobs",
  {
    sha256: varchar("sha256", { length: 64 }).primaryKey(),
    type: text("type"),
    size: integer("size").notNull(),
    uploaded: integer("uploaded").notNull(),
  },
  (table) => [index("blobs_uploaded").on(table.uploaded)],
);

export const owners = pgTable(
  "owners",
  {
    id: serial("id").primaryKey(),
    blob: varchar("blob", { length: 64 })
      .notNull()
      .references(() => blobs.sha256, { onDelete: "cascade" }),
    pubkey: varchar("pubkey", { length: 64 }).notNull(),
  },
  (table) => [index("owners_pubkey").on(table.pubkey)],
);

export const accessed = pgTable(
  "accessed",
  {
    blob: varchar("blob", { length: 64 }).primaryKey(),
    timestamp: integer("timestamp").notNull(),
  },
  (table) => [index("accessed_timestamp").on(table.timestamp)],
);
