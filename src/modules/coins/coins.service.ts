import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';

@Injectable()
export class CoinsService {
  constructor(private prisma: PrismaService) {}

  async getBalance(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { coinBalance: true },
    });
    return { balance: user?.coinBalance ?? 0 };
  }

  async getTransactions(userId: number, page = 1, limit = 20) {
    const [transactions, total] = await Promise.all([
      this.prisma.coinTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.coinTransaction.count({ where: { userId } }),
    ]);

    return { transactions, total, page, limit };
  }

  async mockPurchase(userId: number, amount: number) {
    if (!amount || amount <= 0 || amount > 1000) {
      throw new BadRequestException('Amount must be between 1 and 1000');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { coinBalance: { increment: amount } },
        select: { coinBalance: true },
      }),
      this.prisma.coinTransaction.create({
        data: {
          userId,
          amount,
          reason: 'purchase',
          metadata: { type: 'mock_purchase' },
        },
      }),
    ]);

    return { balance: updated.coinBalance };
  }

  async deductForBid(userId: number, jobId: number, bidCost: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { coinBalance: true },
    });

    if (!user || user.coinBalance < bidCost) {
      throw new BadRequestException(
        `Insufficient coins. You need ${bidCost} coins to bid on this project (current balance: ${user?.coinBalance ?? 0})`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { coinBalance: { decrement: bidCost } },
      }),
      this.prisma.coinTransaction.create({
        data: {
          userId,
          amount: -bidCost,
          reason: 'bid_placed',
          metadata: { jobId },
        },
      }),
    ]);
  }

  async refundBid(userId: number, jobId: number, bidCost: number) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { coinBalance: { increment: bidCost } },
      }),
      this.prisma.coinTransaction.create({
        data: {
          userId,
          amount: bidCost,
          reason: 'refund',
          metadata: { jobId, type: 'bid_refund' },
        },
      }),
    ]);
  }
}
