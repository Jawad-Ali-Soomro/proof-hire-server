import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ContractsService } from './contracts.service';

@Controller('contracts')
@UseGuards(JwtAuthGuard)
export class ContractsController {
  constructor(private contractsService: ContractsService) {}

  @Get()
  list(@Req() req: { user: { userId: number; role: string } }) {
    return this.contractsService.listForUser(req.user.userId, req.user.role);
  }

  @Get('history/projects')
  listHistory(@Req() req: { user: { userId: number; role: string } }) {
    return this.contractsService.listHistoryForUser(
      req.user.userId,
      req.user.role,
    );
  }

  @Get(':id')
  getOne(
    @Req() req: { user: { userId: number; role: string } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contractsService.getOne(id, req.user.userId, req.user.role);
  }

  @Post(':id/start')
  start(
    @Req() req: { user: { userId: number; role: string } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contractsService.startContract(id, req.user.userId, req.user.role);
  }

  @Patch(':id/milestones/:index')
  updateMilestone(
    @Req() req: { user: { userId: number; role: string } },
    @Param('id', ParseIntPipe) id: number,
    @Param('index', ParseIntPipe) index: number,
    @Body() body: { status?: string; completed?: boolean },
  ) {
    return this.contractsService.updateMilestone(
      id,
      index,
      req.user.userId,
      req.user.role,
      body,
    );
  }

  @Post(':id/mark-complete')
  markComplete(
    @Req() req: { user: { userId: number; role: string } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contractsService.markWorkComplete(
      id,
      req.user.userId,
      req.user.role,
    );
  }

  @Post(':id/payment/sent')
  paymentSent(
    @Req() req: { user: { userId: number; role: string } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contractsService.confirmPaymentSent(
      id,
      req.user.userId,
      req.user.role,
    );
  }

  @Post(':id/payment/received')
  paymentReceived(
    @Req() req: { user: { userId: number; role: string } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contractsService.confirmPaymentReceived(
      id,
      req.user.userId,
      req.user.role,
    );
  }
}
