import {
  Controller,
  Get,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
  Post,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from 'auth/guards/internal-token.guard';
import { StudentBotInternalService } from './student-bot-internal.service';
import { SubmitAssignmentInternalDto } from './dto/submit-assignment-internal.dto';

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

  @Get('assignment/preview')
  async previewAssignment(
    @Query('telegramId', ParseIntPipe) telegramId: number,
    @Query('assignmentId', ParseIntPipe) assignmentId: number,
  ) {
    return this.service.getAssignmentPreviewByTelegramId(
      telegramId,
      assignmentId,
    );
  }

  @Post('assignment/start')
  async startAssignment(
    @Query('telegramId', ParseIntPipe) telegramId: number,
    @Query('assignmentId', ParseIntPipe) assignmentId: number,
  ) {
    return this.service.startNewAssignmentAttemptByTelegramId(
      telegramId,
      assignmentId,
    );
  }

  @Post('assignment/submit')
  async submitAssignment(@Body() dto: SubmitAssignmentInternalDto) {
    return this.service.submitAssignmentAttemptByTelegramId(dto);
  }
}
