import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { Throttle } from '@nestjs/throttler';
import { LessonsService } from './lessons.service';
import { JwtAuthGuard } from 'auth/guards/jwt-auth.guard';
import { CurrentUser } from 'auth/decorators/current-user.decorator';
import { JwtPayload } from 'auth/types/jwt-payload.type';

import { CreateLessonDto } from './dto/create-lesson.dto';
import { DeleteLessonDto, DeleteLessonScope } from './dto/delete-lesson.dto';
import { VocabPreviewDto } from './dto/vocab-preview.dto';
import { SaveVocabListDto } from './dto/save-vocab-list.dto';
import { AssignmentPreviewDto } from './dto/assignment-preview.dto';
import { SaveAssignmentDto } from './dto/save-assignment.dto';
import { AssignLessonDto } from './dto/assign-lesson.dto';
import { LessonSummaryDto } from './dto/lesson-summary.dto';

@ApiTags('lessons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('lessons')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all lessons for current teacher (summary info)',
  })
  @ApiOkResponse({
    description: 'List of lessons with high-level info',
    type: LessonSummaryDto,
    isArray: true,
  })
  async getLessons(@CurrentUser() user: JwtPayload) {
    const teacherId = user.sub;
    return this.lessonsService.getLessonsForTeacher(teacherId);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a lesson skeleton for the current teacher',
  })
  @ApiCreatedResponse({
    description: 'Newly created lesson',
  })
  async createLesson(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateLessonDto,
  ) {
    const teacherId = user.sub;
    return this.lessonsService.createLesson(dto, teacherId);
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Get lesson details (vocab, assignments, etc.) for current teacher',
  })
  @ApiOkResponse({
    description: 'Lesson with vocab and assignments',
  })
  async getLesson(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) lessonId: number,
  ) {
    const teacherId = user.sub;
    return this.lessonsService.getLessonForTeacher(lessonId, teacherId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('vocab/preview')
  @ApiOperation({
    summary:
      'Preview vocabulary translation & synonyms via AI (no DB write, no lesson created)',
  })
  @ApiOkResponse({
    description: 'Array of vocab items with translations and synonyms',
  })
  async vocabPreview(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VocabPreviewDto,
  ) {
    return this.lessonsService.vocabPreview(dto);
  }

  @Put(':id/vocab')
  @ApiOperation({
    summary: 'Save teacher-approved vocabulary list for the lesson',
  })
  @ApiCreatedResponse({
    description: 'Saved vocab items attached to the lesson',
  })
  async updateVocab(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) lessonId: number,
    @Body() dto: SaveVocabListDto,
  ) {
    const teacherId = user.sub;
    return this.lessonsService.updateVocab(lessonId, dto, teacherId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('assignments/preview')
  @ApiOperation({
    summary:
      'Preview generated assignment questions via AI (no DB write, no lesson created)',
  })
  @ApiOkResponse({
    description: 'Array of generated questions & answers',
  })
  async assignmentPreview(
    @CurrentUser() user: JwtPayload,
    @Body() dto: AssignmentPreviewDto,
  ) {
    return this.lessonsService.assignmentPreview(dto);
  }

  @Put(':id/assignments')
  @ApiOperation({
    summary: 'Save teacher-approved assignment for the lesson',
  })
  @ApiCreatedResponse({
    description: 'Created assignment with questions and answers',
  })
  async updateAssignments(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) lessonId: number,
    @Body() dto: SaveAssignmentDto,
  ) {
    const teacherId = user.sub;
    return this.lessonsService.updateAssignments(lessonId, dto, teacherId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a lesson',
    description:
      '`scope=me` — archive for teacher only (students keep their assignments). `scope=all` — permanently delete for everyone.',
  })
  @ApiQuery({ name: 'scope', enum: DeleteLessonScope, required: true })
  @ApiOkResponse({ schema: { example: { ok: true } } })
  async deleteLesson(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) lessonId: number,
    @Query() dto: DeleteLessonDto,
  ) {
    return this.lessonsService.deleteLesson(lessonId, user.sub, dto.scope);
  }

  @Post(':id/assign')
  @ApiOperation({
    summary: 'Assign lesson to selected students and/or groups',
  })
  @ApiCreatedResponse({
    description: 'Student assignments created',
  })
  async assignLesson(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) lessonId: number,
    @Body() dto: AssignLessonDto,
  ) {
    const teacherId = user.sub;
    return this.lessonsService.assignLesson(lessonId, dto, teacherId);
  }
}
