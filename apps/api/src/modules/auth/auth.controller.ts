import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { LoginInput, RegisterInput } from '@market/shared';
import { loginSchema, registerSchema } from '@market/shared';
import type { Request, Response } from 'express';
import { CurrentUser, Public, type AuthUser } from '../../common/auth.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { APP_CONFIG, type Env } from '../../common/env.js';
import { parseDurationMs } from '../../common/duration.js';
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(APP_CONFIG) env: Env,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
      maxAge: parseDurationMs(env.JWT_REFRESH_TTL),
    };
  }
  private readonly cookieOptions: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'lax';
    path: string;
    maxAge: number;
  };
  private cookie(res: Response, token: string): void {
    res.cookie('refresh_token', token, this.cookieOptions);
  }
  @Post('register') @Public() @Throttle({ default: { limit: 20, ttl: 60000 } }) async register(
    @Body(new ZodValidationPipe(registerSchema)) body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.register(body as RegisterInput);
    this.cookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(body as LoginInput);
    this.cookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Post('refresh') @Public() @HttpCode(200) async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.refresh(req.cookies?.refresh_token as string);
    this.cookie(res, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }
  @Post('logout') @Public() @HttpCode(204) async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req.cookies?.refresh_token as string | undefined);
    res.clearCookie('refresh_token', this.cookieOptions);
  }
  @Get('me') me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
