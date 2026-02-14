import { hashForLog } from '../utils/helpers.js';

/**
 * Request logging middleware.
 *
 * Privacy-first: NEVER logs decryption keys, URL fragments, passwords, or plaintext.
 * Client identifiers are hashed before logging.
 *
 * What IS logged:
 *   - Timestamp
 *   - Method + path (without fragment)
 *   - Status code
 *   - Response time
 *   - Hashed client IP
 *   - Outcome (success/failure)
 *
 * What is NEVER logged:
 *   - URL fragments (#k=...)
 *   - Request/response bodies
 *   - Authorization headers
 *   - Decryption keys
 *   - Passwords
 */
export function requestLogger() {
  return (req, res, next) => {
    const start = Date.now();

    // Capture original end to intercept response
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - start;
      const hashedIp = hashForLog(req.ip || req.connection.remoteAddress || 'unknown');
      const outcome = res.statusCode < 400 ? 'OK' : 'FAIL';

      // Structured log line — safe for any log aggregator
      console.log(
        JSON.stringify({
          ts: new Date().toISOString(),
          method: req.method,
          path: req.path, // path only — never includes fragment
          status: res.statusCode,
          duration_ms: duration,
          client: hashedIp,
          outcome,
        })
      );

      originalEnd.apply(res, args);
    };

    next();
  };
}

export default requestLogger;
