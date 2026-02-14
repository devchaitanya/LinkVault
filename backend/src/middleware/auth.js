import jwt from 'jsonwebtoken';
import { AppError } from '../utils/helpers.js';

const JWT_SECRET = process.env.JWT_SECRET || 'linkvault-dev-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';
const DOWNLOAD_SESSION_SECRET = process.env.DOWNLOAD_SESSION_SECRET || 'lv-download-session-secret';
const DOWNLOAD_SESSION_TTL = '5m'; // 5 minutes to download all chunks

/**
 * Generate a JWT token for a user.
 */
export function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Generate a short-lived download session token after consuming a view.
 * Binds the token to a specific vaultId so it can't be reused for other vaults.
 */
export function generateDownloadSessionToken(vaultId) {
  return jwt.sign({ vaultId, type: 'download_session' }, DOWNLOAD_SESSION_SECRET, { expiresIn: DOWNLOAD_SESSION_TTL });
}

/**
 * Verify a download session token. Returns { vaultId } or null.
 */
export function verifyDownloadSessionToken(token) {
  try {
    const decoded = jwt.verify(token, DOWNLOAD_SESSION_SECRET);
    if (decoded.type !== 'download_session') return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verify and decode a JWT token.
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

/**
 * Auth middleware — requires valid JWT in Authorization header.
 * Attaches req.userId if valid.
 */
export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }

  req.userId = decoded.userId;
  next();
}

/**
 * Optional auth middleware — attaches req.userId if token present, but doesn't require it.
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (decoded) {
      req.userId = decoded.userId;
    }
  }
  next();
}
