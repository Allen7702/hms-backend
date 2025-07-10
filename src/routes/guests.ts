import express, { Request, Response } from 'express';
import { query } from '../services/db';
import { authenticate, restrictTo } from '../middleware/auth';


const router = express.Router();

router.get('/', authenticate, restrictTo('Receptionist', 'Manager'), async (req: Request, res: Response): Promise<void> => {
    const result = await query('SELECT * FROM guests');
    res.status(200).json(result.rows);
})

export default router;