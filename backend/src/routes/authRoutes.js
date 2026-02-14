import { Router } from 'express';
import User from '../models/User.js';
import Vault from '../models/Vault.js';
import { generateToken, requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { AppError } from '../utils/helpers.js';

const router = Router();

/**
 * POST /api/auth/register
 */
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Email, username, and password are required');
    }

    if (password.length < 6) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Password must be at least 6 characters');
    }

    // Check for existing user
    const existing = await User.findOne({ $or: [{ email }, { username }] });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'Email or username already taken');
    }

    const user = new User({ email, username, passwordHash: password });
    await user.save();

    const token = generateToken(user._id.toString());

    res.status(201).json({
      success: true,
      data: { user: user.toJSON(), token },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 */
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Email and password are required');
    }

    const user = await User.findOne({ email });
    if (!user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid email or password');
    }

    const token = generateToken(user._id.toString());

    res.json({
      success: true,
      data: { user: user.toJSON(), token },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me — get current user profile
 */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    res.json({
      success: true,
      data: { user: user.toJSON() },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me/vaults — get current user's vaults (dashboard)
 * Shows ALL completed vaults (including expired/consumed) so user can manage them.
 */
router.get('/me/vaults', requireAuth, async (req, res, next) => {
  try {
    const vaults = await Vault.find({
      userId: req.userId,
      isDeleted: false,
      uploadStatus: 'complete',
    })
      .sort({ createdAt: -1 })
      .select('vaultId contentType totalSize remainingViews expiresAt createdAt uploadStatus policy displayName mimeType')
      .lean();

    res.json({
      success: true,
      data: { vaults },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/me/vaults/:vaultId/extend — extend vault expiry and/or add views (owner only)
 */
router.post('/me/vaults/:vaultId/extend', requireAuth, async (req, res, next) => {
  try {
    const { vaultId } = req.params;
    const { additionalMs, additionalViews } = req.body;

    if ((!additionalMs || typeof additionalMs !== 'number' || additionalMs <= 0) &&
        (!additionalViews || typeof additionalViews !== 'number' || additionalViews <= 0)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Provide additionalMs and/or additionalViews as positive numbers');
    }

    const vault = await Vault.findOne({
      vaultId,
      userId: req.userId,
      isDeleted: false,
      uploadStatus: 'complete',
    });

    if (!vault) {
      throw new AppError(404, 'NOT_FOUND', 'Vault not found or not owned by you');
    }

    // Extend time (max 24 hours per call)
    if (additionalMs && typeof additionalMs === 'number' && additionalMs > 0) {
      const maxExtension = 86_400_000;
      const extension = Math.min(additionalMs, maxExtension);
      const base = vault.expiresAt > new Date() ? vault.expiresAt : new Date();
      vault.expiresAt = new Date(base.getTime() + extension);
    }

    // Add views (max 1000 per call)
    if (additionalViews && typeof additionalViews === 'number' && additionalViews > 0) {
      const viewsToAdd = Math.min(additionalViews, 1000);
      vault.remainingViews += viewsToAdd;
      vault.policy.maxViews += viewsToAdd;
    }

    await vault.save();

    res.json({
      success: true,
      data: {
        vaultId,
        newExpiresAt: vault.expiresAt,
        remainingViews: vault.remainingViews,
        maxViews: vault.policy.maxViews,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
