import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { BackupStorageConfig } from "./config";

type Sender = { send(command: { constructor: { name: string } }): Promise<unknown> };

export class BackupObjectStorage {
  private sender: Sender;

  constructor(
    private config: BackupStorageConfig,
    sender?: Sender,
  ) {
    this.sender =
      sender ??
      (new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.keyId,
          secretAccessKey: config.applicationKey,
        },
      }) as Sender);
  }

  async uploadFile(key: string, file: string, contentType = "application/octet-stream"): Promise<void> {
    await this.sender.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: createReadStream(file),
        ContentType: contentType,
      }),
    );
    await this.sender.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async downloadFile(key: string, targetFile: string): Promise<void> {
    const response = (await this.sender.send(
      new GetObjectCommand({ Bucket: this.config.bucket, Key: key }),
    )) as { Body?: NodeJS.ReadableStream };
    if (!response.Body) throw new Error(`Backblaze object ${key} had no response body.`);
    await pipeline(response.Body, createWriteStream(targetFile));
  }

  async deleteObject(key: string): Promise<void> {
    await this.sender.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
  }

  async listObjects(prefix: string): Promise<Array<{ key: string; size: number; lastModified?: Date }>> {
    const objects: Array<{ key: string; size: number; lastModified?: Date }> = [];
    let token: string | undefined;
    do {
      const response = (await this.sender.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      )) as {
        Contents?: Array<{ Key?: string; Size?: number; LastModified?: Date }>;
        NextContinuationToken?: string;
      };
      for (const item of response.Contents ?? []) {
        if (item.Key) objects.push({ key: item.Key, size: item.Size ?? 0, lastModified: item.LastModified });
      }
      token = response.NextContinuationToken;
    } while (token);
    return objects;
  }
}
