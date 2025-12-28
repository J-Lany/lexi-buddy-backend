import { IsArray, IsInt, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignLessonDto {
  @ApiProperty()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  studentIds?: number[];

  @ApiProperty()
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  groupIds?: number[];
}
