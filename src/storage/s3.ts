import { Readable } from "node:stream";
import {
  S3Client,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import mime from "mime";
import type { IBlobStorage } from "blossom-server-sdk/storage";
import logger from "../logger.js";

export type AwsS3StorageConfig = {
  endpoint: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  publicURL?: string;
  region?: string;
  port?: number;
  useSSL?: boolean;
  pathStyle?: boolean;
  useAccelerateEndpoint?: string;
};

export class AwsS3Storage implements IBlobStorage {
  private log = logger.extend("storage:s3");
  private client: S3Client;
  /** Non-accelerated client for control plane operations (HeadBucket, ListObjects) */
  private controlClient: S3Client;
  private bucket: string;

  public publicURL?: string;
  public objects: { name: string; size: number }[] = [];

  constructor(config: AwsS3StorageConfig) {
    const useSSL = config.useSSL ?? true;
    const protocol = useSSL ? "https" : "http";
    const port = config.port;
    const host = config.endpoint.replace(/^https?:\/\//, "");
    const endpoint = port ? `${protocol}://${host}:${port}` : `${protocol}://${host}`;
    const useAccelerateEndpoint = config?.useAccelerateEndpoint === "true";

    const credentials = {
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
    };
    const region = config.region || "us-east-1";
    const forcePathStyle = config.pathStyle ?? true;

    if (useAccelerateEndpoint) {
      // Accelerated client for data operations — cannot use custom endpoint or path-style
      this.client = new S3Client({
        region,
        credentials,
        forcePathStyle: false,
        useAccelerateEndpoint: true,
      });
      // Non-accelerated client with custom endpoint for control plane operations
      this.controlClient = new S3Client({
        endpoint,
        region,
        credentials,
        forcePathStyle,
      });
    } else {
      this.client = new S3Client({
        endpoint,
        region,
        credentials,
        forcePathStyle,
      });
      this.controlClient = this.client;
    }

    this.bucket = config.bucket;
    this.publicURL = config.publicURL;
  }

  async setup(): Promise<void> {
    try {
      await this.controlClient.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.log("Found bucket", this.bucket);
    } catch (err) {
      throw new Error("Can't find bucket " + this.bucket);
    }
    await this.loadObjects();
  }

  private async loadObjects(): Promise<void> {
    this.log("Loading objects...");
    this.objects = [];

    let continuationToken: string | undefined;
    do {
      const response = await this.controlClient.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: continuationToken,
        }),
      );

      if (response.Contents) {
        for (const obj of response.Contents) {
          if (obj.Key) {
            this.objects.push({ name: obj.Key, size: obj.Size ?? 0 });
          }
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    this.log(`Finished loading objects (${this.objects.length})`);
  }

  private getBlobObject(sha256: string) {
    return this.objects.find((obj) => obj.name?.startsWith(sha256));
  }

  private createObjectName(sha256: string, type?: string): string {
    const ext = type ? mime.getExtension(type) : null;
    return sha256 + (ext ? "." + ext : "");
  }

  async hasBlob(sha256: string): Promise<boolean> {
    return !!this.getBlobObject(sha256);
  }

  async listBlobs(): Promise<string[]> {
    const hashes: string[] = [];
    for (const object of this.objects) {
      const hash = object.name.match(/^[0-9a-f]{64}/)?.[0];
      if (hash) hashes.push(hash);
    }
    return hashes;
  }

  async writeBlob(sha256: string, stream: Readable | Buffer, type?: string): Promise<void> {
    const name = this.createObjectName(sha256, type);

    let body: Buffer;
    if (Buffer.isBuffer(stream)) {
      body = stream;
    } else {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      body = Buffer.concat(chunks);
    }

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: name,
        Body: body,
        ContentType: type,
      }),
    );

    this.objects.push({ name, size: body.length });
  }

  getBlobSize(sha256: string): number {
    const object = this.getBlobObject(sha256);
    if (!object) throw new Error("Object not found " + sha256);
    return object.size;
  }

  getBlobType(sha256: string): string | undefined {
    const object = this.getBlobObject(sha256);
    if (!object) throw new Error("Missing blob");
    return mime.getType(object.name) ?? undefined;
  }

  async readBlob(sha256: string): Promise<Readable> {
    const object = this.getBlobObject(sha256);
    if (!object) throw new Error("Object not found " + sha256);

    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: object.name,
      }),
    );

    return response.Body as Readable;
  }

  async removeBlob(sha256: string): Promise<void> {
    const object = this.getBlobObject(sha256);
    if (!object) throw new Error("Object not found " + sha256);

    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: object.name,
      }),
    );

    this.objects.splice(this.objects.indexOf(object), 1);
  }
}
