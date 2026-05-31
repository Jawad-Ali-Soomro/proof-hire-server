import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../services/prisma.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { sanitizeUser } from '../../utils/user-payload';

const ETH_ADDR = /^0x[a-fA-F0-9]{40}$/;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async register(data: {
    email: string;
    username: string;
    password: string;
    role?: 'ADMIN' | 'FREELANCER' | 'CLIENT';
  }) {
    if (!data.email?.trim() || !data.username?.trim() || !data.password) {
      throw new BadRequestException('Email, username and password are required');
    }
    const role = data.role ?? 'FREELANCER';
    if (!['FREELANCER', 'CLIENT'].includes(role)) {
      throw new BadRequestException('Role must be FREELANCER or CLIENT');
    }

    const existing = await this.usersService.findByEmail(data.email.trim());
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.usersService.create({
      email: data.email.trim().toLowerCase(),
      username: data.username.trim(),
      password: hashedPassword,
      role: role as 'FREELANCER' | 'CLIENT',
    });

    return {
      access_token: this.signToken(user.id, user.email, user.role),
      user,
    };
  }

  async login(email: string, password: string) {
    if (!email || !password) {
      throw new BadRequestException('Email and password are required');
    }
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { profile: true, wallet: true },
      // coinBalance is a scalar so it's included by default
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      access_token: this.signToken(user.id, user.email, user.role),
      user: sanitizeUser(user),
    };
  }

  async linkWallet(
    userId: number,
    body: { address: string; chainId?: string },
  ) {
    const raw = body.address?.trim();
    if (!raw || !ETH_ADDR.test(raw)) {
      throw new BadRequestException('Invalid wallet address');
    }
    const address = raw.toLowerCase();
    const chain = body.chainId?.trim() || 'unknown';

    const existingWallet = await this.prisma.wallet.findUnique({
      where: { address },
    });
    if (existingWallet && existingWallet.userId !== userId) {
      throw new ConflictException('Wallet already linked to another account');
    }

    const wallet = await this.prisma.wallet.upsert({
      where: { userId },
      update: { address, chain },
      create: { address, chain, userId },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, wallet: true },
    });

    return { wallet, user: sanitizeUser(user!) };
  }

  private signToken(userId: number, email: string, role: string) {
    return this.jwtService.sign({
      sub: userId,
      email,
      role,
    });
  }

  async connectWallet(body: { address: string; chainId?: string }) {
    const raw = body.address?.trim();
    if (!raw || !ETH_ADDR.test(raw)) {
      throw new BadRequestException('Invalid wallet address');
    }
    const address = raw.toLowerCase();
    const chain = body.chainId?.trim() || 'unknown';

    const row = await this.usersService.findWalletUser(address);
    const user =
      row?.user ?? (await this.usersService.createWalletUser(address, chain));

    return {
      access_token: this.signToken(user.id, user.email, user.role),
      user: sanitizeUser(user),
    };
  }
}