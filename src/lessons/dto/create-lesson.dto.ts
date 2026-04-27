import { AgeGroup, InstructionLanguage, Language, Level } from '@prisma/client';
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

  @ApiProperty({
    enum: Language,
    required: false,
    default: Language.english,
    description: 'L2: language being taught',
  })
  @IsOptional()
  @IsEnum(Language)
  targetLanguage?: Language;

  @ApiProperty({
    enum: Language,
    required: false,
    default: Language.russian,
    description: 'L1: student native language (used for translations)',
  })
  @IsOptional()
  @IsEnum(Language)
  nativeLanguage?: Language;

  @ApiProperty({
    enum: InstructionLanguage,
    required: false,
    default: InstructionLanguage.native,
    description: 'Language for task instructions: native (L1) or target (L2)',
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
