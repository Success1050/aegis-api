import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware';

export interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  requestId: string;
  timestamp: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId =
      (request.headers[REQUEST_ID_HEADER] as string) ||
      (response.getHeader(REQUEST_ID_HEADER) as string) ||
      'unknown-request-id';

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message = 'An unexpected error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        error = (resp.error as string) || exception.name;

        // If class-validator returns an array of messages
        if (Array.isArray(resp.message)) {
          message = 'Validation failed';
          details = resp.message;
        } else if (typeof resp.message === 'string') {
          message = resp.message;
        } else {
          message = exception.message;
        }

        if (resp.details !== undefined) {
          details = resp.details;
        }
      }
    } else if (exception instanceof Error) {
      // Prisma or unknown runtime exceptions
      if (exception.name === 'PrismaClientKnownRequestError') {
        const prismaErr = exception as unknown as { code: string; meta?: Record<string, unknown> };
        if (prismaErr.code === 'P2002') {
          statusCode = HttpStatus.CONFLICT;
          error = 'Conflict';
          message = 'A resource with this identifier already exists.';
          details = prismaErr.meta;
        } else if (prismaErr.code === 'P2025') {
          statusCode = HttpStatus.NOT_FOUND;
          error = 'Not Found';
          message = 'The requested resource was not found.';
        } else {
          statusCode = HttpStatus.BAD_REQUEST;
          error = 'Database Error';
          message = 'A database constraint violation occurred.';
        }
      } else {
        message = process.env.NODE_ENV === 'production' ? 'An internal error occurred' : exception.message;
        error = exception.name;
      }
    }

    const payload: ErrorEnvelope = {
      statusCode,
      error,
      message,
      ...(details !== undefined ? { details } : {}),
      requestId,
      timestamp: new Date().toISOString(),
    };

    // Log the error with structured context
    if (statusCode >= 500) {
      this.logger.error(
        `[${requestId}] ${request.method} ${request.url} - ${statusCode} ${error}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${requestId}] ${request.method} ${request.url} - ${statusCode} ${error}: ${message}`,
      );
    }

    // Ensure header is set on the response
    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.status(statusCode).json(payload);
  }
}
