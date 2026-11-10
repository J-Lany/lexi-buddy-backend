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

export class StudentSearchResultDto extends StudentDto {
  @ApiProperty({ required: false, nullable: true })
  firstName: string | null = null;

  @ApiProperty({ required: false, nullable: true })
  lastName: string | null = null;

  @ApiProperty({ required: false, nullable: true })
  avatarUrl: string | null = null;

  @ApiProperty({ required: false, nullable: true })
  telegramId: string | null = null;
}
