import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FrontAssignmentType } from './assignment-preview.dto';
import { ApiProperty } from '@nestjs/swagger';

export class SaveAssignmentAnswerDto {
  @ApiProperty()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty()
  @IsString()
  text!: string;

  @ApiProperty()
  @IsBoolean()
  isCorrect!: boolean;
}

export class SaveAssignmentQuestionDto {
  @ApiProperty()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty()
  @IsString()
  text!: string;

  @ApiProperty()
  @IsString()
  questionType!: 'multiple_choice' | 'gap_fill' | 'open_text';

  @ApiProperty({ maxItems: 6 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => SaveAssignmentAnswerDto)
  answers!: SaveAssignmentAnswerDto[];

  @ApiProperty()
  @IsOptional()
  @IsString()
  explanation?: string;
}

export class SaveAssignmentDto {
  @ApiProperty({ enum: FrontAssignmentType, required: true })
  @IsEnum(FrontAssignmentType)
  type!: FrontAssignmentType;

  @ApiProperty({ maxItems: 50 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SaveAssignmentQuestionDto)
  questions!: SaveAssignmentQuestionDto[];
}
