import express, { Request, Response } from 'express';
import { query } from '../services/db';
import { authenticate, restrictTo } from '../middleware/auth';

const router = express.Router();

// Get bookings with optional date range filter
router.get('/', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
  const { start_date, end_date } = req.query;
  let queryText = `
    SELECT b.id, b.guest_id, g.name as guest_name, b.room_id, r.room_number, b.check_in, b.check_out, b.status, b.source, b.rate_applied, b.property_id
    FROM bookings b
    JOIN guests g ON b.guest_id = g.id
    JOIN rooms r ON b.room_id = r.id
  `;
  const params: any[] = [];
  if (start_date || end_date) {
    queryText += ' WHERE';
    if (start_date) {
      queryText += ' b.check_in >= $1';
      params.push(start_date);
    }
    if (end_date) {
      queryText += (params.length ? ' AND' : '') + ' b.check_out <= $' + (params.length + 1);
      params.push(end_date);
    }
  }
  try {
    const result = await query(queryText, params);
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Create a new booking
router.post('/', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
  const { guest_id, room_id, check_in, check_out, source, rate_applied, property_id } = req.body;
  if (!guest_id || !room_id || !check_in || !check_out || !source || !rate_applied || !property_id) {
    res.status(400).json({ error: 'Missing required fields' });
    return;
  }
  try {
    // Validate room availability
    const availabilityCheck = await query(
      `SELECT status FROM rooms WHERE id = $1 AND status = 'Available'`,
      [room_id]
    );
    if (availabilityCheck.rows.length === 0) {
      res.status(400).json({ error: 'Room is not available' });
      return;
    }

    // Check for overlapping bookings
    const overlapCheck = await query(
      `SELECT id FROM bookings
       WHERE room_id = $1 AND status = 'Active'
       AND (check_in <= $3 AND check_out >= $2)`,
      [room_id, check_in, check_out]
    );
    if (overlapCheck.rows.length > 0) {
      res.status(400).json({ error: 'Room is already booked for the selected dates' });
      return;
    }

    const result = await query(
      `INSERT INTO bookings (guest_id, room_id, check_in, check_out, status, source, rate_applied, property_id)
       VALUES ($1, $2, $3, $4, 'Active', $5, $6, $7) RETURNING *`,
      [guest_id, room_id, check_in, check_out, source, rate_applied, property_id]
    );

    // Update room status
    await query(`UPDATE rooms SET status = 'Occupied' WHERE id = $1`, [room_id]);

    // Log audit
    await query(
      `INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      ['CreateBooking', (req as any).user.id, 'Booking', result.rows[0].id, { guest_id, room_id }, property_id]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;