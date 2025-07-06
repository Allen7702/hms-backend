import express, { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../services/db';
import { authenticate, restrictTo } from '../middleware/auth';
import { login } from '../services/auth';

const router = express.Router();

// Login
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;
  try {
    const result = await login(email, password);
    res.status(200).json(result);
  } catch (err) {
    res.status(401).json({ error: (err as Error).message });
  }
});

// Get all users (Manager-only)
router.get('/', authenticate, restrictTo('Manager'), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query('SELECT id, username, email, role, property_id FROM users');
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create a new user (Manager-only)
router.post('/', authenticate, restrictTo('Manager'), async (req: Request, res: Response): Promise<void> => {
  const { username, email, password, role, property_id } = req.body;
  if (!username || !email || !password || !role || !property_id) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (username, email, password, role, property_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, role, property_id',
      [username, email, hashedPassword, role, property_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;