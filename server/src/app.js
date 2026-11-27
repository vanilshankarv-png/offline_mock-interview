import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import healthRoutes from './routes/healthRoutes.js';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import sessionRoutes from './routes/sessionRoutes.js';
import progressRoutes from './routes/progressRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import languageRoutes from './routes/languageRoutes.js';
import swaggerUi from 'swagger-ui-express';
import { openapiSpec } from './config/openapi.js';
import mongoSanitize from 'express-mongo-sanitize';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { randomUUID } from 'node:crypto';
import speechRoutes from './routes/speechRoutes.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === env.CLIENT_ORIGIN) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  exposedHeaders: ['X-Request-Id'],
}));
app.use((req, res, next) => {
  const suppliedId = req.get('X-Request-Id');
  req.id = suppliedId && /^[A-Za-z0-9._-]{1,64}$/.test(suppliedId) ? suppliedId : randomUUID();
  res.set('X-Request-Id', req.id);
  return next();
});
morgan.token('request-id', (req) => req.id);
app.use(morgan(':method :url :status :response-time ms request_id=:request-id'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb', parameterLimit: 100 }));
app.use(cookieParser());
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/sessions', sessionRoutes);
app.use('/api/v1/progress', progressRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/speech', speechRoutes);
app.use('/api/v1', languageRoutes);
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.use(notFound);
app.use(errorHandler);

export default app;
