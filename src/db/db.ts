import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, gte, lte, type SQL } from "drizzle-orm";
import { config } from "../config.js";
import * as schema from "./schema.js";

export const pool = new pg.Pool({
  host: config.database.host,
  port: config.database.port,
  user: config.database.user,
  password: config.database.password,
  database: config.database.database,
});

export const db = drizzle(pool, { schema });

export const blobDB = {
  async hasBlob(sha256: string): Promise<boolean> {
    const result = await db.select({ sha256: schema.blobs.sha256 }).from(schema.blobs).where(eq(schema.blobs.sha256, sha256)).limit(1);
    return result.length > 0;
  },

  async getBlob(sha256: string) {
    const result = await db.select().from(schema.blobs).where(eq(schema.blobs.sha256, sha256)).limit(1);
    if (!result[0]) return undefined as any;
    return { ...result[0], type: result[0].type ?? undefined };
  },

  async addBlob(data: { sha256: string; size: number; type?: string | null; uploaded: number }) {
    const row = { sha256: data.sha256, size: data.size, type: data.type ?? null, uploaded: data.uploaded };
    await db.insert(schema.blobs).values(row).onConflictDoNothing();
    return { sha256: data.sha256, size: data.size, type: data.type ?? undefined, uploaded: data.uploaded };
  },

  async removeBlob(sha256: string): Promise<boolean> {
    const result = await db.delete(schema.blobs).where(eq(schema.blobs.sha256, sha256));
    return (result.rowCount ?? 0) > 0;
  },

  async hasOwner(sha256: string, pubkey: string): Promise<boolean> {
    const result = await db
      .select({ id: schema.owners.id })
      .from(schema.owners)
      .where(and(eq(schema.owners.blob, sha256), eq(schema.owners.pubkey, pubkey)))
      .limit(1);
    return result.length > 0;
  },

  async addOwner(sha256: string, pubkey: string): Promise<boolean> {
    await db.insert(schema.owners).values({ blob: sha256, pubkey });
    return true;
  },

  async removeOwner(sha256: string, pubkey: string): Promise<boolean> {
    const result = await db
      .delete(schema.owners)
      .where(and(eq(schema.owners.blob, sha256), eq(schema.owners.pubkey, pubkey)));
    return (result.rowCount ?? 0) > 0;
  },

  async listOwners(sha256: string): Promise<string[]> {
    const result = await db
      .select({ pubkey: schema.owners.pubkey })
      .from(schema.owners)
      .where(eq(schema.owners.blob, sha256));
    return result.map((r) => r.pubkey);
  },

  async getOwnerBlobs(pubkey: string, opts?: { since?: number; until?: number }) {
    const conditions: SQL[] = [eq(schema.owners.pubkey, pubkey)];
    if (opts?.since) conditions.push(gte(schema.blobs.uploaded, opts.since));
    if (opts?.until) conditions.push(lte(schema.blobs.uploaded, opts.until));

    const rows = await db
      .select({
        sha256: schema.blobs.sha256,
        type: schema.blobs.type,
        size: schema.blobs.size,
        uploaded: schema.blobs.uploaded,
      })
      .from(schema.blobs)
      .innerJoin(schema.owners, eq(schema.owners.blob, schema.blobs.sha256))
      .where(and(...conditions));

    return rows.map((r) => ({ ...r, type: r.type ?? undefined }));
  },
};

export default db;
