import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CoinsService } from './coins.service';
import { JwtAuthGuard } from '../auth/auth.guard';

@Controller('coins')
@UseGuards(JwtAuthGuard)
export class CoinsController {
  constructor(private coinsService: CoinsService) {}

  @Get('/balance')
  getBalance(@Req() req: { user: { userId: number } }) {
    return this.coinsService.getBalance(req.user.userId);
  }

  @Get('/transactions')
  getTransactions(
    @Req() req: { user: { userId: number } },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.coinsService.getTransactions(
      req.user.userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Post('/purchase')
  purchase(
    @Req() req: { user: { userId: number } },
    @Body() body: { amount: number },
  ) {
    return this.coinsService.mockPurchase(req.user.userId, body.amount);
  }
}
