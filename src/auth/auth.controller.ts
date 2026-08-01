import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { AppException } from 'common/errors';
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
  ApiSecurity,
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
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

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

  @UseGuards(InternalTokenGuard)
  @ApiSecurity('internal-token')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('register/telegram')
  @ApiOperation({
    summary:
      'Register user using Telegram ID and username (internal, bot-only)',
  })
  @ApiCreatedResponse({
    description: 'User registered and Telegram contact created',
  })
  @ApiBadRequestResponse({
    description: 'Username already exists or Telegram contact type not found',
  })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid internal token' })
  registerTelegram(@Body() dto: RegisterTelegramDto): Promise<{ id: number }> {
    return this.authService.registerTelegram(dto);
  }

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Get('activate')
  @ApiOperation({ summary: 'Activate user using token' })
  @ApiQuery({ name: 'token', type: String, required: true })
  @ApiOkResponse({ description: 'Account activated' })
  @ApiBadRequestResponse({ description: 'Missing or invalid token' })
  async activate(@Query('token') token: string) {
    if (!token) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'AUTH_INVALID_TOKEN');
    }

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
      throw new AppException(HttpStatus.UNAUTHORIZED, 'AUTH_SESSION_EXPIRED');
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
    if (!token) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'AUTH_INVALID_TOKEN');
    }
    return this.authService.confirmPasswordChange(token);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('forgot-password')
  @ApiOperation({
    summary:
      'Request a password reset email. Always responds identically, whether or not the email is registered — never confirm or deny account existence.',
  })
  @ApiOkResponse({ description: 'Accepted — response body never varies' })
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto, req.requestId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  @ApiOperation({
    summary: 'Set a new password using the token from a forgot-password email',
  })
  @ApiOkResponse({ description: 'Password reset successfully' })
  @ApiBadRequestResponse({
    description: 'Invalid or expired token, or passwords do not match',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
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
