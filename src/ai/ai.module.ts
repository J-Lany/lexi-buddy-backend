import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { AiService } from './ai.service';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
