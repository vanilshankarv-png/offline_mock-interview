/** Handles errors raised by Express routes and middleware. */
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);

  const bodyParserStatus = error.type === 'entity.too.large' ? 413 : error.type === 'entity.parse.failed' ? 400 : null;
  const statusCode = bodyParserStatus || (Number.isInteger(error.statusCode) && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500);
  const message = statusCode >= 500
    ? 'An unexpected server error occurred.'
    : statusCode === 413 ? 'Request payload is too large.'
      : statusCode === 400 && error.type === 'entity.parse.failed' ? 'Request body is not valid JSON.'
        : error.message || 'The request could not be completed.';

  if (statusCode >= 500) console.error(`request_id=${req.id || 'unavailable'} error=${error.name || 'Error'}`);

  return res.status(statusCode).json({
    success: false,
    requestId: req.id,
    error: { code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : error.code || 'BAD_REQUEST', message },
  });
}
