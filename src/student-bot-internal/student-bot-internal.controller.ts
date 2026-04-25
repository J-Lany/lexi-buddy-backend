import {
  Controller,
  Get,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
  Post,
} from '@nestjs/common';
import { ApiSecurity, ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Get all lessons assigned to a student' })
  @ApiQuery({ name: 'telegramId', type: Number, required: true })
  async getLessons(@Query('telegramId', ParseIntPipe) telegramId: number) {
    return this.service.getStudentLessonsByTelegramId(telegramId);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get student profile by Telegram ID' })
  @ApiQuery({ name: 'telegramId', type: Number, required: true })
  async getProfile(@Query('telegramId', ParseIntPipe) telegramId: number) {
    return this.service.getStudentProfileByTelegramId(telegramId);
  }

  @Get('lesson/assignments')
  @ApiOperation({ summary: 'Get all assignments for a specific lesson' })
  @ApiQuery({ name: 'telegramId', type: Number, required: true })
  @ApiQuery({ name: 'lessonId', type: Number, required: true })
  async getLessonAssignments(
    @Query('telegramId', ParseIntPipe) telegramId: number,
    @Query('lessonId', ParseIntPipe) lessonId: number,
  ) {
    return this.service.getLessonAssignmentsByTelegramId(telegramId, lessonId);
  }

  @Get('assignment/preview')
  @ApiOperation({ summary: 'Preview an assignment before starting' })
  @ApiQuery({ name: 'telegramId', type: Number, required: true })
  @ApiQuery({ name: 'assignmentId', type: Number, required: true })
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
  @ApiOperation({ summary: 'Start a new attempt for an assignment' })
  @ApiQuery({ name: 'telegramId', type: Number, required: true })
  @ApiQuery({ name: 'assignmentId', type: Number, required: true })
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
  @ApiOperation({ summary: 'Submit answers for an assignment attempt' })
  async submitAssignment(@Body() dto: SubmitAssignmentInternalDto) {
    return this.service.submitAssignmentAttemptByTelegramId(dto);
  }
}
