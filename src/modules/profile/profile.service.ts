import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../services/prisma.service';
import { sanitizeUser } from '../../utils/user-payload';

@Injectable()
export class ProfileService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async getMe(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return sanitizeUser(user);
  }

  async completeOnboarding(
    userId: number,
    body: {
      email: string;
      fullName: string;
      bio?: string;
      summary?: string;
      addressLine1?: string;
      addressLine2?: string;
      city?: string;
      state?: string;
      country?: string;
      postalCode?: string;
      linkedin?: string;
      github?: string;
      educationEntries?: unknown;
      projects?: unknown;
      role: 'FREELANCER' | 'CLIENT';
      skills?: string;
      services?: string;
      avatar?: string;
    },
  ) {
    const email = body.email?.trim().toLowerCase();
    const fullName = body.fullName?.trim();
    if (!email) throw new BadRequestException('Email is required');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Please enter a valid email');
    }
    if (!fullName) throw new BadRequestException('Full name is required');

    if (body.role === 'FREELANCER' && !body.skills?.trim()) {
      throw new BadRequestException('Skills are required for freelancers');
    }
    if (body.role === 'CLIENT' && !body.services?.trim()) {
      throw new BadRequestException(
        'Describe the services or roles you hire for',
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        email,
        id: { not: userId },
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email already exists');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        email,
        role: body.role,
      },
    });

    const summaryText =
      (body.summary ?? body.bio)?.trim() || null;
    const str = (v: unknown) =>
      typeof v === 'string' ? v.trim() || null : null;
    const educationEntries = this.normalizeJsonArray(body.educationEntries);
    const projects = this.normalizeJsonArray(body.projects);

    const educationJson = educationEntries.length
      ? (educationEntries as Prisma.InputJsonValue)
      : Prisma.DbNull;
    const projectsJson = projects.length
      ? (projects as Prisma.InputJsonValue)
      : Prisma.DbNull;

    await this.prisma.profile.upsert({
      where: { userId },
      create: {
        userId,
        fullName,
        summary: summaryText,
        bio: summaryText,
        skills: body.role === 'FREELANCER' ? body.skills!.trim() : null,
        services: body.role === 'CLIENT' ? body.services!.trim() : null,
        avatar: body.avatar?.trim() || null,
        addressLine1: str(body.addressLine1),
        addressLine2: str(body.addressLine2),
        city: str(body.city),
        state: str(body.state),
        country: str(body.country),
        postalCode: str(body.postalCode),
        linkedin: str(body.linkedin),
        github: str(body.github),
        educationEntries: educationJson,
        projects: projectsJson,
      },
      update: {
        fullName,
        summary: summaryText,
        bio: summaryText,
        skills: body.role === 'FREELANCER' ? body.skills!.trim() : null,
        services: body.role === 'CLIENT' ? body.services!.trim() : null,
        avatar: body.avatar?.trim() || null,
        addressLine1: str(body.addressLine1),
        addressLine2: str(body.addressLine2),
        city: str(body.city),
        state: str(body.state),
        country: str(body.country),
        postalCode: str(body.postalCode),
        linkedin: str(body.linkedin),
        github: str(body.github),
        educationEntries: educationJson,
        projects: projectsJson,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) throw new NotFoundException('User not found');

    return {
      access_token: this.jwt.sign({
        sub: user.id,
        email: user.email,
        role: user.role,
      }),
      user: sanitizeUser(user),
    };
  }

  private normalizeJsonArray(value: unknown): unknown[] {
    if (!Array.isArray(value)) return [];
    return value.filter((x) => x !== null && x !== undefined);
  }
}
