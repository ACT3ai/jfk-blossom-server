import { mkdirp } from "mkdirp";
import { config } from "../config.js";
import { BlobMetadata } from "blossom-server-sdk";
import { LocalStorage, S3Storage, IBlobStorage } from "blossom-server-sdk/storage";
import dayjs from "dayjs";
import { eq, like, inArray, isNull, and } from "drizzle-orm";

import { BlobSearch, StoragePointer } from "../types.js";
import { db, blobDB } from "../db/db.js";
import * as schema from "../db/schema.js";
import logger from "../logger.js";
import { getExpirationTime } from "../rules/index.js";
import { forgetBlobAccessed, updateBlobAccess } from "../db/methods.js";
import { readUpload, removeUpload, UploadDetails } from "./upload.js";

async function createStorage() {
  if (config.storage.backend === "local") {
    await mkdirp(config.storage.local!.dir);
    return new LocalStorage(config.storage.local!.dir);
  } else if (config.storage.backend === "s3") {
    const s3 = new S3Storage(
      config.storage.s3!.endpoint,
      config.storage.s3!.accessKey,
      config.storage.s3!.secretKey,
      config.storage.s3!.bucket,
      config.storage.s3,
    );
    s3.publicURL = config.storage.s3!.publicURL;

    // Override writeBlob to remove the "x-amz-acl: public-read" header
    // so uploads work with S3 buckets that have Block Public Access enabled
    const _originalWriteBlob = s3.writeBlob.bind(s3);
    s3.writeBlob = async (sha256: string, stream: import("node:stream").Readable | Buffer, type?: string) => {
      const name = (s3 as any).createObjectName(sha256, type);
      await s3.client.putObject(s3.bucket, name, stream, undefined, {
        "Content-Type": type,
      });
      let size = 0;
      if (stream instanceof Buffer) {
        size = stream.length;
      }
      s3.objects.push({ name, size });
    };

    return s3;
  } else throw new Error("Unknown cache backend " + config.storage.backend);
}

const log = logger.extend("storage");

const storage: IBlobStorage = await createStorage();

log("Setting up storage");
await storage.setup();

export async function searchStorage(search: BlobSearch): Promise<StoragePointer | undefined> {
  const blob = await blobDB.getBlob(search.hash);
  if (blob && (await storage.hasBlob(search.hash))) {
    const type = blob.type || (await storage.getBlobType(search.hash));
    const size = blob.size || (await storage.getBlobSize(search.hash));
    log("Found", search.hash);
    return { kind: "storage", hash: search.hash, type: type, size };
  }
}

export function getStorageRedirect(pointer: StoragePointer) {
  const publicURL = config.storage.s3?.publicURL;
  if (storage instanceof S3Storage && publicURL) {
    const object = storage.objects.find((obj) => obj.name.startsWith(pointer.hash));
    if (object) return publicURL + object.name;
  }
}

export async function readStoragePointer(pointer: StoragePointer) {
  return await storage.readBlob(pointer.hash);
}

export async function addFromUpload(upload: UploadDetails, type?: string) {
  type = type || upload.type;

  let blob: BlobMetadata;

  if (!(await blobDB.hasBlob(upload.sha256))) {
    log("Saving", upload.sha256, type, upload.size);
    await storage.writeBlob(upload.sha256, readUpload(upload), type);
    await removeUpload(upload);

    const now = dayjs().unix();
    blob = await blobDB.addBlob({ sha256: upload.sha256, size: upload.size, type, uploaded: now });
    await updateBlobAccess(upload.sha256, dayjs().unix());
  } else {
    blob = await blobDB.getBlob(upload.sha256);
    await removeUpload(upload);
  }

  return blob;
}

export async function pruneStorage() {
  const now = dayjs().unix();
  const checked = new Set<string>();

  /** Remove all blobs that no longer fall under any rules */
  for (const rule of config.storage.rules) {
    const expiration = getExpirationTime(rule, now);

    const conditions = [like(schema.blobs.type, rule.type.replace("*", "%"))];
    if (rule.pubkeys?.length) {
      conditions.push(inArray(schema.owners.pubkey, rule.pubkeys));
    }

    const blobs = await db
      .select({
        sha256: schema.blobs.sha256,
        type: schema.blobs.type,
        size: schema.blobs.size,
        uploaded: schema.blobs.uploaded,
        pubkey: schema.owners.pubkey,
        accessed: schema.accessed.timestamp,
      })
      .from(schema.blobs)
      .leftJoin(schema.owners, eq(schema.owners.blob, schema.blobs.sha256))
      .leftJoin(schema.accessed, eq(schema.accessed.blob, schema.blobs.sha256))
      .where(and(...conditions));

    let n = 0;
    for (const blob of blobs) {
      if (checked.has(blob.sha256)) continue;

      if ((blob.accessed || blob.uploaded) < expiration) {
        log("Removing", blob.sha256, blob.type, "because", rule);
        await blobDB.removeBlob(blob.sha256);
        if (await storage.hasBlob(blob.sha256)) await storage.removeBlob(blob.sha256);
        await forgetBlobAccessed(blob.sha256);
      }

      n++;
      checked.add(blob.sha256);
    }
    if (n > 0) log("Checked", n, "blobs for rule #" + config.storage.rules.indexOf(rule));
  }

  // remove blobs with no owners
  if (config.storage.removeWhenNoOwners) {
    const orphanedBlobs = await db
      .select({ sha256: schema.blobs.sha256 })
      .from(schema.blobs)
      .leftJoin(schema.owners, eq(schema.owners.blob, schema.blobs.sha256))
      .where(isNull(schema.owners.blob));

    if (orphanedBlobs.length > 0) {
      log(`Removing ${orphanedBlobs.length} because they have no owners`);
      await db
        .delete(schema.blobs)
        .where(inArray(schema.blobs.sha256, orphanedBlobs.map((b) => b.sha256)));
    }
  }
}

export default storage;
