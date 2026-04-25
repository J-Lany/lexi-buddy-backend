import {
  Controller,
  Get,
  Patch,
  UseGuards,
  Query,
  Param,
  Body,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { CurrentUser } from 'auth/decorators/current-user.decorator';
import { JwtPayload } from 'auth/types/jwt-payload.type';
import { JwtAuthGuard } from 'auth/guards/jwt-auth.guard';
import { UpdateStudentDto } from './dto/update-student.dto';

@ApiTags('students')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('my')
  @ApiOperation({
    summary: 'Get all students associated with the current teacher',
  })
  @ApiOkResponse({
    description: 'List of students with their Telegram names',
  })
  async getMyStudents(@CurrentUser() user: JwtPayload) {
    const teacherId = user.sub;

    return this.studentsService.getStudents(teacherId);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search students by username' })
  @ApiQuery({ name: 'q', type: String, required: true })
  @ApiOkResponse({ description: 'List of matching students' })
  async searchStudents(@Query('q') q: string, @CurrentUser() user: JwtPayload) {
    const teacherId = user.sub;
    return this.studentsService.getAllStudents(teacherId, q);
  }

  @Get(':id/dashboard')
  @ApiOperation({ summary: 'Get student dashboard (for current teacher)' })
  @ApiOkResponse({ description: 'Student profile + lessons progress' })
  async getStudentDashboard(
    @Param('id', ParseIntPipe) studentId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const teacherId = user.sub;
    return this.studentsService.getStudentDashboard(teacherId, studentId);
  }

  @Get(':id/lessons/:lessonId/progress')
  @ApiOperation({ summary: 'Get student progress for a specific lesson' })
  @ApiOkResponse({
    description: 'Student lesson progress with attempts & answers',
  })
  async getStudentLessonProgress(
    @Param('id', ParseIntPipe) studentId: number,
    @Param('lessonId', ParseIntPipe) lessonId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const teacherId = user.sub;

    return this.studentsService.getStudentLessonProgress(
      teacherId,
      studentId,
      lessonId,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update student profile (for current teacher)' })
  @ApiOkResponse({ description: 'Updated student profile' })
  async updateStudent(
    @Param('id', ParseIntPipe) studentId: number,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    const teacherId = user.sub;

    return this.studentsService.updateStudentProfile(teacherId, studentId, dto);
  }

  @Delete(':id/relationship')
  @ApiOperation({ summary: 'Remove student from current teacher' })
  @ApiOkResponse({ description: 'Student detached from current teacher' })
  async removeStudentRelationship(
    @Param('id', ParseIntPipe) studentId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const teacherId = user.sub;

    return this.studentsService.removeStudentFromTeacher(teacherId, studentId);
  }
}
