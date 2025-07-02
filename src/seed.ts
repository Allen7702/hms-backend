import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Room, User, Property, Guest, Booking, OTAReservation, AuditLog, Notification } from './models/index';

async function seedDatabase(): Promise<void> {
  try {
    await mongoose.connect(process.env.MONGODB_URI as string, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    } as mongoose.ConnectOptions);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Room.deleteMany({});
    await User.deleteMany({});
    await Property.deleteMany({});
    await Guest.deleteMany({});
    await Booking.deleteMany({});
    await OTAReservation.deleteMany({});
    await AuditLog.deleteMany({});
    await Notification.deleteMany({});


    // Create a property
    const property = await Property.create({
      name: 'Hotel Sunshine',
      address: '123 Main St, City, Country',
    });

    // Seed rooms (30 rooms: 6 per floor, Standard/Deluxe)
    const rooms = [];
    for (let floor = 1; floor <= 3; floor++) {
      for (let i = 1; i <= 6; i++) {
        const roomNumber = `${floor}${i.toString().padStart(2, '0')}`;
        rooms.push({
          roomNumber,
          floor,
          type: i % 2 === 0 ? 'Deluxe' : 'Standard',
          rate: i % 2 === 0 ? 150 : 100,
          status: 'Available',
          propertyId: property._id,
        });
      }
    }
    const seededRooms = await Room.insertMany(rooms);
    console.log('Seeded 30 rooms');

    // Seed users (1 Manager, 2 Receptionists)
    const users = [
      {
        username: 'manager1',
        password: await bcrypt.hash('password123', 10),
        role: 'Manager',
        propertyId: property._id,
      },
      {
        username: 'receptionist',
        password: await bcrypt.hash('password123', 10),
        role: 'Receptionist',
        propertyId: property._id,
      }
    ];
    const seededUsers = await User.insertMany(users);
    console.log('Seeded 2 users');

    // Seed a guest
    const guest = await Guest.create({
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '123-456-7890',
      gdprConsent: true,
      propertyId: property._id,
    });
    console.log('Seeded 1 guest');

    // Seed a booking
    const booking = await Booking.create({
      guest: guest._id,
      room: seededRooms[0]._id,
      checkIn: new Date('2025-07-10'),
      checkOut: new Date('2025-07-12'),
      status: 'Active',
      source: 'Booking.com',
      rateApplied: 150,
      propertyId: property._id,
    });
    console.log('Seeded 1 booking');

    // Seed an OTA reservation
    await OTAReservation.create({
      booking: booking._id,
      otaId: 'BC123456789',
      source: 'Booking.com',
      externalData: { guestNotes: 'Late check-in requested' },
      cancellationPolicy: 'Non-refunded',
      syncedAt: new Date(),
      propertyId: property._id,
    });
    console.log('Seeded 1 OTA reservation');

    // Seed an audit log
    await AuditLog.create({
      action: 'CreateBooking',
      user: seededUsers[0]._id,
      entityType: 'Booking',
      entityId: booking._id,
      details: { guestId: guest._id, roomNumber: seededRooms[0].roomNumber },
      timestamp: new Date(),
      propertyId: property._id,
    });
    console.log('Seeded 1 audit log');

    // Seed a notification
    await Notification.create({
      type: 'Email',
      recipient: guest.email,
      message: 'Your booking for July 10-12 is confirmed!',
      status: 'Pending',
      relatedEntity: booking._id,
      entityType: 'Booking',
      propertyId: property._id,
    });
    console.log('Seeded 1 notification');

    console.log('Database seeding completed');
    process.exit(0);
  } catch (error) {
    console.error('Seeding error:', error);
    process.exit(1);
  }
}

seedDatabase();