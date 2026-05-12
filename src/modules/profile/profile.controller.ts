import {
  BadRequestException,
  Body,
  Controller,
  Get,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ProfileService } from './profile.service';
import { PinataService } from '../../services/pinata.service';

const UPLOAD_IMAGE_LIMIT = 5 * 1024 * 1024;

@Controller('profile')
export class ProfileController {
  constructor(
    private profileService: ProfileService,
    private pinataService: PinataService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: { userId: number } }) {
    return this.profileService.getMe(req.user.userId);
  }

  @Post('upload-image')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_IMAGE_LIMIT },
    }),
  )
  async uploadImage(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: UPLOAD_IMAGE_LIMIT }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('Only image uploads are allowed');
    }
    const url = await this.pinataService.uploadImage(
      file.buffer,
      file.originalname || 'image',
      file.mimetype || 'application/octet-stream',
    );
    return { url };
  }

  @Post('complete')
  @UseGuards(JwtAuthGuard)
  complete(
    @Req() req: { user: { userId: number } },
    @Body()
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
    return this.profileService.completeOnboarding(req.user.userId, body);
  }
}
