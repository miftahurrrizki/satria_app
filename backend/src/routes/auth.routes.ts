import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { login, me, changePassword, resetToDefault, logout } from '../controllers/auth.controller';
import { loginRateLimiter } from '../middleware/rate-limit.middleware';

const router = Router();

// Rate-limited: max 5 percobaan / 15 menit per IP
router.post('/login',           loginRateLimiter, login);
router.post('/logout',          logout);
router.get ('/me',              authenticate, me);
router.put ('/change-password', authenticate, changePassword);
router.post('/reset-password',  authenticate, resetToDefault);

export default router;
