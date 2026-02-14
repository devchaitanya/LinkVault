import { AppError } from '../utils/helpers.js';
import { env } from '../config/index.js';

/**
 * Global error handler middleware.
 *
 * Catches all errors thrown in routes/controllers/services and
 * returns a consistent JSON error response.
 *
 * NEVER leaks stack traces or internal details in production.
 */
export function errorHandler(err, req, res, _next) {
  // Operational errors (AppError) — expected, safe to expose
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
      },
    });
  }

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        details,
      },
    });
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: `File size exceeds ${env.maxFileSizeBytes} bytes`,
      },
    });
  }

  // Unknown errors — log and return generic message
  console.error('[Error] Unhandled:', err);

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isDev ? err.message : 'An unexpected error occurred',
    },
  });
}

export default errorHandler;
