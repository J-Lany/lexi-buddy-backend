import { Equals, IsString, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterTelegramDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  telegramId!: number;

  @ApiProperty({
    description: 'Must be true: user accepted Terms/Privacy consent in the bot',
  })
  @Equals(true)
  consentAccepted!: boolean;

  @ApiProperty({
    description: 'Version of the legal documents the user accepted',
  })
  @IsInt()
  consentVersion!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  telegramAvatarUrl?: string;
}
