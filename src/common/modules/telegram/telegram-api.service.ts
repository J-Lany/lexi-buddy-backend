import { Injectable } from '@nestjs/common';
import axios from 'axios';

type TgGetUserProfilePhotosResponse = {
  ok: boolean;
  result?: {
    total_count: number;
    photos: Array<
      Array<{
        file_id: string;
        file_unique_id: string;
        width: number;
        height: number;
        file_size?: number;
      }>
    >;
  };
  description?: string;
};

type TgGetFileResponse = {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  };
  description?: string;
};

@Injectable()
export class TelegramApiService {
  private readonly token = process.env.TELEGRAM_BOT_TOKEN;

  private get apiBase() {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is missing in env');
    return `https://api.telegram.org/bot${this.token}`;
  }

  private get fileBase() {
    if (!this.token) throw new Error('TELEGRAM_BOT_TOKEN is missing in env');
    return `https://api.telegram.org/file/bot${this.token}`;
  }

  async getUserAvatarFileUrl(telegramId: number): Promise<string | null> {
    const photosRes = await axios.get<TgGetUserProfilePhotosResponse>(
      `${this.apiBase}/getUserProfilePhotos`,
      { params: { user_id: telegramId, limit: 1 }, timeout: 10_000 },
    );

    const ok = photosRes.data?.ok === true;
    const firstRow = photosRes.data?.result?.photos?.[0] ?? [];

    if (!ok) {
      return null;
    }

    if (!firstRow.length) {
      return null;
    }

    const best = firstRow[firstRow.length - 1];
    if (!best?.file_id) {
      return null;
    }

    const fileRes = await axios.get<TgGetFileResponse>(
      `${this.apiBase}/getFile`,
      {
        params: { file_id: best.file_id },
        timeout: 10_000,
      },
    );

    const fileOk = fileRes.data?.ok === true;
    const filePath = fileRes.data?.result?.file_path ?? null;

    if (!fileOk || !filePath) {
      return null;
    }

    return `${this.fileBase}/${filePath}`;
  }
}
