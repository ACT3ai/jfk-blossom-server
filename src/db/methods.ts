import dayjs from "dayjs";
import { eq } from "drizzle-orm";
import { db } from "./db.js";
import { accessed } from "./schema.js";

export async function updateBlobAccess(blob: string, accessedTime = dayjs().unix()) {
  await db
    .insert(accessed)
    .values({ blob, timestamp: accessedTime })
    .onConflictDoUpdate({ target: accessed.blob, set: { timestamp: accessedTime } });
}

export async function forgetBlobAccessed(blob: string) {
  await db.delete(accessed).where(eq(accessed.blob, blob));
}
