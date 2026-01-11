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
    try {
      const fileUrl = await this.telegramApi.getUserAvatarFileUrl(telegramId);

      if (!fileUrl) return null;

      const res = await axios.get<ArrayBuffer>(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 15_000,
      });

      const bytes = (res.data as any)?.byteLength ?? 0;
      const contentType =
        (res.headers['content-type'] as string | undefined) ?? 'image/jpeg';

      if (!bytes) {
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

      const { url } = await this.storage.uploadUserAvatar(
        telegramId,
        buffer,
        contentType,
        ext,
      );

      return url;
    } catch {
      return null;
    }
  }
}
