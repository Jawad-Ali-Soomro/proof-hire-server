import { Controller, Get, NotFoundException, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { PrismaService } from '../../services/prisma.service';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private dashboardService: DashboardService,
    private prisma: PrismaService,
  ) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async stats(@Req() req: { user: { userId: number } }) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, role: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.dashboardService.getStats(user.id, user.role);
  }
}
