import express, { Request, Response } from 'express';
import { query } from '../services/db';
import { authenticate, restrictTo } from '../middleware/auth';

const router = express.Router();

// Get all rooms with optional filtering
router.get('/', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
  const { status, floor } = req.query;
  let queryText = `
    SELECT r.id, r.room_number, r.floor, r.status, rt.name as type, rt.base_rate, r.property_id
    FROM rooms r
    JOIN room_types rt ON r.room_type_id = rt.id
  `;
  const params: any[] = [];
  if (status || floor) {
    queryText += ' WHERE';
    if (status) {
      queryText += ' r.status = $1';
      params.push(status);
    }
    if (floor) {
      queryText += (params.length ? ' AND' : '') + ' r.floor = $' + (params.length + 1);
      params.push(floor);
    }
  }
  try {
    const result = await query(queryText, params);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create a new room (Manager-only)
router.post('/', authenticate, restrictTo('Manager'), async (req: Request, res: Response): Promise<void> => {
  const { room_number, floor, room_type_id, status, property_id } = req.body;
  if (!room_number || !floor || !room_type_id || !status || !property_id) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    const result = await query(
      'INSERT INTO rooms (room_number, floor, room_type_id, status, property_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [room_number, floor, room_type_id, status, property_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/availability', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
  const { start_date, end_date } = req.query;
  const result = await query(
    `SELECT r.* FROM rooms r
     LEFT JOIN bookings b ON r.id = b.room_id AND b.status = 'Active'
     AND (b.check_in <= $2 AND b.check_out >= $1)
     WHERE b.id IS NULL AND r.status NOT IN ('Maintenance', 'Dirty')`,
    [start_date, end_date]
  );
  res.status(200).json(result.rows);
});

export default router;