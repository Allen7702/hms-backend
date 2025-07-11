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
// Get all guests
router.get('/', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, loyalty_tier } = req.query;
        let queryStr = 'SELECT * FROM guests';
        const params = [];
        const conditions = [];
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
        const result = yield (0, db_1.query)(queryStr, params);
        res.status(200).json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Get a single guest by ID
router.get('/:id', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield (0, db_1.query)('SELECT * FROM guests WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            res.status(404).json({ error: 'Guest not found' });
            return;
        }
        res.status(200).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Get guest booking history
router.get('/:id/bookings', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const result = yield (0, db_1.query)('SELECT b.*, r.room_number FROM bookings b JOIN rooms r ON b.room_id = r.id WHERE b.guest_id = $1', [id]);
        res.status(200).json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Create a guest
router.post('/', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { name, email, phone, address, preferences, loyalty_tier, gdpr_consent, property_id } = req.body;
    if (!name || !email || !property_id) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
    }
    try {
        const emailCheck = yield (0, db_1.query)('SELECT id FROM guests WHERE email = $1', [email]);
        if (emailCheck.rows.length > 0) {
            res.status(400).json({ error: 'Email already exists' });
            return;
        }
        yield (0, db_1.query)('BEGIN');
        const result = yield (0, db_1.query)('INSERT INTO guests (name, email, phone, address, preferences, loyalty_tier, gdpr_consent, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *', [name, email, phone, address, preferences || {}, loyalty_tier || 'None', gdpr_consent || false, property_id]);
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['CreateGuest', req.user.id, 'Guest', result.rows[0].id, { name, email }, property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
}));
// Update a guest
router.put('/:id', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    const { name, email, phone, address, preferences, loyalty_points, loyalty_tier, gdpr_consent } = req.body;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
    }
    try {
        const existing = yield (0, db_1.query)('SELECT * FROM guests WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Guest not found' });
            return;
        }
        const updates = [];
        const params = [id];
        let paramIndex = 2;
        if (name) {
            updates.push(`name = $${paramIndex++}`);
            params.push(name);
        }
        if (email) {
            const emailCheck = yield (0, db_1.query)('SELECT id FROM guests WHERE email = $1 AND id != $2', [email, id]);
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
        yield (0, db_1.query)('BEGIN');
        const queryStr = `UPDATE guests SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
        const result = yield (0, db_1.query)(queryStr, params);
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['UpdateGuest', req.user.id, 'Guest', id, { name, email, loyalty_tier }, existing.rows[0].property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(200).json(result.rows[0]);
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
}));
// Delete a guest
router.delete('/:id', auth_1.authenticate, (0, auth_1.restrictTo)('Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { id } = req.params;
    if (!((_a = req.user) === null || _a === void 0 ? void 0 : _a.id)) {
        res.status(401).json({ error: 'User not authenticated' });
        return;
    }
    try {
        const existing = yield (0, db_1.query)('SELECT * FROM guests WHERE id = $1', [id]);
        if (existing.rows.length === 0) {
            res.status(404).json({ error: 'Guest not found' });
            return;
        }
        const activeBookings = yield (0, db_1.query)('SELECT id FROM bookings WHERE guest_id = $1 AND status = $2', [id, 'Active']);
        if (activeBookings.rows.length > 0) {
            res.status(400).json({ error: 'Cannot delete guest with active bookings' });
            return;
        }
        yield (0, db_1.query)('BEGIN');
        yield (0, db_1.query)('DELETE FROM guests WHERE id = $1', [id]);
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['DeleteGuest', req.user.id, 'Guest', id, {}, existing.rows[0].property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(204).json({});
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
}));
exports.default = router;
