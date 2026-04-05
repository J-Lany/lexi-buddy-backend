import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TelegramNotificationsService } from './telegram-notifications.service';

@Module({
  imports: [HttpModule],
  providers: [TelegramNotificationsService],
  exports: [TelegramNotificationsService],
})
export class TelegramNotificationsModule {}
