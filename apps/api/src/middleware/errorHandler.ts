import type { ErrorHandler } from 'hono';

export const errorHandler: ErrorHandler = (err, c) => {
  console.error('Unhandled error:', err);

  return c.json(
    {
      error: {
        message: err.message || 'Internal Server Error',
      },
    },
    500,
  );
};
