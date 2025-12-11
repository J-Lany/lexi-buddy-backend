import { IsString, IsOptional, IsInt, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AgeGroup, Level } from '@prisma/client';

export class RegisterTelegramDto {
  @ApiProperty()
  @IsInt()
  telegramId!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ enum: AgeGroup, required: false })
  @IsOptional()
  @IsEnum(AgeGroup)
  ageGroup?: AgeGroup;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ enum: Level, required: false })
  @IsOptional()
  @IsEnum(Level)
  level?: Level;
}
