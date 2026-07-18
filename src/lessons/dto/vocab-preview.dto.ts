import { AgeGroup, InstructionLanguage, Language, Level } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class VocabPreviewDto {
  @ApiProperty({ maxItems: 50 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
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
    description: 'L2: language of the vocabulary terms',
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
