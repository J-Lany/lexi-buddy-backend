import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Res,
  BadRequestException,
  UnauthorizedException,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
  ApiNotFoundResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Response, Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto/register.dto';
import { RegisterTelegramDto } from './dto/register-telegram.dto/register-telegram.dto';
import { LoginrDto } from './dto/login.dto/login.dto';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { InternalTokenGuard } from './guards/internal-token.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtPayload } from './types/jwt-payload.type';
import { getAuthCookieOptions } from 'auth/utils/auth-cookie.util';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { RequestPasswordChangeDto } from './dto/request-password-change.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('register')
  @ApiOperation({ summary: 'Register user using email & password' })
  @ApiCreatedResponse({ description: 'Activation email sent' })
  @ApiBadRequestResponse({ description: 'Email already exists' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
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

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Get('activate')
  @ApiOperation({ summary: 'Activate user using token' })
  @ApiQuery({ name: 'token', type: String, required: true })
  @ApiOkResponse({ description: 'Account activated' })
  @ApiBadRequestResponse({ description: 'Missing or invalid token' })
  async activate(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Missing token');

    return this.authService.activate(token);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('login')
  @ApiOperation({ summary: 'Login user using email & password' })
  @ApiOkResponse({ description: 'User info returned, tokens set in cookies' })
  @ApiBadRequestResponse({ description: 'Wrong email or password' })
  async login(
    @Body() dto: LoginrDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } =
      await this.authService.login(dto);

    const cookieOptions = getAuthCookieOptions();

    res.cookie('access_token', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return user;
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access & refresh tokens using refresh cookie',
  })
  @ApiOkResponse({ description: 'Tokens refreshed' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token;
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await this.authService.refresh(refreshToken);
    const cookieOptions = getAuthCookieOptions();

    res.cookie('access_token', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', newRefreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return { message: 'Tokens refreshed' };
  }

  @UseGuards(InternalTokenGuard)
  @Get('by-telegram')
  @ApiOperation({ summary: 'Get user by Telegram ID (for bot)' })
  @ApiQuery({ name: 'telegramId', type: Number, required: true })
  @ApiOkResponse({ description: 'User found' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async getByTelegram(@Query('telegramId', ParseIntPipe) telegramId: number) {
    return this.authService.getByTelegramId(telegramId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current teacher profile' })
  @ApiOkResponse({ description: 'Teacher profile with defaultLanguage' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return this.authService.getProfile(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch('me')
  @ApiOperation({ summary: 'Update teacher profile (name, defaultLanguage)' })
  @ApiOkResponse({ description: 'Updated teacher profile' })
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('request-password-change')
  @ApiOperation({
    summary: 'Request password change — sends confirmation email',
  })
  @ApiOkResponse({ description: 'Confirmation email sent' })
  @ApiBadRequestResponse({
    description: 'Passwords do not match or no email on account',
  })
  requestPasswordChange(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RequestPasswordChangeDto,
  ) {
    return this.authService.requestPasswordChange(user.sub, dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('confirm-password-change')
  @ApiOperation({ summary: 'Confirm password change via token from email' })
  @ApiQuery({ name: 'token', type: String, required: true })
  @ApiOkResponse({ description: 'Password changed successfully' })
  @ApiBadRequestResponse({ description: 'Invalid or expired token' })
  confirmPasswordChange(@Query('token') token: string) {
    if (!token) throw new BadRequestException('Missing token');
    return this.authService.confirmPasswordChange(token);
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout user and clear auth cookies' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refresh_token;

    if (refreshToken) {
      await this.authService.revokeRefreshToken(refreshToken).catch(() => null);
    }

    const cookieOptions = getAuthCookieOptions();

    res.clearCookie('access_token', cookieOptions);
    res.clearCookie('refresh_token', cookieOptions);

    return { message: 'Logged out' };
  }
}
