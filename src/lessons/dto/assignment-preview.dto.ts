import { AgeGroup, Level } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum FrontAssignmentType {
  DEFINITION_QUIZ = 'definition_quiz',
  GAP_FILLING = 'gap_filling',
  PHRASE_FAIL = 'phrase_fail',
  COLLOCATION_CHECK = 'collocation_check',
}

export class AssignmentPreviewDto {
  @ApiProperty({ enum: FrontAssignmentType, required: true })
  @IsEnum(FrontAssignmentType)
  type!: FrontAssignmentType;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(15)
  questionsCount!: number;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  terms!: string[];

  @ApiProperty()
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiProperty({ enum: Level, required: false })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiProperty({ enum: AgeGroup, required: false })
  @IsOptional()
  @IsEnum(AgeGroup)
  ageGroup?: AgeGroup;
}
