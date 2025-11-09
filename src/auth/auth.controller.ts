import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto/register.dto';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register user using email & password' })
  @ApiCreatedResponse({ description: 'Activation email sent' })
  @ApiBadRequestResponse({ description: 'Email already exists' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Get('activate')
  @ApiOperation({ summary: 'Register user using email & password' })
  @ApiCreatedResponse({ description: 'Activation email sent' })
  @ApiBadRequestResponse({ description: 'Missing or invalid token' })
  async activate(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Missing token');

    return this.authService.activate(token);
  }
}
