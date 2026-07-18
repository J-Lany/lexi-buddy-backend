import { AgeGroup, InstructionLanguage, Language, Level } from '@prisma/client';
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

  @ApiProperty({
    enum: Language,
    required: false,
    default: Language.english,
    description: 'L2: language of the target phrases',
  })
  @IsOptional()
  @IsEnum(Language)
  targetLanguage?: Language;

  @ApiProperty({
    enum: Language,
    required: false,
    default: Language.russian,
    description: 'L1: translation language',
  })
  @IsOptional()
  @IsEnum(Language)
  nativeLanguage?: Language;

  @ApiProperty({
    enum: InstructionLanguage,
    required: false,
    default: InstructionLanguage.native,
    description: 'Language for task instructions',
  })
  @IsOptional()
  @IsEnum(InstructionLanguage)
  instructionLanguage?: InstructionLanguage;

  @ApiProperty({ enum: Level, required: false })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiProperty({ enum: AgeGroup, required: false })
  @IsOptional()
  @IsEnum(AgeGroup)
  ageGroup?: AgeGroup;
}
