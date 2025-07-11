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
// Get bookings with optional date range filter
router.get('/', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { start_date, end_date } = req.query;
    let queryText = `
    SELECT b.id, b.guest_id, g.name as guest_name, b.room_id, r.room_number, b.check_in, b.check_out, b.status, b.source, b.rate_applied, b.property_id
    FROM bookings b
    JOIN guests g ON b.guest_id = g.id
    JOIN rooms r ON b.room_id = r.id
  `;
    const params = [];
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
        const result = yield (0, db_1.query)(queryText, params);
        res.status(200).json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Create a new booking
router.post('/', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { guest_id, room_id, check_in, check_out, source, rate_applied, property_id } = req.body;
    if (!guest_id || !room_id || !check_in || !check_out || !source || !rate_applied || !property_id) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }
    try {
        // Validate room availability
        const availabilityCheck = yield (0, db_1.query)(`SELECT status FROM rooms WHERE id = $1 AND status = 'Available'`, [room_id]);
        if (availabilityCheck.rows.length === 0) {
            res.status(400).json({ error: 'Room is not available' });
            return;
        }
        // Check for overlapping bookings
        const overlapCheck = yield (0, db_1.query)(`SELECT id FROM bookings
       WHERE room_id = $1 AND status = 'Active'
       AND (check_in <= $3 AND check_out >= $2)`, [room_id, check_in, check_out]);
        if (overlapCheck.rows.length > 0) {
            res.status(400).json({ error: 'Room is already booked for the selected dates' });
            return;
        }
        const result = yield (0, db_1.query)(`INSERT INTO bookings (guest_id, room_id, check_in, check_out, status, source, rate_applied, property_id)
       VALUES ($1, $2, $3, $4, 'Active', $5, $6, $7) RETURNING *`, [guest_id, room_id, check_in, check_out, source, rate_applied, property_id]);
        // Update room status
        yield (0, db_1.query)(`UPDATE rooms SET status = 'Occupied' WHERE id = $1`, [room_id]);
        // Log audit
        yield (0, db_1.query)(`INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`, ['CreateBooking', req.user.id, 'Booking', result.rows[0].id, { guest_id, room_id }, property_id]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Check-in
router.put('/:id/check-in', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    yield (0, db_1.query)('UPDATE bookings SET status = $1 WHERE id = $2', ['Active', id]);
    res.status(200).json({ message: 'Checked in' });
}));
// Check-out
router.put('/:id/check-out', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const booking = yield (0, db_1.query)('SELECT room_id FROM bookings WHERE id = $1', [id]);
    yield (0, db_1.query)('UPDATE bookings SET status = $1 WHERE id = $2', ['Completed', id]);
    yield (0, db_1.query)('UPDATE rooms SET status = $1 WHERE id = $2', ['Dirty', booking.rows[0].room_id]);
    res.status(200).json({ message: 'Checked out' });
}));
// Cancel
router.put('/:id/cancel', auth_1.authenticate, (0, auth_1.restrictTo)('Receptionist', 'Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const booking = yield (0, db_1.query)('SELECT room_id FROM bookings WHERE id = $1', [id]);
    yield (0, db_1.query)('UPDATE bookings SET status = $1 WHERE id = $2', ['Cancelled', id]);
    yield (0, db_1.query)('UPDATE rooms SET status = $1 WHERE id = $2', ['Available', booking.rows[0].room_id]);
    res.status(200).json({ message: 'Booking cancelled' });
}));
exports.default = router;
