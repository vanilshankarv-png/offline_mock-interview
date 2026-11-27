import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { env } from '../config/env.js';

export async function authenticate(req, res, next) {
  const token = req.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication is required.' } });
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'This account is unavailable.' } });
    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Access token is invalid or expired.' } });
    }
    return next(error);
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'You do not have permission to access this resource.' } });
    }
    return next();
  };
}
