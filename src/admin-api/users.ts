import { eq, like, inArray, asc, desc, sql, type SQL } from "drizzle-orm";
import { db } from "../db/db.js";
import * as schema from "../db/schema.js";
import { getUserProfile } from "../user-profiles.js";
import { parseGetListQuery, setContentRange } from "./helpers.js";
import router from "./router.js";

function mapRowToUser(row: any) {
  return {
    ...row,
    id: row.pubkey,
    profile: getUserProfile(row.pubkey),
    blobs: row.blobs ? row.blobs.split(",") : [],
  };
}

function buildUserWhereConditions(filter: Record<string, any> | undefined): SQL[] {
  const conditions: SQL[] = [];
  if (!filter) return conditions;

  for (const [key, value] of Object.entries(filter)) {
    if (key === "q") {
      conditions.push(like(schema.owners.pubkey, `%${value}%`));
    } else if (key === "pubkey") {
      if (Array.isArray(value)) {
        conditions.push(inArray(schema.owners.pubkey, value));
      } else {
        conditions.push(eq(schema.owners.pubkey, value));
      }
    }
  }
  return conditions;
}

// getList / getMany
router.get("/users", async (ctx) => {
  const { filter, sort, range } = parseGetListQuery(ctx.query);

  const conditions = buildUserWhereConditions(filter);
  const whereClause = conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined;

  // Count total unique users
  const totalResult = await db
    .selectDistinct({ pubkey: schema.owners.pubkey })
    .from(schema.owners)
    .where(whereClause);
  const total = totalResult.length;

  // Build main query
  let query = db
    .select({
      pubkey: schema.owners.pubkey,
      blobs: sql<string>`string_agg(${schema.owners.blob}, ',')`,
    })
    .from(schema.owners)
    .where(whereClause)
    .groupBy(schema.owners.pubkey)
    .$dynamic();

  if (sort && sort[0] === "pubkey") {
    query = query.orderBy(sort[1] === "DESC" ? desc(schema.owners.pubkey) : asc(schema.owners.pubkey));
  }

  if (range) {
    query = query.limit(range[1] - range[0]).offset(range[0]);
  }

  const users = await query;

  setContentRange(ctx, range, users, total);
  ctx.body = users.map(mapRowToUser);
});
