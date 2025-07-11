"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const db_1 = require("../services/db");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Get all rooms with optional filtering
router.get('/', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { status, floor } = req.query;
    let queryText = `
    SELECT r.id, r.room_number, r.floor, r.status, rt.name as type, rt.base_rate, r.property_id
    FROM rooms r
    JOIN room_types rt ON r.room_type_id = rt.id
  `;
    const params = [];
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
        const result = yield (0, db_1.query)(queryText, params);
        res.status(200).json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Create a new room (Manager-only)
router.post('/', auth_1.authenticate, (0, auth_1.restrictTo)('Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { room_number, floor, room_type_id, status, property_id } = req.body;
    if (!room_number || !floor || !room_type_id || !status || !property_id) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }
    try {
        const result = yield (0, db_1.query)('INSERT INTO rooms (room_number, floor, room_type_id, status, property_id) VALUES ($1, $2, $3, $4, $5) RETURNING *', [room_number, floor, room_type_id, status, property_id]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Get a single room by ID
router.get('/:id', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield (0, db_1.query)('SELECT r.*, rt.name AS type, rt.base_rate FROM rooms r JOIN room_types rt ON r.room_type_id = rt.id WHERE r.id = $1', [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        res.status(200).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Get room availability for date range
router.get('/availability', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { start_date, end_date, room_type_id, property_id } = req.query;
    if (!start_date || !end_date || !property_id) {
        res.status(400).json({ error: 'Missing required fields: start_date, end_date, property_id' });
        return;
    }
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
    }
    try {
        const startDate = new Date(start_date);
        const endDate = new Date(end_date);
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
        const params = [property_id, start_date, end_date];
        let paramIndex = 4;
        if (room_type_id) {
            queryStr += ` AND r.room_type_id = $${paramIndex++}`;
            params.push(room_type_id);
        }
        const result = yield (0, db_1.query)(queryStr, params);
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['SearchAvailability', req.user.id, 'Room', null, { start_date, end_date, room_type_id }, property_id]);
        res.status(200).json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Update a room
router.put('/:id', auth_1.authenticate, (0, auth_1.restrictTo)('Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const { room_number, floor, room_type_id, status, features } = req.body;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
    }
    try {
        const existing = yield (0, db_1.query)('SELECT * FROM rooms WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        const updates = [];
        const params = [id];
        let paramIndex = 2;
        if (room_number) {
            const roomCheck = yield (0, db_1.query)('SELECT id FROM rooms WHERE room_number = $1 AND property_id = $2 AND id != $3', [room_number, existing.rows[0].property_id, id]);
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
        yield (0, db_1.query)('BEGIN');
        const queryStr = `UPDATE rooms SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const result = yield (0, db_1.query)(queryStr, params);
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['UpdateRoom', req.user.id, 'Room', id, { room_number, floor, room_type_id, status, features }, existing.rows[0].property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(200).json(result.rows[0]);
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
}));
// Delete a room
router.delete('/:id', auth_1.authenticate, (0, auth_1.restrictTo)('Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
    }
    try {
        const existing = yield (0, db_1.query)('SELECT * FROM rooms WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        const activeBookings = yield (0, db_1.query)('SELECT id FROM bookings WHERE room_id = $1 AND status = $2', [id, 'Active']);
        if (activeBookings.rows.length > 0) {
            res.status(400).json({ error: 'Cannot delete room with active bookings' });
            return;
        }
        yield (0, db_1.query)('BEGIN');
        yield (0, db_1.query)('DELETE FROM rooms WHERE id = $1', [id]);
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['DeleteRoom', req.user.id, 'Room', id, {}, existing.rows[0].property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(204).json({});
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
}));
exports.default = router;
