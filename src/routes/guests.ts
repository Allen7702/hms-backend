import express, { Request, Response } from 'express';
import { query } from '../services/db';
import { authenticate, restrictTo } from '../middleware/auth';
import { CustomRequest } from '../types';


const router = express.Router();

// Get all guests
router.get('/', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, loyalty_tier } = req.query;
        let queryStr = 'SELECT * FROM guests';
        const params: any[] = [];
        const conditions: string[] = [];

        if (email) {
            conditions.push(`email = $${params.length + 1}`);
            params.push(email);
        }
        if (loyalty_tier) {
            conditions.push(`loyalty_tier = $${params.length + 1}`);
            params.push(loyalty_tier);
        }

        if (conditions.length > 0) {
            queryStr += ' WHERE ' + conditions.join(' AND ');
        }

        const result = await query(queryStr, params);
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Get a single guest by ID
router.get('/:id', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const result = await query('SELECT * FROM guests WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Guest not found' });
            return;
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Get guest booking history
router.get('/:id/bookings', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const result = await query(
            'SELECT b.*, r.room_number FROM bookings b JOIN rooms r ON b.room_id = r.id WHERE b.guest_id = $1',
            [id]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Create a guest
router.post('/', authenticate, restrictTo('Receptionist', 'Manager'), async (req: CustomRequest, res: Response): Promise<void> => {
    const { name, email, phone, address, preferences, loyalty_tier, gdpr_consent, property_id } = req.body;

    if (!name || !email || !property_id) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    if (!req.user?.id) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
    }

    try {
        const emailCheck = await query('SELECT id FROM guests WHERE email = $1', [email]);
        if (emailCheck.rows.length > 0) {
            res.status(400).json({ error: 'Email already exists' });
            return;
        }

        await query('BEGIN');
        const result = await query(
            'INSERT INTO guests (name, email, phone, address, preferences, loyalty_tier, gdpr_consent, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
            [name, email, phone, address, preferences || {}, loyalty_tier || 'None', gdpr_consent || false, property_id]
        );
        await query(
            'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
            ['CreateGuest', req.user.id, 'Guest', result.rows[0].id, { name, email }, property_id]
        );
        await query('COMMIT');

        res.status(201).json(result.rows[0]);
    } catch (err) {
        await query('ROLLBACK');
        res.status(500).json({ error: (err as Error).message });
    }
});

// Update a guest
router.put('/:id', authenticate, restrictTo('Receptionist', 'Manager'), async (req: CustomRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { name, email, phone, address, preferences, loyalty_points, loyalty_tier, gdpr_consent } = req.body;

    if (!req.user?.id) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
    }

    try {
        const existing = await query('SELECT * FROM guests WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Guest not found' });
            return;
        }

        const updates: string[] = [];
        const params: any[] = [id];
        let paramIndex = 2;

        if (name) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (email) {
            const emailCheck = await query('SELECT id FROM guests WHERE email = $1 AND id != $2', [email, id]);
            if (emailCheck.rows.length > 0) {
                res.status(400).json({ error: 'Email already exists' });
                return;
            }
            updates.push(`email = $${paramIndex++}`);
            params.push(email);
        }
        if (phone) {
            updates.push(`phone = $${paramIndex++}`);
            params.push(phone);
        }
        if (address) {
            updates.push(`address = $${paramIndex++}`);
            params.push(address);
        }
        if (preferences) {
            updates.push(`preferences = $${paramIndex++}`);
            params.push(preferences);
        }
        if (loyalty_points !== undefined) {
            updates.push(`loyalty_points = $${paramIndex++}`);
            params.push(loyalty_points);
        }
        if (loyalty_tier) {
            updates.push(`loyalty_tier = $${paramIndex++}`);
            params.push(loyalty_tier);
        }
        if (gdpr_consent !== undefined) {
            updates.push(`gdpr_consent = $${paramIndex++}`);
            params.push(gdpr_consent);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No valid fields to update' });
            return;
        }

        await query('BEGIN');
        const queryStr = `UPDATE guests SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const result = await query(queryStr, params);
        await query(
            'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
            ['UpdateGuest', req.user.id, 'Guest', id, { name, email, loyalty_tier }, existing.rows[0].property_id]
        );
        await query('COMMIT');

        res.status(200).json(result.rows[0]);
    } catch (err) {
        await query('ROLLBACK');
        res.status(500).json({ error: (err as Error).message });
    }
});

// Delete a guest
router.delete('/:id', authenticate, restrictTo('Manager'), async (req: CustomRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!req.user?.id) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
    }

    try {
        const existing = await query('SELECT * FROM guests WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Guest not found' });
            return;
        }

        const activeBookings = await query('SELECT id FROM bookings WHERE guest_id = $1 AND status = $2', [id, 'Active']);
        if (activeBookings.rows.length > 0) {
            res.status(400).json({ error: 'Cannot delete guest with active bookings' });
            return;
        }

        await query('BEGIN');
        await query('DELETE FROM guests WHERE id = $1', [id]);
        await query(
            'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
            ['DeleteGuest', req.user.id, 'Guest', id, {}, existing.rows[0].property_id]
        );
        await query('COMMIT');

        res.status(204).json({});
    } catch (err) {
        await query('ROLLBACK');
        res.status(500).json({ error: (err as Error).message });
    }
});

export default router;