import express, { Request, Response } from 'express';
import { query } from '../services/db';
import { authenticate, restrictTo } from '../middleware/auth';
import { CustomRequest } from '../types';


const router = express.Router();

// Get all maintenance tickets
router.get('/', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { status, priority, room_id } = req.query;
        let queryStr = 'SELECT m.*, r.room_number, u.username AS assignee_username FROM maintenances m LEFT JOIN rooms r ON m.room_id = r.id LEFT JOIN users u ON m.assignee_id = u.id';
        const params: any[] = [];
        const conditions: string[] = [];

        if (status) {
            conditions.push(`m.status = $${params.length + 1}`);
            params.push(status);
        }
        if (priority) {
            conditions.push(`m.priority = $${params.length + 1}`);
            params.push(priority);
        }
        if (room_id) {
            conditions.push(`m.room_id = $${params.length + 1}`);
            params.push(room_id);
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

// Get a single maintenance ticket by ID
router.get('/:id', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const result = await query(
            'SELECT m.*, r.room_number, u.username AS assignee_username FROM maintenances m LEFT JOIN rooms r ON m.room_id = r.id LEFT JOIN users u ON m.assignee_id = u.id WHERE m.id = $1',
            [id]
        );
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Maintenance ticket not found' });
            return;
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// Create a maintenance ticket
router.post('/', authenticate, restrictTo('Receptionist', 'Manager'), async (req: CustomRequest, res: Response): Promise<void> => {
    const { room_id, description, priority, assignee_id, property_id } = req.body;
    if (!room_id || !description || !priority || !property_id) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }

    try {
        const roomCheck = await query('SELECT status FROM rooms WHERE id = $1', [room_id]);
        if (roomCheck.rows.length === 0) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }

        await query('BEGIN');
        const result = await query(
            'INSERT INTO maintenances (room_id, description, status, priority, assignee_id, property_id, history) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [room_id, description, 'Open', priority, assignee_id, property_id, [{ status: 'Open', timestamp: new Date().toISOString() }]]
        );
        await query('UPDATE rooms SET status = $1 WHERE id = $2', ['Maintenance', room_id]);
        await query(
            'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
            ['CreateMaintenance', req.user?.id, 'Maintenance', result.rows[0].id, { description }, property_id]
        );
        await query('COMMIT');

        res.status(201).json(result.rows[0]);
    } catch (err) {
        await query('ROLLBACK');
        res.status(500).json({ error: (err as Error).message });
    }
});

// Update a maintenance ticket
router.put('/:id', authenticate, restrictTo('Receptionist', 'Manager'), async (req: CustomRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const { description, status, priority, assignee_id } = req.body;

    try {
        const existing = await query('SELECT * FROM maintenances WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Maintenance ticket not found' });
            return;
        }

        const updates: any[] = [];
        const params: any[] = [id];
        let paramIndex = 2;

        if (description) {
            updates.push(`description = $${paramIndex++}`);
            params.push(description);
        }
        if (status) {
            updates.push(`status = $${paramIndex++}`);
            params.push(status);
        }
        if (priority) {
            updates.push(`priority = $${paramIndex++}`);
            params.push(priority);
        }
        if (assignee_id) {
            updates.push(`assignee_id = $${paramIndex++}`);
            params.push(assignee_id);
        }

        if (updates.length === 0) {
            res.status(400).json({ error: 'No valid fields to update' });
            return;
        }

        await query('BEGIN');
        if (status) {
            const historyUpdate = await query('SELECT history FROM maintenances WHERE id = $1', [id]);
            const currentHistory = historyUpdate.rows[0].history || [];
            currentHistory.push({ status, timestamp: new Date().toISOString() });
            updates.push(`history = $${paramIndex++}`);
            params.push(currentHistory);
        }

        const queryStr = `UPDATE maintenances SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const result = await query(queryStr, params);

        if (status === 'Resolved') {
            await query('UPDATE rooms SET status = $1 WHERE id = $2', ['Available', existing.rows[0].room_id]);
        }

        await query(
            'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
            ['UpdateMaintenance', req.user?.id, 'Maintenance', id, { description, status, priority, assignee_id }, existing.rows[0].property_id]
        );
        await query('COMMIT');

        res.status(200).json(result.rows[0]);
    } catch (err) {
        await query('ROLLBACK');
        res.status(500).json({ error: (err as Error).message });
    }
});

// Delete a maintenance ticket
router.delete('/:id', authenticate, restrictTo('Manager'), async (req: CustomRequest, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
        const existing = await query('SELECT * FROM maintenances WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Maintenance ticket not found' });
            return;
        }

        await query('BEGIN');
        await query('DELETE FROM maintenances WHERE id = $1', [id]);
        if (existing.rows[0].status !== 'Resolved') {
            await query('UPDATE rooms SET status = $1 WHERE id = $2', ['Available', existing.rows[0].room_id]);
        }
        await query(
            'INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)',
            ['DeleteMaintenance', req?.user?.id, 'Maintenance', id, {}, existing.rows[0].property_id]
        );
        await query('COMMIT');

        res.status(204).json({});
    } catch (err) {
        await query('ROLLBACK');
        res.status(500).json({ error: (err as Error).message });
    }
});

export default router;