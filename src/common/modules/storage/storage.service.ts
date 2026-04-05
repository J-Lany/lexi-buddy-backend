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
  }

  async uploadUserAvatar(
    userId: number,
    buffer: Buffer,
    contentType: string,
    ext: string,
  ): Promise<{ key: string; url: string }> {
    const safeExt = ext.startsWith('.') ? ext : `.${ext}`;
    const key = `avatars/users/${userId}/${Date.now()}-${randomUUID()}${safeExt}`;

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

    return { key, url };
  }
}
