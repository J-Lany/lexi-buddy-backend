import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitAttemptDto {
  @IsInt()
  @Min(1)
  @Max(3)
  attempt!: number;

  @IsOptional()
  answer?: any;

  @IsOptional()
  isCorrect?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  responseTimeMs?: number;
}

export class SubmitQuestionResultDto {
  @IsInt()
  questionId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitAttemptDto)
  attempts!: SubmitAttemptDto[];
}

export class SubmitAssignmentInternalDto {
  @IsInt()
  telegramId!: number;

  @IsInt()
  attemptId!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitQuestionResultDto)
  results!: SubmitQuestionResultDto[];

  @IsOptional()
  @IsString()
  clientSessionId?: string;
}
