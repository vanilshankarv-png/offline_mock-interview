import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { getProgress } from '../services/progress.service.js';

const router = Router();
router.use(authenticate);
router.get('/', async (req, res, next) => {
  try { return sendSuccess(res, await getProgress(req.user._id)); } catch (error) { return next(error); }
});
export default router;
