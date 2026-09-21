import { Client } from "minio";
import type { AppConfig } from "@ch/core";

export interface ObjectStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

export function keyFor(tenantSlug: string, cameraId: string, timestamp: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${timestamp.getUTCFullYear()}-${pad(timestamp.getUTCMonth() + 1)}-${pad(timestamp.getUTCDate())}`;
  const time = `${pad(timestamp.getUTCHours())}${pad(timestamp.getUTCMinutes())}${pad(timestamp.getUTCSeconds())}`;
  return `org/${tenantSlug}/${cameraId}/${date}/${time}.jpg`;
}

export function createObjectStorage(cfg: AppConfig): ObjectStorage {
  const client = new Client({
    endPoint: cfg.minio.endpoint,
    port: cfg.minio.port,
    useSSL: cfg.minio.useSsl,
    accessKey: cfg.minio.accessKey,
    secretKey: cfg.minio.secretKey,
  });

  return {
    async put(key: string, data: Buffer) {
      await client.putObject(cfg.minio.bucket, key, data, data.length, {
        "Content-Type": "image/jpeg",
      });
    },
    async get(key: string): Promise<Buffer> {
      const stream = await client.getObject(cfg.minio.bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    },
  };
}