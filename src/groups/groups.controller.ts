import {
  Controller,
  Get,
  Delete,
  UseGuards,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiTags,
} from '@nestjs/swagger';

import { GroupsService } from './groups.service';
import { CurrentUser } from 'auth/decorators/current-user.decorator';
import { JwtPayload } from 'auth/types/jwt-payload.type';
import { JwtAuthGuard } from 'auth/guards/jwt-auth.guard';
import { CreateGroupDto } from './dto/create-group.dto';

@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get('my')
  @ApiOperation({
    summary: 'Get all groups associated with the current teacher',
  })
  @ApiCreatedResponse({
    description: 'List of groups with their students',
  })
  async getMyGroups(@CurrentUser() user: JwtPayload) {
    const teacherId = user.sub;

    return this.groupsService.getGroups(teacherId);
  }

  @Post('my')
  @ApiOperation({
    summary: 'Create a new group associated with the current teacher',
  })
  @ApiCreatedResponse({
    description: 'The newly created group with its students',
  })
  async createMyGroup(
    @CurrentUser() user: JwtPayload,
    @Body() createGroupDto: CreateGroupDto,
  ) {
    const teacherId = user.sub;

    return this.groupsService.createGroup(teacherId, createGroupDto);
  }

  @Delete(':groupId')
  @ApiOperation({ summary: 'Delete a group owned by the current teacher' })
  @ApiOkResponse({ description: 'Group successfully deleted' })
  async deleteMyGroup(
    @CurrentUser() user: JwtPayload,
    @Param('groupId', ParseIntPipe) groupId: number,
  ) {
    const teacherId = user.sub;

    return this.groupsService.deleteMyGroup(teacherId, groupId);
  }

  @Delete(':groupId/students/:studentId')
  @ApiOperation({
    summary:
      'Remove a specific student from a specific group owned by the current teacher',
  })
  @ApiOkResponse({ description: 'Student successfully removed from the group' })
  async removeStudentFromMyGroup(
    @CurrentUser() user: JwtPayload,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Param('studentId', ParseIntPipe) studentId: number,
  ) {
    const teacherId = user.sub;

    return this.groupsService.removeStudentFromGroup(
      teacherId,
      groupId,
      studentId,
    );
  }

  @Post(':groupId/students')
  @ApiOperation({
    summary: 'Add a student to an existing group owned by the current teacher',
  })
  @ApiCreatedResponse({
    description: 'Student successfully added to the group',
  })
  async addStudentToMyGroup(
    @CurrentUser() user: JwtPayload,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Query('studentId') studentId: number,
  ) {
    const teacherId = user.sub;

    return this.groupsService.addStudentToGroup(teacherId, groupId, studentId);
  }
}
