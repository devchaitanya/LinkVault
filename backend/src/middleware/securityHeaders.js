/**
 * Security headers middleware.
 *
 * Sets strict headers to prevent common web attacks.
 * Extensible: add new headers as security requirements grow.
 */
export function securityHeaders() {
  return (req, res, next) => {
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // XSS filter (legacy browsers)
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Strict transport security (1 year, include subdomains)
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Referrer policy — don't leak vault URLs
    res.setHeader('Referrer-Policy', 'no-referrer');

    // Content Security Policy
    // In production the SPA may be served by this same origin,
    // so allow scripts/styles/images/fonts from 'self'.
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    );

    // Remove server identification
    res.removeHeader('X-Powered-By');

    next();
  };
}

export default securityHeaders;
