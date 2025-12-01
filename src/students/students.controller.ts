import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { StudentsService } from './students.service';
import { CurrentUser } from 'auth/decorators/current-user.decorator';
import { JwtPayload } from 'auth/types/jwt-payload.type';
import { JwtAuthGuard } from 'auth/guards/jwt-auth.guard';

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
  @ApiCreatedResponse({
    description: 'List of students with their Telegram names',
  })
  async getMyStudents(@CurrentUser() user: JwtPayload) {
    const teacherId = user.sub;

    return this.studentsService.getStudents(teacherId);
  }
}
