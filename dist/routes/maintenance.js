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
// Get all maintenance tickets
router.get('/', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { status, priority, room_id } = req.query;
        let queryStr = 'SELECT m.*, r.room_number, u.username AS assignee_username FROM maintenances m LEFT JOIN rooms r ON m.room_id = r.id LEFT JOIN users u ON m.assignee_id = u.id';
        const params = [];
        const conditions = [];
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
        const result = yield (0, db_1.query)(queryStr, params);
        res.status(200).json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Get a single maintenance ticket by ID
router.get('/:id', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield (0, db_1.query)('SELECT m.*, r.room_number, u.username AS assignee_username FROM maintenances m LEFT JOIN rooms r ON m.room_id = r.id LEFT JOIN users u ON m.assignee_id = u.id WHERE m.id = $1', [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Maintenance ticket not found' });
            return;
        }
        res.status(200).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Create a maintenance ticket
router.post('/', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { room_id, description, priority, assignee_id, property_id } = req.body;
    if (!room_id || !description || !priority || !property_id) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }
    try {
        const roomCheck = yield (0, db_1.query)('SELECT status FROM rooms WHERE id = $1', [room_id]);
        if (roomCheck.rows.length === 0) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        yield (0, db_1.query)('BEGIN');
        const result = yield (0, db_1.query)('INSERT INTO maintenances (room_id, description, status, priority, assignee_id, property_id, history) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [room_id, description, 'Open', priority, assignee_id, property_id, [{ status: 'Open', timestamp: new Date().toISOString() }]]);
        yield (0, db_1.query)('UPDATE rooms SET status = $1 WHERE id = $2', ['Maintenance', room_id]);
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['CreateMaintenance', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id, 'Maintenance', result.rows[0].id, { description }, property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
}));
// Update a maintenance ticket
router.put('/:id', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const { description, status, priority, assignee_id } = req.body;
    try {
        const existing = yield (0, db_1.query)('SELECT * FROM maintenances WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Maintenance ticket not found' });
            return;
        }
        const updates = [];
        const params = [id];
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
        yield (0, db_1.query)('BEGIN');
        if (status) {
            const historyUpdate = yield (0, db_1.query)('SELECT history FROM maintenances WHERE id = $1', [id]);
            const currentHistory = historyUpdate.rows[0].history || [];
            currentHistory.push({ status, timestamp: new Date().toISOString() });
            updates.push(`history = $${paramIndex++}`);
            params.push(currentHistory);
        }
        const queryStr = `UPDATE maintenances SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const result = yield (0, db_1.query)(queryStr, params);
        if (status === 'Resolved') {
            yield (0, db_1.query)('UPDATE rooms SET status = $1 WHERE id = $2', ['Available', existing.rows[0].room_id]);
        }
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['UpdateMaintenance', (_a = req.user) === null || _a === void 0 ? void 0 : _a.id, 'Maintenance', id, { description, status, priority, assignee_id }, existing.rows[0].property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(200).json(result.rows[0]);
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
}));
// Delete a maintenance ticket
router.delete('/:id', auth_1.authenticate, (0, auth_1.restrictTo)('Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    try {
        const existing = yield (0, db_1.query)('SELECT * FROM maintenances WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Maintenance ticket not found' });
            return;
        }
        yield (0, db_1.query)('BEGIN');
        yield (0, db_1.query)('DELETE FROM maintenances WHERE id = $1', [id]);
        if (existing.rows[0].status !== 'Resolved') {
            yield (0, db_1.query)('UPDATE rooms SET status = $1 WHERE id = $2', ['Available', existing.rows[0].room_id]);
        }
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['DeleteMaintenance', (_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.id, 'Maintenance', id, {}, existing.rows[0].property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(204).json({});
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
}));
exports.default = router;
