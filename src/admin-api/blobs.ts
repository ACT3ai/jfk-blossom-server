import { eq, like, inArray, asc, desc, count, sql, type SQL } from "drizzle-orm";
import router from "./router.js";
import { db, blobDB } from "../db/db.js";
import * as schema from "../db/schema.js";
import { getBlobURL } from "../helpers/blob.js";
import storage from "../storage/index.js";
import { parseGetListQuery, setContentRange } from "./helpers.js";
import { Request } from "koa";

function blobRowToBlob(row: any, req?: Request) {
  return {
    ...row,
    owners: row.owners ? row.owners.split(",") : [],
    id: row.sha256,
    url: getBlobURL(row, req ? req.protocol + "://" + req.host : undefined),
  };
}

const blobColumns = {
  sha256: schema.blobs.sha256,
  type: schema.blobs.type,
  size: schema.blobs.size,
  uploaded: schema.blobs.uploaded,
} as const;

type BlobColumnName = keyof typeof blobColumns;

function safeColumn(name: string): BlobColumnName {
  if (name in blobColumns) return name as BlobColumnName;
  throw new Error("Invalid column name");
}

function buildWhereConditions(filter: Record<string, any> | undefined, searchFields: string[]): SQL[] {
  const conditions: SQL[] = [];
  if (!filter) return conditions;

  for (const [key, value] of Object.entries(filter)) {
    if (key === "q") {
      const orConditions = searchFields.map((field) => like(blobColumns[safeColumn(field)], `%${value}%`));
      if (orConditions.length > 0) {
        conditions.push(sql`(${sql.join(orConditions, sql` OR `)})`);
      }
    } else if (Array.isArray(value)) {
      conditions.push(inArray(blobColumns[safeColumn(key)], value));
    } else {
      conditions.push(eq(blobColumns[safeColumn(key)], value));
    }
  }
  return conditions;
}

// getOne
router.get("/blobs/:id", async (ctx) => {
  const rows = await db
    .select({
      sha256: schema.blobs.sha256,
      type: schema.blobs.type,
      size: schema.blobs.size,
      uploaded: schema.blobs.uploaded,
      owners: sql<string>`string_agg(${schema.owners.pubkey}, ',')`,
    })
    .from(schema.blobs)
    .leftJoin(schema.owners, eq(schema.owners.blob, schema.blobs.sha256))
    .where(eq(schema.blobs.sha256, ctx.params.id))
    .groupBy(schema.blobs.sha256);

  if (rows[0]) ctx.body = blobRowToBlob(rows[0], ctx.request);
});

// delete blob
router.delete("/blobs/:id", async (ctx) => {
  await blobDB.removeBlob(ctx.params.id);
  if (await storage.hasBlob(ctx.params.id)) await storage.removeBlob(ctx.params.id);
  ctx.body = { success: true };
});

// getList / getMany
router.get("/blobs", async (ctx) => {
  const { filter, sort, range } = parseGetListQuery(ctx.query);

  const conditions = buildWhereConditions(filter, ["sha256", "type"]);
  const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

  // Count total
  const totalResult = await db
    .select({ count: count() })
    .from(schema.blobs)
    .where(whereClause);
  const total = totalResult[0].count;

  // Build main query
  let query = db
    .select({
      sha256: schema.blobs.sha256,
      type: schema.blobs.type,
      size: schema.blobs.size,
      uploaded: schema.blobs.uploaded,
      owners: sql<string>`string_agg(${schema.owners.pubkey}, ',')`,
    })
    .from(schema.blobs)
    .leftJoin(schema.owners, eq(schema.owners.blob, schema.blobs.sha256))
    .where(whereClause)
    .groupBy(schema.blobs.sha256)
    .$dynamic();

  if (sort) {
    const col = blobColumns[safeColumn(sort[0])];
    query = query.orderBy(sort[1] === "DESC" ? desc(col) : asc(col));
  }

  if (range) {
    query = query.limit(range[1] - range[0]).offset(range[0]);
  }

  const blobs = await query;

  setContentRange(ctx, range, blobs, total);
  ctx.body = blobs.map((r) => blobRowToBlob(r, ctx.request));
});
