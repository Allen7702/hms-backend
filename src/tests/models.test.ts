import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

describe('HMS PostgreSQL Relational Schemas', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
    });
    await pool.query(`
      TRUNCATE TABLE rooms, room_types, guests, bookings, invoices, users, maintenances, housekeepings, ota_reservations, audit_logs, notifications, properties RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should create a guest with valid loyalty tier', async () => {
    const res = await pool.query(
      `INSERT INTO guests (name, email, loyalty_tier, gdpr_consent) VALUES ($1, $2, $3, $4) RETURNING *`,
      ['Test Guest', 'test@example.com', 'Bronze', true]
    );
    expect(res.rows[0].loyalty_tier).toBe('Bronze');
  });

  it('should not allow invalid loyalty tier', async () => {
    await expect(
      pool.query(
        `INSERT INTO guests (name, email, loyalty_tier, gdpr_consent) VALUES ($1, $2, $3, $4)`,
        ['Test Guest', 'test2@example.com', 'Invalid', true]
      )
    ).rejects.toThrow('value for domain loyalty_tier violates check constraint');
  });

  it('should create a user with unique email', async () => {
    const res = await pool.query(
      `INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4) RETURNING *`,
      ['testuser', 'testuser@hotelsunshine.com', 'hashed', 'Receptionist']
    );
    expect(res.rows[0].email).toBe('testuser@hotelsunshine.com');
  });

  it('should not allow duplicate email in users', async () => {
    await pool.query(
      `INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)`,
      ['testuser1', 'duplicate@hotelsunshine.com', 'hashed', 'Receptionist']
    );
    await expect(
      pool.query(
        `INSERT INTO users (username, email, password, role) VALUES ($1, $2, $3, $4)`,
        ['testuser2', 'duplicate@hotelsunshine.com', 'hashed', 'Receptionist']
      )
    ).rejects.toThrow('duplicate key value violates unique constraint "users_email_key"');
  });

  it('should create an OTA reservation with unique ota_id', async () => {
    await pool.query(
      `INSERT INTO ota_reservations (booking_id, ota_id, source) VALUES ($1, $2, $3)`,
      [1, 'BC123', 'Booking.com']
    );
    await expect(
      pool.query(
        `INSERT INTO ota_reservations (booking_id, ota_id, source) VALUES ($1, $2, $3)`,
        [2, 'BC123', 'Booking.com']
      )
    ).rejects.toThrow('duplicate key value violates unique constraint "ota_reservations_ota_id_key"');
  });

  it('should create an audit log with valid action', async () => {
    const res = await pool.query(
      `INSERT INTO audit_logs (action, entity_type, details) VALUES ($1, $2, $3::jsonb) RETURNING *`,
      ['Login', 'User', { username: 'manager1' }]
    );
    expect(res.rows[0].action).toBe('Login');
  });

  it('should enforce valid notification type', async () => {
    await expect(
      pool.query(
        `INSERT INTO notifications (type, recipient, message, status) VALUES ($1, $2, $3, $4)`,
        ['Invalid', 'test@example.com', 'Test', 'Pending']
      )
    ).rejects.toThrow('value for domain type violates check constraint');
  });
});