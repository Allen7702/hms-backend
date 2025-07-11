import express, { Request, Response } from 'express';
import { query } from '../services/db';
import { authenticate, restrictTo } from '../middleware/auth';
import { CustomRequest } from '../types';


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

// Get a single room by ID
router.get('/:id', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await query(
      'SELECT r.*, rt.name AS type, rt.base_rate FROM rooms r JOIN room_types rt ON r.room_type_id = rt.id WHERE r.id = $1',
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});


// Get room availability for date range
router.get('/availability', authenticate, restrictTo('Receptionist', 'Manager'), async (req: CustomRequest, res: Response): Promise<void> => {
  const { start_date, end_date, room_type_id, property_id } = req.query;

  if (!start_date || !end_date || !property_id) {
    res.status(400).json({ error: 'Missing required fields: start_date, end_date, property_id' });
    return;
  }

  if (!req.user?.id) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const startDate = new Date(start_date as string);
    const endDate = new Date(end_date as string);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      res.status(400).json({ error: 'Invalid date range' });
      return;
    }

    let queryStr = `
         SELECT r.*, rt.name AS type, rt.base_rate
         FROM rooms r
         JOIN room_types rt ON r.room_type_id = rt.id
         WHERE r.property_id = $1
         AND r.status NOT IN ('Maintenance', 'Dirty')
         AND r.id NOT IN (
           SELECT b.room_id
           FROM bookings b
           WHERE b.status = 'Active'
           AND (
             (b.check_in <= $3 AND b.check_out > $2)
           )
         )
       `;
    const params: any[] = [property_id, start_date, end_date];
    let paramIndex = 4;

    if (room_type_id) {
      queryStr += ` AND r.room_type_id = $${paramIndex++}`;
      params.push(room_type_id);
    }

    const result = await query(queryStr, params);
    await query(
      'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
      ['SearchAvailability', req.user.id, 'Room', null, { start_date, end_date, room_type_id }, property_id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Update a room
router.put('/:id', authenticate, restrictTo('Manager'), async (req: CustomRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { room_number, floor, room_type_id, status, features } = req.body;

  if (!req.user?.id) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const existing = await query('SELECT * FROM rooms WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [id];
    let paramIndex = 2;

    if (room_number) {
      const roomCheck = await query('SELECT id FROM rooms WHERE room_number = $1 AND property_id = $2 AND id != $3', [room_number, existing.rows[0].property_id, id]);
      if (roomCheck.rows.length > 0) {
        res.status(400).json({ error: 'Room number already exists for this property' });
        return;
      }
      updates.push(`room_number = $${paramIndex++}`);
      params.push(room_number);
    }
    if (floor) {
      updates.push(`floor = $${paramIndex++}`);
      params.push(floor);
    }
    if (room_type_id) {
      updates.push(`room_type_id = $${paramIndex++}`);
      params.push(room_type_id);
    }
    if (status) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
    }
    if (features) {
      updates.push(`features = $${paramIndex++}`);
      params.push(features);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    await query('BEGIN');
    const queryStr = `UPDATE rooms SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
    const result = await query(queryStr, params);
    await query(
      'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
      ['UpdateRoom', req.user.id, 'Room', id, { room_number, floor, room_type_id, status, features }, existing.rows[0].property_id]
    );
    await query('COMMIT');

    res.status(200).json(result.rows[0]);
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete a room
router.delete('/:id', authenticate, restrictTo('Manager'), async (req: CustomRequest, res: Response): Promise<void> => {
  const { id } = req.params;

  if (!req.user?.id) {
    res.status(401).json({ error: 'User not authenticated' });
    return;
  }

  try {
    const existing = await query('SELECT * FROM rooms WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    const activeBookings = await query('SELECT id FROM bookings WHERE room_id = $1 AND status = $2', [id, 'Active']);
    if (activeBookings.rows.length > 0) {
      res.status(400).json({ error: 'Cannot delete room with active bookings' });
      return;
    }

    await query('BEGIN');
    await query('DELETE FROM rooms WHERE id = $1', [id]);
    await query(
      'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
      ['DeleteRoom', req.user.id, 'Room', id, {}, existing.rows[0].property_id]
    );
    await query('COMMIT');

    res.status(204).json({});
  } catch (err) {
    await query('ROLLBACK');
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;