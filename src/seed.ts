import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

async function seedDatabase(): Promise<void> {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
  });

  try {
    // Verify connection
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not defined in .env file');
    }
    console.log('Connecting to:', process.env.DATABASE_URL.replace(/:.*@/, ':<password>@'));
    const client = await pool.connect();
    console.log('Connected to PostgreSQL (database: hms)');

    // Clear existing data
    await client.query(`
      TRUNCATE TABLE rooms, room_types, guests, bookings, invoices, users, maintenances, housekeepings, ota_reservations, audit_logs, notifications, properties RESTART IDENTITY CASCADE;
    `);

    // Seed room_types
    const roomTypeRes = await client.query(`
      INSERT INTO room_types (name, base_rate) VALUES
      ('Standard', 100.00),
      ('Deluxe', 150.00)
      RETURNING id, name
    `);
    const roomTypeIds = {
      Standard: roomTypeRes.rows.find((r: any) => r.name === 'Standard').id,
      Deluxe: roomTypeRes.rows.find((r: any) => r.name === 'Deluxe').id,
    };
    console.log('Seeded 2 room types');

    // Seed properties
    const propertyRes = await client.query(
      `INSERT INTO properties (name, address) VALUES ($1, $2) RETURNING id`,
      ['Hotel Sunshine', '123 Main St, City, Country']
    );
    const propertyId = propertyRes.rows[0].id;
    console.log('Seeded 1 property');

    // Seed rooms (30 rooms: 10 per floor, Standard/Deluxe)
    const rooms = [];
    for (let floor = 1; floor <= 3; floor++) {
      for (let i = 1; i <= 10; i++) {
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
    await client.query(
      `INSERT INTO rooms (room_number, floor, room_type_id, status, property_id) VALUES ${rooms.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ')}`,
      rooms.flat()
    );
    console.log('Seeded 30 rooms');

    // Seed users (1 Manager, 2 Receptionists)
    const users = [
      {
        username: 'manager1',
        email: 'manager1@hotelsunshine.com',
        password: await bcrypt.hash('password123', 10),
        role: 'Manager',
        propertyId,
      },
      {
        username: 'receptionist1',
        email: 'receptionist1@hotelsunshine.com',
        password: await bcrypt.hash('password123', 10),
        role: 'Receptionist',
        propertyId,
      },
      {
        username: 'receptionist2',
        email: 'receptionist2@hotelsunshine.com',
        password: await bcrypt.hash('password123', 10),
        role: 'Receptionist',
        propertyId,
      },
    ];
    const userRes = await client.query(
      `INSERT INTO users (username, email, password, role, property_id) VALUES ${users.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ')} RETURNING id`,
      users.flatMap(u => [u.username, u.email, u.password, u.role, u.propertyId])
    );
    const userIds = userRes.rows.map((row: any) => row.id);
    console.log('Seeded 3 users');

    // Seed a guest
    const guestRes = await client.query(
      `INSERT INTO guests (name, email, phone, gdpr_consent, loyalty_points, loyalty_tier, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      ['John Doe', 'john.doe@example.com', '123-456-7890', true, 100, 'Bronze', propertyId]
    );
    const guestId = guestRes.rows[0].id;
    console.log('Seeded 1 guest');

    // Seed a booking
    const roomRes = await client.query(`SELECT id FROM rooms WHERE room_number = '101'`);
    const roomId = roomRes.rows[0].id;
    const bookingRes = await client.query(
      `INSERT INTO bookings (guest_id, room_id, check_in, check_out, status, source, rate_applied, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [guestId, roomId, '2025-07-10', '2025-07-12', 'Active', 'Booking.com', 150.00, propertyId]
    );
    const bookingId = bookingRes.rows[0].id;
    console.log('Seeded 1 booking');

    // Seed an OTA reservation
    await client.query(
      `INSERT INTO ota_reservations (booking_id, ota_id, source, guest_notes, cancellation_policy, property_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [bookingId, 'BC123456789', 'Booking.com', 'Late check-in requested', 'Non-refunded', propertyId]
    );
    console.log('Seeded 1 OTA reservation');

    // Seed an audit log
    await client.query(
      `INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      ['CreateBooking', userIds[0], 'Booking', bookingId, { guestId, roomNumber: '101' }, propertyId]
    );
    console.log('Seeded 1 audit log');

    // Seed a notification
    await client.query(
      `INSERT INTO notifications (type, recipient, message, status, related_entity_id, entity_type, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['Email', 'john.doe@example.com', 'Your booking for July 10-12 is confirmed!', 'Pending', bookingId, 'Booking', propertyId]
    );
    console.log('Seeded 1 notification');

    console.log('Database seeding completed');
    await client.release();
    await pool.end();
  } catch (error) {
    console.error('Seeding error:', error);
    await pool.end();
    process.exit(1);
  }
}

seedDatabase();