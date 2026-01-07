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

  /**
   * Возвращает прямой URL на файл аватарки (без скачивания),
   * либо null если фото нет/недоступно.
   */
  async getUserAvatarFileUrl(telegramId: number): Promise<string | null> {
    console.log('[TG API] getUserAvatarFileUrl:start', { telegramId });

    // 1) profile photos
    const photosRes = await axios.get<TgGetUserProfilePhotosResponse>(
      `${this.apiBase}/getUserProfilePhotos`,
      { params: { user_id: telegramId, limit: 1 }, timeout: 10_000 },
    );

    const ok = photosRes.data?.ok === true;
    const total = photosRes.data?.result?.total_count ?? 0;
    const firstRow = photosRes.data?.result?.photos?.[0] ?? [];

    console.log('[TG API] getUserProfilePhotos:result', {
      telegramId,
      httpStatus: photosRes.status,
      ok,
      total,
      firstRowSizes: firstRow.map((p) => `${p.width}x${p.height}`),
    });

    if (!ok) {
      console.log('[TG API] getUserProfilePhotos:not_ok', {
        telegramId,
        description: photosRes.data?.description ?? null,
      });
      return null;
    }

    if (!firstRow.length) {
      console.log('[TG API] no_profile_photos', { telegramId });
      return null;
    }

    // Берём самый большой размер (обычно последний)
    const best = firstRow[firstRow.length - 1];
    if (!best?.file_id) {
      console.log('[TG API] no_file_id_in_best_photo', { telegramId });
      return null;
    }

    console.log('[TG API] chosen_photo', {
      telegramId,
      fileIdSuffix: best.file_id.slice(-8),
      size: `${best.width}x${best.height}`,
      fileSize: best.file_size ?? null,
    });

    // 2) getFile -> file_path
    const fileRes = await axios.get<TgGetFileResponse>(
      `${this.apiBase}/getFile`,
      {
        params: { file_id: best.file_id },
        timeout: 10_000,
      },
    );

    const fileOk = fileRes.data?.ok === true;
    const filePath = fileRes.data?.result?.file_path ?? null;

    console.log('[TG API] getFile:result', {
      telegramId,
      httpStatus: fileRes.status,
      ok: fileOk,
      filePath,
    });

    if (!fileOk || !filePath) {
      console.log('[TG API] getFile:not_ok_or_no_path', {
        telegramId,
        description: fileRes.data?.description ?? null,
      });
      return null;
    }

    const url = `${this.fileBase}/${filePath}`;
    console.log('[TG API] avatar_file_url:ok', { telegramId, filePath });

    return url;
  }
}
