import {
  Controller,
  Get,
  Query,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from 'auth/guards/internal-token.guard';
import { StudentBotInternalService } from './student-bot-internal.service';

@ApiTags('internal/student')
@ApiSecurity('internal-token')
@UseGuards(InternalTokenGuard)
@Controller('internal/student')
export class StudentBotInternalController {
  constructor(private readonly service: StudentBotInternalService) {}

  @Get('lessons')
  async getLessons(@Query('telegramId', ParseIntPipe) telegramId: number) {
    return this.service.getStudentLessonsByTelegramId(telegramId);
  }

  @Get('profile')
  async getProfile(@Query('telegramId', ParseIntPipe) telegramId: number) {
    return this.service.getStudentProfileByTelegramId(telegramId);
  }

  @Get('lesson/assignments')
  async getLessonAssignments(
    @Query('telegramId', ParseIntPipe) telegramId: number,
    @Query('lessonId', ParseIntPipe) lessonId: number,
  ) {
    return this.service.getLessonAssignmentsByTelegramId(telegramId, lessonId);
  }
}
