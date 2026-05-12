import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../services/prisma.service';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findWalletUser(addressNormalized: string) {
    return this.prisma.wallet.findUnique({
      where: { address: addressNormalized },
      include: {
        user: {
          include: { profile: true },
        },
      },
    });
  }

  async createWalletUser(addressNormalized: string, chainId: string) {
    const email = `${addressNormalized}@wallet.proofhire`;
    const usernameBase = `ph_${addressNormalized.slice(2, 14)}`;
    let username = usernameBase;
    let suffix = 0;
    while (await this.prisma.user.findUnique({ where: { username } })) {
      suffix += 1;
      username = `${usernameBase}_${suffix}`;
    }
    const password = await bcrypt.hash(randomBytes(32).toString('hex'), 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        password,
        username,
        role: 'FREELANCER',
        wallet: {
          create: {
            address: addressNormalized,
            chain: chainId || 'unknown',
          },
        },
      },
      include: { profile: true, wallet: true },
    });
    return user;
  }

  async findUserWithProfile(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { profile: true, wallet: true },
    });
  }

  async create(data: {
    email: string;
    username: string;
    password: string;
    role?: 'ADMIN' | 'FREELANCER' | 'CLIENT';
  }) {
    return this.prisma.user.create({
      data,
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async getAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        username: true,
        role: true,
        createdAt: true,
      },
    });
  }
}