import {
  Body,
  Controller,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { InternalTokenGuard } from 'auth/guards/internal-token.guard';
import { TeacherRequestsService } from './teacher-requests.service';
import { RespondTeacherRequestInternalDto } from './dto/respond-teacher-request-internal.dto';

@ApiTags('internal/teacher-requests')
@ApiSecurity('internal-token')
@UseGuards(InternalTokenGuard)
@Controller('internal/teacher-requests')
export class TeacherRequestsInternalController {
  constructor(
    private readonly teacherRequestsService: TeacherRequestsService,
  ) {}

  @Post(':inviteId/respond')
  async respondFromTelegram(
    @Param('inviteId', ParseIntPipe) inviteId: number,
    @Body() dto: RespondTeacherRequestInternalDto,
  ) {
    return this.teacherRequestsService.respondFromTelegram(
      dto.telegramId,
      inviteId,
      dto.accept,
    );
  }
}
