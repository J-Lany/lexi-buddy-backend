import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { TelegramApiService } from './telegram-api.service';
import { StorageService } from 'storage/storage.service';

@Injectable()
export class TelegramAvatarService {
  constructor(
    private readonly telegramApi: TelegramApiService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Best-effort: возвращает avatarUrl (Selectel), или null если аватара нет/ошибка.
   */
  async saveTelegramAvatarByTelegramId(
    telegramId: number,
  ): Promise<string | null> {
    console.log('[TG AVATAR] start', { telegramId });

    try {
      const fileUrl = await this.telegramApi.getUserAvatarFileUrl(telegramId);
      console.log('[TG AVATAR] fileUrl', { telegramId, hasUrl: !!fileUrl });

      if (!fileUrl) return null;

      // Скачиваем картинку в память
      const res = await axios.get<ArrayBuffer>(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
      });

      const bytes = (res.data as any)?.byteLength ?? 0;
      const contentType =
        (res.headers['content-type'] as string | undefined) ?? 'image/jpeg';

      console.log('[TG AVATAR] downloaded', {
        telegramId,
        httpStatus: res.status,
        bytes,
        contentType,
      });

      if (!bytes) {
        console.log('[TG AVATAR] downloaded_zero_bytes', { telegramId });
        return null;
      }

      const buffer = Buffer.from(res.data);

      const ext = contentType.includes('png')
        ? 'png'
        : contentType.includes('webp')
          ? 'webp'
          : contentType.includes('jpeg')
            ? 'jpg'
            : contentType.includes('jpg')
              ? 'jpg'
              : 'jpg';

      const { url, key } = await this.storage.uploadUserAvatar(
        telegramId,
        buffer,
        contentType,
        ext,
      );

      console.log('[TG AVATAR] uploaded', { telegramId, key, url });

      return url;
    } catch (e: any) {
      console.error('[TG AVATAR] error', {
        telegramId,
        message: e?.message ?? String(e),
        // если хочешь глубже — раскомментируй:
        // stack: e?.stack,
      });
      // Регистрация не должна падать из-за аватара
      return null;
    }
  }
}
