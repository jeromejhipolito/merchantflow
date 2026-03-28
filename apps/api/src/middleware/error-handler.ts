import type { FastifyInstance, FastifyError } from "fastify";
import { AppError, ErrorCode } from "../lib/errors/index.js";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    if (error instanceof AppError) {
      if (error.isOperational) {
        request.log.warn(
          {
            code: error.code,
            statusCode: error.statusCode,
            path: request.url,
            method: request.method,
          },
          error.message
        );
      } else {
        request.log.error(
          {
            code: error.code,
            statusCode: error.statusCode,
            path: request.url,
            method: request.method,
            stack: error.stack,
          },
          `PROGRAMMING ERROR: ${error.message}`
        );
      }

      const response = error.toJSON();

      if (error.retryAfterSeconds) {
        reply.header("Retry-After", String(error.retryAfterSeconds));
      }

      return reply.status(error.statusCode).send(response);
    }

    // Fastify validation errors
    if ("validation" in error && Array.isArray((error as any).validation)) {
      const validationErrors = (error as any).validation as Array<{
        keyword: string;
        dataPath: string;
        message: string;
        params: Record<string, unknown>;
      }>;

      request.log.warn(
        { path: request.url, validation: validationErrors },
        "Request validation failed"
      );

      return reply.status(400).send({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: "Request validation failed.",
          details: {
            errors: validationErrors.map((v) => ({
              field: v.dataPath || "body",
              message: v.message,
            })),
          },
        },
      });
    }

    // Prisma known errors
    if (typeof error === "object" && error !== null && "code" in error) {
      const prismaCode = (error as any).code as string;

      if (prismaCode === "P2002") {
        const target = (error as any).meta?.target;
        request.log.warn(
          { prismaCode, target, path: request.url },
          "Unique constraint violation"
        );
        return reply.status(409).send({
          error: {
            code: ErrorCode.CONFLICT,
            message: "A record with these values already exists.",
            details: { fields: target },
          },
        });
      }

      if (prismaCode === "P2025") {
        return reply.status(404).send({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: "Record not found.",
          },
        });
      }
    }

    request.log.error(
      {
        path: request.url,
        method: request.method,
        stack: error.stack,
        name: error.name,
      },
      `UNHANDLED ERROR: ${error.message}`
    );

    const isProduction = process.env.NODE_ENV === "production";

    return reply.status(500).send({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: isProduction
          ? "An internal error occurred. Please try again later."
          : error.message,
        ...(!isProduction && { stack: error.stack }),
      },
    });
  });
}
