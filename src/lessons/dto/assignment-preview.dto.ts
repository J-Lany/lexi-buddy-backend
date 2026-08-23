import { AgeGroup, InstructionLanguage, Language, Level } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { MAX_GENERATION_WORDS } from '../constants';

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
  @Max(MAX_GENERATION_WORDS)
  questionsCount!: number;

  @ApiProperty({ maxItems: MAX_GENERATION_WORDS })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_GENERATION_WORDS)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
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
