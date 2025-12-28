import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
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

  @ApiProperty()
  @IsArray()
  @ArrayNotEmpty()
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

  @ApiProperty()
  @IsInt()
  assignmentTypeId!: number;

  @ApiProperty()
  @IsArray()
  @ArrayNotEmpty()
  questions!: SaveAssignmentQuestionDto[];
}
