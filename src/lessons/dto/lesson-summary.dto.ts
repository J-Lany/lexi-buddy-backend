import { ApiProperty } from '@nestjs/swagger';

export class LessonSummaryDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  targetLanguage!: string;

  @ApiProperty()
  nativeLanguage!: string;

  @ApiProperty()
  instructionLanguage!: string;

  @ApiProperty({ required: false, nullable: true })
  topic?: string | null;

  @ApiProperty({ required: false, nullable: true })
  level!: string | null;

  @ApiProperty({ required: false, nullable: true })
  ageCategory!: string | null;

  @ApiProperty({ description: 'Количество слов (элементов vocab) в уроке' })
  vocabCount!: number;

  @ApiProperty({ description: 'Количество заданий (assignments) в уроке' })
  assignmentsCount!: number;
}
