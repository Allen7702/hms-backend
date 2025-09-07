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

    // Seed rooms with new numbering (101-106, 107-113, 114-120, 1 small per floor)
    const rooms = [];
    // 1st floor (101-106), with 102 explicitly set to Occupied
    const firstFloorRooms = [];
    for (let i = 1; i <= 6; i++) {
      const roomNumber = `10${i}`;
      const isSmall = i === 1; // 101 is small
      firstFloorRooms.push([
        roomNumber,
        1,
        i % 2 === 0 ? roomTypeIds.Deluxe : roomTypeIds.Standard,
        'Available',
        propertyId,
        isSmall ? JSON.stringify({ size: 'small' }) : null,
      ]);
    }
    // Override room 102 status
    const room102Index = firstFloorRooms.findIndex(([roomNumber]) => roomNumber === '102');
    if (room102Index !== -1) {
      firstFloorRooms[room102Index][3] = 'Occupied'; // Set status to Occupied
      console.log(`Overriding room 102 status to: ${firstFloorRooms[room102Index][3]}`); // Debug log
    } else {
      console.log('Room 102 not found in first floor rooms');
    }
    rooms.push(...firstFloorRooms);
    // 2nd floor (107-113)
    for (let i = 7; i <= 13; i++) {
      const roomNumber = `1${i}`;
      const isSmall = i === 7; // 107 is small
      rooms.push([
        roomNumber,
        2,
        i % 2 === 0 ? roomTypeIds.Deluxe : roomTypeIds.Standard,
        'Available',
        propertyId,
        isSmall ? JSON.stringify({ size: 'small' }) : null,
      ]);
    }
    // 3rd floor (114-120)
    for (let i = 14; i <= 20; i++) {
      const roomNumber = `1${i}`;
      const isSmall = i === 14; // 114 is small
      rooms.push([
        roomNumber,
        3,
        i % 2 === 0 ? roomTypeIds.Deluxe : roomTypeIds.Standard,
        'Available',
        propertyId,
        isSmall ? JSON.stringify({ size: 'small' }) : null,
      ]);
    }
    await client.query(
      `INSERT INTO rooms (room_number, floor, room_type_id, status, property_id, features) VALUES ${rooms.map((_, i) => `($${i * 6 + 1}, $${i * 6 + 2}, $${i * 6 + 3}, $${i * 6 + 4}, $${i * 6 + 5}, $${i * 6 + 6})`).join(', ')}`,
      rooms.flat()
    );
    console.log('Seeded 20 rooms (101-106, 107-113, 114-120, 1 small per floor, 102 occupied)');

    // Seed users (1 Manager, 1 Receptionist)
    const users = [
      {
        username: 'manager',
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
    ];
    const userRes = await client.query(
      `INSERT INTO users (username, email, password, role, property_id) VALUES ${users.map((_, i) => `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`).join(', ')} RETURNING id`,
      users.flatMap((u) => [u.username, u.email, u.password, u.role, u.propertyId])
    );
    const userIds = userRes.rows.map((row: any) => row.id);
    console.log('Seeded 2 users');

    // Seed a guest
    const guestRes = await client.query(
      `INSERT INTO guests (name, email, phone, gdpr_consent, loyalty_points, loyalty_tier, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      ['John Doe', 'john.doe@example.com', '123-456-7890', true, 100, 'Bronze', propertyId]
    );
    const guestId = guestRes.rows[0].id;
    console.log('Seeded 1 guest');

    // Seed bookings
    const room101 = (await client.query(`SELECT id FROM rooms WHERE room_number = '101'`)).rows[0].id;
    const room102 = (await client.query(`SELECT id FROM rooms WHERE room_number = '102'`)).rows[0].id;
    const room103 = (await client.query(`SELECT id FROM rooms WHERE room_number = '103'`)).rows[0].id;
    const room104 = (await client.query(`SELECT id FROM rooms WHERE room_number = '104'`)).rows[0].id;
    await client.query(
      `INSERT INTO bookings (guest_id, room_id, check_in, check_out, status, source, rate_applied, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [guestId, room101, '2025-07-10', '2025-07-12', 'Completed', 'Booking.com', 150.00, propertyId] // Past booking
    );
    const bookingToday1 = await client.query(
      `INSERT INTO bookings (guest_id, room_id, check_in, check_out, status, source, rate_applied, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [guestId, room102, '2025-07-17', '2025-07-19', 'Active', 'Booking.com', 150.00, propertyId] // User 1 checked in
    );
    const bookingToday2 = await client.query(
      `INSERT INTO bookings (guest_id, room_id, check_in, check_out, status, source, rate_applied, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [guestId, room103, '2025-07-17', '2025-07-19', 'Active', 'Booking.com', 150.00, propertyId] // User 2 at airport
    );
    const bookingFuture = await client.query(
      `INSERT INTO bookings (guest_id, room_id, check_in, check_out, status, source, rate_applied, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [guestId, room104, '2025-07-18', '2025-07-20', 'Active', 'Booking.com', 150.00, propertyId] // Future check-in
    );
    console.log('Seeded 4 bookings');

    // Insert OTA reservation
    await client.query(
      `INSERT INTO ota_reservations (booking_id, ota_id, ota_name, property_id) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id`,
      [bookingToday1.rows[0].id, 'OTA123', 'Booking.com', propertyId]
    );
    console.log('Seeded 1 OTA reservation');

    // Seed an audit log
    await client.query(
      `INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      ['CreateBooking', userIds[0], 'Booking', bookingToday1.rows[0].id, { guestId, roomNumber: '102' }, propertyId]
    );
    console.log('Seeded 1 audit log');

    // Seed a notification
    await client.query(
      `INSERT INTO notifications (type, recipient, message, status, related_entity_id, entity_type, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      ['Email', 'john.doe@example.com', 'Your booking for July 17-19 is confirmed!', 'Pending', bookingToday1.rows[0].id, 'Booking', propertyId]
    );
    console.log('Seeded 1 notification');

    // Insert invoices
    await client.query(
      `INSERT INTO invoices (booking_id, amount, tax, receipt, status, payment_method, property_id) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [bookingToday1.rows[0].id, 220.00, 20.00, 'Invoice for booking 2: 2 nights at $100.00/night, Tax: $20.00, Total: $220.00', 'Paid', 'Credit Card', propertyId]
    );

    // Insert refresh tokens (7-day expiry)
    await client.query(
      `INSERT INTO refresh_tokens (user_id, token, expires_at, property_id) VALUES ($1, $2, $3, $4), ($5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [
        userIds[0], 'sample-refresh-token-manager1', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), propertyId,
        userIds[1], 'sample-refresh-token-receptionist1', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), propertyId,
      ]
    );

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