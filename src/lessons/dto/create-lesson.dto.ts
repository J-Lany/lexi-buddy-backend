import { AgeGroup, Level } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SaveVocabItemDto } from './save-vocab-list.dto';
import { SaveAssignmentDto } from './save-assignment.dto';
import { ApiProperty } from '@nestjs/swagger';

export class CreateLessonDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty({ enum: Level, required: false })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiProperty({ enum: AgeGroup, required: true })
  @IsOptional()
  @IsEnum(AgeGroup)
  ageCategory?: AgeGroup;

  @ApiProperty()
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveVocabItemDto)
  vocabItems?: SaveVocabItemDto[];

  @ApiProperty()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaveAssignmentDto)
  assignments?: SaveAssignmentDto[];
}
