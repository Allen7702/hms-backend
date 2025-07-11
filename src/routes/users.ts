import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../services/db';
import { authenticate, restrictTo } from '../middleware/auth';
import { CustomRequest } from '../types';

const router = express.Router();

// Login
router.post('/login', async (req: CustomRequest, res: express.Response): Promise<void> => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  try {
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const accessToken = jwt.sign(
      { id: user.id, role: user.role, property_id: user.property_id },
      process.env.JWT_SECRET || 'your_jwt_secret_here',
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_here',
      { expiresIn: '7d' }
    );

    await query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at, property_id) VALUES ($1, $2, $3, $4)',
      [user.id, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), user.property_id]
    );

    res.status(200).json({
      access_token: accessToken,
      refresh_token: refreshToken,
      user: { id: user.id, username: user.username, role: user.role, property_id: user.property_id },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Refresh Token
router.post('/refresh-token', async (req: CustomRequest, res: express.Response): Promise<void> => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    res.status(400).json({ error: 'Refresh token is required' });
    return;
  }

  try {
    const tokenCheck = await query('SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()', [refresh_token]);
    if (tokenCheck.rows.length === 0) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_here') as { id: number };
    const userResult = await query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];
    const newAccessToken = jwt.sign(
      { id: user.id, role: user.role, property_id: user.property_id },
      process.env.JWT_SECRET || 'your_jwt_secret_here',
      { expiresIn: '15m' }
    );

    const newRefreshToken = jwt.sign(
      { id: user.id },
      process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_here',
      { expiresIn: '7d' }
    );

    await query('BEGIN');
    await query('DELETE FROM refresh_tokens WHERE token = $1', [refresh_token]);
    await query(
      'INSERT INTO refresh_tokens (user_id, token, expires_at, property_id) VALUES ($1, $2, $3, $4)',
      [user.id, newRefreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), user.property_id]
    );
    await query(
      'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
      ['RefreshToken', user.id, 'User', user.id, { action: 'Token refreshed' }, user.property_id]
    );
    await query('COMMIT');

    res.status(200).json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      user: { id: user.id, username: user.username, role: user.role, property_id: user.property_id },
    });
  } catch (err) {
    await query('ROLLBACK');
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Get all users
router.get('/', authenticate, restrictTo('Manager'), async (req: CustomRequest, res: express.Response): Promise<void> => {
  try {
    const result = await query('SELECT id, username, email, role, property_id FROM users');
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create a new user
router.post('/', authenticate, restrictTo('Manager'), async (req: CustomRequest, res: express.Response): Promise<void> => {
  const { username, email, password, role, property_id } = req.body;

  if (!username || !email || !password || !role || !property_id) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }

  if (!req.user?.id) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await query('BEGIN');
    const result = await query(
      'INSERT INTO users (username, email, password, role, property_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, role, property_id',
      [username, email, hashedPassword, role, property_id]
    );
    await query(
      'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
      ['CreateUser', req.user.id, 'User', result.rows[0].id, { username, email, role }, property_id]
    );
    await query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;