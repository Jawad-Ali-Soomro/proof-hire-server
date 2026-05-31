import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('/register')
  register(
    @Body()
    body: {
      email: string;
      username: string;
      password: string;
      role?: 'FREELANCER' | 'CLIENT';
    },
  ) {
    return this.authService.register(body);
  }

  @Post('/login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('/wallet')
  wallet(@Body() body: { address: string; chainId?: string }) {
    return this.authService.connectWallet(body);
  }

  @Post('/link-wallet')
  @UseGuards(JwtAuthGuard)
  linkWallet(
    @Req() req: { user: { userId: number } },
    @Body() body: { address: string; chainId?: string },
  ) {
    return this.authService.linkWallet(req.user.userId, body);
  }
}