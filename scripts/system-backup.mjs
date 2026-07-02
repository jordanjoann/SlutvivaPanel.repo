#!/usr/bin/env node
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const ROOT = process.env.SLUTVIVAL_ROOT || "/opt/slutvival";
const STAGING = process.env.SLUTVIVAL_BACKUP_STAGING_DIR || "/opt/slutvival/backups/staging";
const KEEP = Number(process.env.SLUTVIVAL_SYSTEM_BACKUP_KEEP || "3");

const required = [
  "B2_SYSTEM_BACKUPS_BUCKET",
  "B2_S3_ENDPOINT",
  "B2_REGION",
  "B2_SYSTEM_BACKUPS_KEY_ID",
  "B2_SYSTEM_BACKUPS_APPLICATION_KEY",
  "SLUTVIVAL_SYSTEM_BACKUP_AGE_RECIPIENT",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required for system backups.`);
}

const now = new Date();
const instant = now.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
const date = instant.slice(0, 10);
const dir = path.join(STAGING, "system");
const archive = path.join(dir, `system-${instant}.tar.zst`);
const encrypted = `${archive}.age`;
const key = `daily/${date}/system-${instant}.tar.zst.age`;

await fs.mkdir(dir, { recursive: true });
await run("tar", [
  "--zstd",
  "-cf",
  archive,
  "-C",
  ROOT,
  "--exclude=backups/staging",
  "--exclude=slutvival-panel/node_modules",
  "--exclude=slutvival-panel/.next",
  "--exclude=slutvival-platform/**/bin",
  "--exclude=slutvival-platform/**/obj",
  "--exclude=.git",
  ".",
]);
await run("age", ["-r", process.env.SLUTVIVAL_SYSTEM_BACKUP_AGE_RECIPIENT, "-o", encrypted, archive]);

const client = new S3Client({
  endpoint: process.env.B2_S3_ENDPOINT,
  region: process.env.B2_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.B2_SYSTEM_BACKUPS_KEY_ID,
    secretAccessKey: process.env.B2_SYSTEM_BACKUPS_APPLICATION_KEY,
  },
});

await client.send(
  new PutObjectCommand({
    Bucket: process.env.B2_SYSTEM_BACKUPS_BUCKET,
    Key: key,
    Body: createReadStream(encrypted),
    ContentType: "application/octet-stream",
  }),
);

const objects = await listSystemObjects(client);
const toDelete = objects.sort((a, b) => b.createdAt - a.createdAt).slice(KEEP);
for (const object of toDelete) {
  await client.send(new DeleteObjectCommand({ Bucket: process.env.B2_SYSTEM_BACKUPS_BUCKET, Key: object.key }));
}

await fs.rm(archive, { force: true });
await fs.rm(encrypted, { force: true });
console.log(`Uploaded system backup ${key} and deleted ${toDelete.length} old backups.`);

async function listSystemObjects(client) {
  const out = [];
  let token;
  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: process.env.B2_SYSTEM_BACKUPS_BUCKET,
        Prefix: "daily/",
        ContinuationToken: token,
      }),
    );
    for (const item of response.Contents ?? []) {
      if (item.Key) out.push({ key: item.Key, createdAt: item.LastModified?.getTime() ?? 0 });
    }
    token = response.NextContinuationToken;
  } while (token);
  return out;
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}
