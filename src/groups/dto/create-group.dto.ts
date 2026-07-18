import { IsString, IsOptional, IsArray, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Level } from '@prisma/client';

export class CreateGroupDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: Level, required: true })
  @IsOptional()
  @IsString()
  level!: Level;

  @ApiProperty({ type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  studentIds?: number[];
}
