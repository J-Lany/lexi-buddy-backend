import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
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
  @ApiProperty({ maxItems: 50 })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SaveVocabItemDto)
  items!: SaveVocabItemDto[];
}
