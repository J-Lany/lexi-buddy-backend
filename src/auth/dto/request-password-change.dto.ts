import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RequestPasswordChangeDto {
  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'newPassword123' })
  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}
