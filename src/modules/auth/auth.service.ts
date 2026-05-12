import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { sanitizeUser } from '../../utils/user-payload';

const ETH_ADDR = /^0x[a-fA-F0-9]{40}$/;

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async register(data: {
    email: string;
    username: string;
    password: string;
    role?: 'ADMIN' | 'FREELANCER' | 'CLIENT';
  }) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.usersService.create({
      ...data,
      password: hashedPassword,
    });

    return { access_token: this.signToken(user.id, user.email, user.role) };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { access_token: this.signToken(user.id, user.email, user.role) };
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