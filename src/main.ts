import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { PrismaExceptionFilter } from './common/excption-handler';
dotenv.config();
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalFilters(new PrismaExceptionFilter())
  app.setGlobalPrefix("api")
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
