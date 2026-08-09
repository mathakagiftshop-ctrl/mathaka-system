import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly details?: unknown) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(message, 400, "VALIDATION_ERROR", details);
export const notFound = (message: string) => new AppError(message, 404, "NOT_FOUND");
export const conflict = (message: string) => new AppError(message, 409, "CONFLICT");

export function routeError(error: unknown, fallback = "The request could not be completed") {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: error.status });
  }
  console.error(fallback, error);
  return NextResponse.json({ error: fallback, code: "INTERNAL_ERROR" }, { status: 500 });
}
