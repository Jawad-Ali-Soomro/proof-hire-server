import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getStats() {
    const [totalUsers, totalJobs, totalBids, totalContracts] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.job.count(),
        this.prisma.bid.count(),
        this.prisma.contract.count(),
      ]);

    const roleBreakdown = await this.prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    });

    return {
      totalUsers,
      totalJobs,
      totalBids,
      totalContracts,
      roleBreakdown: roleBreakdown.map((r) => ({
        role: r.role,
        count: r._count._all,
      })),
    };
  }

  async listUsers(params: {
    search?: string;
    role?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, role, page = 1, limit = 20 } = params;
    const where: any = {};

    if (role) where.role = role;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          coinBalance: true,
          createdAt: true,
          profile: { select: { fullName: true, avatar: true } },
          wallet: { select: { address: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async createUser(data: {
    email: string;
    username: string;
    password: string;
    role: 'ADMIN' | 'FREELANCER' | 'CLIENT';
  }) {
    if (!data.email?.trim() || !data.username?.trim() || !data.password) {
      throw new BadRequestException(
        'Email, username, and password are required',
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: data.email.trim().toLowerCase() },
          { username: data.username.trim() },
        ],
      },
    });
    if (existing) {
      throw new ConflictException('Email or username already taken');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: data.email.trim().toLowerCase(),
        username: data.username.trim(),
        password: hashedPassword,
        role: data.role || 'FREELANCER',
      },
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        coinBalance: true,
        createdAt: true,
      },
    });

    return user;
  }

  async updateUser(
    id: number,
    data: { role?: string; coinBalance?: number },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    const update: any = {};
    if (data.role) update.role = data.role;
    if (data.coinBalance !== undefined) update.coinBalance = data.coinBalance;

    return this.prisma.user.update({
      where: { id },
      data: update,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        coinBalance: true,
        createdAt: true,
      },
    });
  }

  async grantCoins(userId: number, amount: number, adminId: number) {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [updated] = await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { coinBalance: { increment: amount } },
        select: { id: true, coinBalance: true },
      }),
      this.prisma.coinTransaction.create({
        data: {
          userId,
          amount,
          reason: 'admin_grant',
          metadata: { adminId },
        },
      }),
    ]);

    return updated;
  }

  async deleteUser(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (user.role === 'ADMIN') {
      throw new BadRequestException('Cannot delete an admin user');
    }

    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }
}
