import { Equals, IsEmail, IsInt, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    description: 'Must be true: user accepted Terms/Privacy/PDN consent',
  })
  @Equals(true)
  consentAccepted!: boolean;

  @ApiProperty({
    description: 'Version of the legal documents the user accepted',
  })
  @IsInt()
  consentVersion!: number;
}
