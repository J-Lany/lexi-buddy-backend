import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum TeacherRequestAction {
  ACCEPT = 'ACCEPT',
  DECLINE = 'DECLINE',
}

export class RespondTeacherRequestDto {
  @ApiProperty({ enum: TeacherRequestAction })
  @IsEnum(TeacherRequestAction)
  action!: TeacherRequestAction;
}
