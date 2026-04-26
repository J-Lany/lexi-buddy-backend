import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveVocabItemDto {
  @ApiProperty()
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty()
  @IsString()
  term!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  translation?: string;

  @ApiProperty()
  @IsArray()
  @IsString({ each: true })
  synonyms?: string[];
}

export class SaveVocabListDto {
  @ApiProperty()
  @IsArray()
  @ArrayNotEmpty()
  items!: SaveVocabItemDto[];
}
