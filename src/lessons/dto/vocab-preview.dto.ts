import { AgeGroup, Level } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';

import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class VocabPreviewDto {
  @ApiProperty()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  terms!: string[];

  @ApiProperty()
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiProperty()
  @IsOptional()
  @IsEnum(Level)
  level?: Level;

  @ApiProperty()
  @IsOptional()
  @IsEnum(AgeGroup)
  ageGroup?: AgeGroup;
}
