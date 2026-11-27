import { Router } from 'express';
import { sendSuccess } from '../utils/apiResponse.js';

const router = Router();

/** Reports that the HTTP API process is responding. */
router.get('/', (req, res) => sendSuccess(res, { status: 'ok', service: 'talkready-api' }));

export default router;
