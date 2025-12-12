import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  Get,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
  ApiOkResponse,
} from '@nestjs/swagger';

import { TeacherRequestsService } from './teacher-requests.service';
import { JwtAuthGuard } from 'auth/guards/jwt-auth.guard';
import { CurrentUser } from 'auth/decorators/current-user.decorator';
import { JwtPayload } from 'auth/types/jwt-payload.type';
import { CreateTeacherRequestDto } from './dto/create-teacher-request.dto';
import { RespondTeacherRequestDto } from './dto/respond-teacher-request.dto';

@ApiTags('teacher-requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('teacher-requests')
export class TeacherRequestsController {
  constructor(
    private readonly teacherRequestsService: TeacherRequestsService,
  ) {}

  @Post()
  @ApiOperation({
    summary: 'Teacher sends request to student to start working together',
  })
  @ApiCreatedResponse({ description: 'Invite created and sent to student' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTeacherRequestDto,
  ) {
    const teacherId = user.sub;
    return this.teacherRequestsService.requestStudent(teacherId, dto);
  }

  // Этот эндпоинт можно использовать, если студент будет подтверждать через веб.
  // В боевом варианте у тебя будет Telegram webhook, который дергает тот же service-метод.
  @Post(':inviteId/respond')
  @ApiOperation({ summary: 'Student responds to teacher request' })
  @ApiOkResponse({ description: 'Invite processed' })
  async respond(
    @CurrentUser() user: JwtPayload,
    @Param('inviteId', ParseIntPipe) inviteId: number,
    @Body() dto: RespondTeacherRequestDto,
  ) {
    const studentId = user.sub;
    return this.teacherRequestsService.respondToRequest(
      studentId,
      inviteId,
      dto,
    );
  }

  @Get('my')
  @ApiOperation({
    summary: 'Get all teacher requests created by current teacher',
  })
  @ApiOkResponse({ description: 'List of invites' })
  async getMyRequests(@CurrentUser() user: JwtPayload) {
    const teacherId = user.sub;
    return this.teacherRequestsService.getMyRequests(teacherId);
  }
}
