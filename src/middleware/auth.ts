import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../services/db';  
import dotenv from 'dotenv';

dotenv.config();

interface AuthRequest extends Request {
  user?: { id: number; role: string; property_id: number };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET || 'your_jwt_secret_here';
    const decoded = jwt.verify(token, secret) as { id: number; role: string };
    const result = await pool.query('SELECT id, role, property_id FROM users WHERE id = $1', [decoded.id]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
};

export const restrictTo = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    next();
  };
};