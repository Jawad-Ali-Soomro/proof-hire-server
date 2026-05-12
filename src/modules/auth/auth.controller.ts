import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('/register')
  register(@Body() body: any) {
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
}