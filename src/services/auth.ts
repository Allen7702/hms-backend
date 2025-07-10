import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db';

export const login = async (username: string, password: string) => {
  const result = await query('SELECT id, username, password, role FROM users WHERE username = $1', [username]);
  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = result.rows[0];
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'your_jwt_secret_here', {
    expiresIn: '1h',
  });
  return { token, user: { id: user.id, username: user.username, role: user.role } };
};