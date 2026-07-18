import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum DeleteLessonScope {
  ME = 'me',
  ALL = 'all',
}

export class DeleteLessonDto {
  @ApiProperty({
    enum: DeleteLessonScope,
    description:
      '"me" — archive for teacher only; "all" — permanently delete for everyone',
  })
  @IsEnum(DeleteLessonScope)
  scope!: DeleteLessonScope;
}
