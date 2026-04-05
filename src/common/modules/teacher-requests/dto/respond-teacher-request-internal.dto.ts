import { IsBoolean, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RespondTeacherRequestInternalDto {
  @ApiProperty({ description: 'ID студента' })
  @IsNumber()
  telegramId!: number;

  @ApiProperty({ description: 'Ответ' })
  @IsBoolean()
  accept!: boolean;
}
