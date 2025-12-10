import { IsString, IsOptional, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AgeGroup } from '@prisma/client';

export class RegisterTelegramDto {
  @ApiProperty()
  @IsInt()
  telegramId!: number;

  @ApiProperty()
  @IsString()
  firstName?: string;

  @ApiProperty()
  @IsString()
  lastName?: string;

  @ApiProperty({ enum: AgeGroup })
  @IsOptional()
  ageGroup?: AgeGroup;

  @ApiProperty()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty()
  @IsOptional()
  @IsString()
  level?: string;
}
