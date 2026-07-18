import { ArrayMaxSize, IsArray, IsInt, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignLessonDto {
  @ApiProperty({ maxItems: 200 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  studentIds?: number[];

  @ApiProperty({ maxItems: 50 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  groupIds?: number[];
}
