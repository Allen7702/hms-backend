import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './routes/users';
import roomRoutes from './routes/rooms';
import bookingRoutes from './routes/bookings';
import { pool } from './services/db';

dotenv.config();

export const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Verify database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('PostgreSQL connection error:', err.stack);
    process.exit(1);
  }
  console.log('Connected to PostgreSQL (database: hms)');
  client?.query('SELECT current_database()', (err, result) => {
    release();
    if (err) {
      console.error('Error verifying database:', err.stack);
    } else {
      console.log('Database:', result.rows[0].current_database);
    }
  });
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/bookings', bookingRoutes);

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'HMS Backend is running' });
});

// Error Handling Middleware
interface ErrorWithStatus extends Error {
  status?: number;
}

app.use((err: ErrorWithStatus, req: Request, res: Response, next: NextFunction) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  res.status(status).json({ error: message });
});

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});