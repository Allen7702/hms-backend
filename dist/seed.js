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
const pg_1 = require("pg");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
function seedDatabase() {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: ((_a = process.env.DATABASE_URL) === null || _a === void 0 ? void 0 : _a.includes('neon.tech')) ? { rejectUnauthorized: false } : false,
        });
        try {
            // Verify connection
            if (!process.env.DATABASE_URL) {
                throw new Error('DATABASE_URL is not defined in .env file');
            }
            console.log('Connecting to:', process.env.DATABASE_URL.replace(/:.*@/, ':<password>@'));
            const client = yield pool.connect();
            console.log('Connected to PostgreSQL (database: hms)');
            // Clear existing data
            yield client.query(`
      TRUNCATE TABLE rooms, room_types, guests, bookings, invoices, users, maintenances, housekeepings, ota_reservations, audit_logs, notifications, properties RESTART IDENTITY CASCADE;
    `);
            // Seed room_types
            const roomTypeRes = yield client.query(`
      INSERT INTO room_types (name, base_rate) VALUES
      ('Standard', 100.00),
      ('Deluxe', 150.00)
      RETURNING id, name
    `);
            const roomTypeIds = {
                Standard: roomTypeRes.rows.find((r) => r.name === 'Standard').id,
                Deluxe: roomTypeRes.rows.find((r) => r.name === 'Deluxe').id,
            };
            console.log('Seeded 2 room types');
            // Seed properties
            const propertyRes = yield client.query(`INSERT INTO properties (name, address) VALUES ($1, $2) RETURNING id`, ['Hotel Sunshine', '123 Main St, City, Country']);
            const propertyId = propertyRes.rows[0].id;
            console.log('Seeded 1 property');
            const rooms = [];
            for (let floor = 1; floor <= 3; floor++) {
                for (let i = 1; i <= 6; i++) {
                    const roomNumber = `${floor}${i.toString().padStart(2, '0')}`;
                    rooms.push([
                        roomNumber,
                        floor,
                        i % 2 === 0 ? roomTypeIds.Deluxe : roomTypeIds.Standard,
                        'Available',
                        propertyId,
                    ]);
                }
            }
            yield client.query(`INSERT INTO rooms (room_number, floor, room_type_id, status, property_id) VALUES ${rooms.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ')}`, rooms.flat());
            console.log('Seeded 18 rooms');
            // Seed users (1 Manager, 1 Receptionist)
            const users = [
                {
                    username: 'manager',
                    email: 'manager1@hotelsunshine.com',
                    password: yield bcryptjs_1.default.hash('password123', 10),
                    role: 'Manager',
                    propertyId,
                },
                {
                    username: 'receptionist1',
                    email: 'receptionist1@hotelsunshine.com',
                    password: yield bcryptjs_1.default.hash('password123', 10),
                    role: 'Receptionist',
                    propertyId,
                }
            ];
            const userRes = yield client.query(`INSERT INTO users (username, email, password, role, property_id) VALUES ${users.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ')} RETURNING id`, users.flatMap(u => [u.username, u.email, u.password, u.role, u.propertyId]));
            const userIds = userRes.rows.map((row) => row.id);
            console.log('Seeded 3 users');
            // Seed a guest
            const guestRes = yield client.query(`INSERT INTO guests (name, email, phone, gdpr_consent, loyalty_points, loyalty_tier, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, ['John Doe', 'john.doe@example.com', '123-456-7890', true, 100, 'Bronze', propertyId]);
            const guestId = guestRes.rows[0].id;
            console.log('Seeded 1 guest');
            // Seed a booking
            const roomRes = yield client.query(`SELECT id FROM rooms WHERE room_number = '101'`);
            const roomId = roomRes.rows[0].id;
            const bookingRes = yield client.query(`INSERT INTO bookings (guest_id, room_id, check_in, check_out, status, source, rate_applied, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`, [guestId, roomId, '2025-07-10', '2025-07-12', 'Active', 'Booking.com', 150.00, propertyId]);
            const bookingId = bookingRes.rows[0].id;
            console.log('Seeded 1 booking');
            // Seed an OTA reservation
            yield client.query(`INSERT INTO ota_reservations (booking_id, ota_id, source, guest_notes, cancellation_policy, property_id) VALUES ($1, $2, $3, $4, $5, $6)`, [bookingId, 'BC123456789', 'Booking.com', 'Late check-in requested', 'Non-refunded', propertyId]);
            console.log('Seeded 1 OTA reservation');
            // Seed an audit log
            yield client.query(`INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`, ['CreateBooking', userIds[0], 'Booking', bookingId, { guestId, roomNumber: '101' }, propertyId]);
            console.log('Seeded 1 audit log');
            // Seed a notification
            yield client.query(`INSERT INTO notifications (type, recipient, message, status, related_entity_id, entity_type, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`, ['Email', 'john.doe@example.com', 'Your booking for July 10-12 is confirmed!', 'Pending', bookingId, 'Booking', propertyId]);
            console.log('Seeded 1 notification');
            // Insert invoices
            yield client.query(`
      INSERT INTO invoices (booking_id, amount, tax, receipt, status, payment_method, property_id) VALUES
      (1, 220.00, 20.00, 'Invoice for booking 1: 2 nights at $100.00/night, Tax: $20.00, Total: $220.00', 'Paid', 'Credit Card', 1)
      ON CONFLICT DO NOTHING;
    `);
            // Insert refresh tokens (7-day expiry)
            yield client.query(`
      INSERT INTO refresh_tokens (user_id, token, expires_at, property_id) VALUES
      (1, 'sample-refresh-token-manager1', $1, 1),
      (2, 'sample-refresh-token-receptionist1', $1, 1)
      ON CONFLICT DO NOTHING;
    `, [new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]);
            console.log('Database seeding completed');
            yield client.release();
            yield pool.end();
        }
        catch (error) {
            console.error('Seeding error:', error);
            yield pool.end();
            process.exit(1);
        }
    });
}
seedDatabase();
