import { Router } from 'express';
import vaultRoutes from './vaultRoutes.js';
import authRoutes from './authRoutes.js';
import { vaultController } from '../controllers/index.js';

const router = Router();

// Health check
router.get('/health', vaultController.healthCheck.bind(vaultController));

// Auth endpoints
router.use('/auth', authRoutes);

// Vault endpoints
router.use('/vaults', vaultRoutes);

export default router;
