import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception.code === 'P2002') {
      const meta: any = exception.meta;

      const fields =
        (meta?.target as string[]) ||
        meta?.driverAdapterError?.cause?.constraint?.fields ||
        [];

      return response.status(HttpStatus.CONFLICT).json({
        statusCode: 409,
        message: fields.length
          ? `${fields.join(', ')} already exists`
          : 'Duplicate field value'
      });
    }

    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      error: exception.message,
      message: 'Database error',
    });
  }
}