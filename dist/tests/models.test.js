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
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
describe('HMS PostgreSQL Relational Schemas', () => {
    let pool;
    beforeAll(() => __awaiter(void 0, void 0, void 0, function* () {
        var _a;
        pool = new pg_1.Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: ((_a = process.env.DATABASE_URL) === null || _a === void 0 ? void 0 : _a.includes('neon.tech')) ? { rejectUnauthorized: false } : false,
        });
        yield pool.query(`
      TRUNCATE TABLE rooms, room_types, guests, bookings, invoices, users, maintenances, housekeepings, ota_reservations, audit_logs, notifications, properties RESTART IDENTITY CASCADE
    `);
    }));
    afterAll(() => __awaiter(void 0, void 0, void 0, function* () {
        yield pool.end();
    }));
    it('should create a guest with valid loyalty tier', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield pool.query(`INSERT INTO guests (name, email, loyalty_tier, gdpr_consent) VALUES ($1, $2, $3, $4) RETURNING *`, ['Test Guest', 'test@example.com', 'Bronze', true]);
        expect(res.rows[0].loyalty_tier).toBe('Bronze');
    }));
    it('should not allow invalid loyalty tier', () => __awaiter(void 0, void 0, void 0, function* () {
        yield expect(pool.query(`INSERT INTO guests (name, email, loyalty_tier, gdpr_consent) VALUES ($1, $2, $3, $4)`, ['Test Guest', 'test2@example.com', 'Invalid', true])).rejects.toThrow('value for domain loyalty_tier violates check constraint');
    }));
    it('should create a user with unique email', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield pool.query(`INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *`, ['testuser', 'testuser@hotelsunshine.com', 'hashed', 'Receptionist']);
        expect(res.rows[0].email).toBe('testuser@hotelsunshine.com');
    }));
    it('should not allow duplicate email in users', () => __awaiter(void 0, void 0, void 0, function* () {
        yield pool.query(`INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)`, ['testuser1', 'duplicate@hotelsunshine.com', 'hashed', 'Receptionist']);
        yield expect(pool.query(`INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)`, ['testuser2', 'duplicate@hotelsunshine.com', 'hashed', 'Receptionist'])).rejects.toThrow('duplicate key value violates unique constraint "users_email_key"');
    }));
    it('should create an OTA reservation with unique ota_id', () => __awaiter(void 0, void 0, void 0, function* () {
        yield pool.query(`INSERT INTO ota_reservations (booking_id, ota_id, source) VALUES ($1, $2, $3)`, [1, 'BC123', 'Booking.com']);
        yield expect(pool.query(`INSERT INTO ota_reservations (booking_id, ota_id, source) VALUES ($1, $2, $3)`, [2, 'BC123', 'Booking.com'])).rejects.toThrow('duplicate key value violates unique constraint "ota_reservations_ota_id_key"');
    }));
    it('should create an audit log with valid action', () => __awaiter(void 0, void 0, void 0, function* () {
        const res = yield pool.query(`INSERT INTO audit_logs (action, entity_type, details) VALUES ($1, $2, $3::jsonb) RETURNING *`, ['Login', 'User', { username: 'manager1' }]);
        expect(res.rows[0].action).toBe('Login');
    }));
    it('should enforce valid notification type', () => __awaiter(void 0, void 0, void 0, function* () {
        yield expect(pool.query(`INSERT INTO notifications (type, recipient, message, status) VALUES ($1, $2, $3, $4)`, ['Invalid', 'test@example.com', 'Test', 'Pending'])).rejects.toThrow('value for domain type violates check constraint');
    }));
});
