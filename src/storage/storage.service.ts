import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

@Injectable()
export class StorageService {
  private readonly s3: S3Client;

  private readonly bucket = process.env.S3_BUCKET!;
  private readonly publicBaseUrl = process.env.S3_PUBLIC_BASE_URL!;
  private readonly endpoint = process.env.S3_ENDPOINT!;
  private readonly region = process.env.S3_REGION!;

  constructor() {
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('S3_ACCESS_KEY / S3_SECRET_KEY missing');
    }

    if (!this.bucket || !this.publicBaseUrl || !this.endpoint || !this.region) {
      throw new Error(
        'S3 env missing (S3_BUCKET, S3_PUBLIC_BASE_URL, S3_ENDPOINT, S3_REGION)',
      );
    }

    this.s3 = new S3Client({
      region: this.region,
      endpoint: this.endpoint,
      credentials: { accessKeyId, secretAccessKey },
    });

    console.log('[S3] client_init', {
      bucket: this.bucket,
      region: this.region,
      endpoint: this.endpoint,
      publicBaseUrl: this.publicBaseUrl,
    });
  }

  /**
   * Загружает аватар. Ключ версионный -> можно cache-control "immutable".
   */
  async uploadUserAvatar(
    userId: number,
    buffer: Buffer,
    contentType: string,
    ext: string,
  ): Promise<{ key: string; url: string }> {
    const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
    const key = `avatars/users/${userId}/${Date.now()}-${randomUUID()}${safeExt}`;

    console.log('[S3] putObject:start', {
      bucket: this.bucket,
      key,
      bytes: buffer.length,
      contentType,
    });

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    const url = `${this.publicBaseUrl}/${key}`;

    console.log('[S3] putObject:ok', { key, url });

    return { key, url };
  }
}
