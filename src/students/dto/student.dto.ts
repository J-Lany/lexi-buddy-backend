import { ApiProperty } from '@nestjs/swagger';
import { Level } from '@prisma/client';

export class StudentDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: Level, required: false, nullable: true })
  level: Level | null = null;

  @ApiProperty({ required: false, nullable: true })
  username: string | null = null;
}
