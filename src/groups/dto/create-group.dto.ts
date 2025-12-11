import { IsString, IsOptional, IsArray, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateGroupDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ type: [Number], required: false })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  studentIds?: number[];
}
