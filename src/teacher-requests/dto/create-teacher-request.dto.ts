import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateTeacherRequestDto {
  @ApiProperty({ description: 'ID студента, которого хотим пригласить' })
  @IsInt()
  studentId!: number;

  @ApiProperty({
    description: 'Сообщение ученику (опционально)',
    required: false,
  })
  @IsOptional()
  @IsString()
  message?: string;
}
