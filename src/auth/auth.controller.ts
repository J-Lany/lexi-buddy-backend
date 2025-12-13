import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Res,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto/register.dto';
import { RegisterTelegramDto } from './dto/register-telegram.dto/register-telegram.dto';
import { LoginrDto } from './dto/login.dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './types/jwt-payload.type';

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

  @Post('register/telegram')
  @ApiOperation({ summary: 'Register user using Telegram ID and username' })
  @ApiCreatedResponse({
    description: 'User registered and Telegram contact created',
  })
  @ApiBadRequestResponse({
    description: 'Username already exists or Telegram contact type not found',
  })
  registerTelegram(@Body() dto: RegisterTelegramDto) {
    return this.authService.registerTelegram(dto);
  }

  @Get('activate')
  @ApiOperation({ summary: 'Activate user using token' })
  @ApiCreatedResponse({ description: 'Account activated' })
  @ApiBadRequestResponse({ description: 'Missing or invalid token' })
  async activate(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Missing token');

    return this.authService.activate(token);
  }

  @Post('login')
  @ApiOperation({ summary: 'Register user using email & password' })
  @ApiBadRequestResponse({ description: 'Wrong email or password' })
  async login(
    @Body() dto: LoginrDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } =
      await this.authService.login(dto);

    res.cookie('access_token', accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 1000,
    });

    return user;
  }

  @Get('by-telegram')
  @ApiOperation({ summary: 'Get user by Telegram ID (for bot)' })
  @ApiOkResponse({ description: 'User found' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiBadRequestResponse({ description: 'Invalid telegramId' })
  async getByTelegram(@Query('telegramId') telegramId: string) {
    if (!telegramId) throw new BadRequestException('Missing telegramId');

    const id = Number(telegramId);
    if (!Number.isFinite(id))
      throw new BadRequestException('Invalid telegramId');

    return this.authService.getByTelegramId(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'Logout user using access token' })
  @ApiBadRequestResponse({ description: 'User is not found' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.sub);

    res.cookie('access_token', '', {
      httpOnly: true,
      expires: new Date(0),
    });

    res.cookie('refresh_token', '', {
      httpOnly: true,
      expires: new Date(0),
      path: '/auth/refresh',
    });
  }
}
