import mongoose from 'mongoose';
import { Guest, OTAReservation, AuditLog, Notification } from '../models/index';

describe('HMS Schemas', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI as string);
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it('should create a guest with valid loyalty tier', async () => {
    const guest = await Guest.create({
      name: 'Test Guest',
      email: 'test@example.com',
      loyaltyTier: 'Bronze',
      gdprConsent: true,
    });
    expect(guest.loyaltyTier).toBe('Bronze');
  });

  it('should not allow invalid loyalty tier', async () => {
    await expect(Guest.create({
      name: 'Test Guest',
      email: 'test2@example.com',
      loyaltyTier: 'Invalid',
      gdprConsent: true,
    })).rejects.toThrow();
  });

  it('should create an OTA reservation with unique otaId', async () => {
    await OTAReservation.create({
      booking: new mongoose.Types.ObjectId(),
      otaId: 'BC123',
      source: 'Booking.com',
      externalData: { notes: 'Test' },
      syncedAt: new Date(),
    });
    await expect(OTAReservation.create({
      booking: new mongoose.Types.ObjectId(),
      otaId: 'BC123',
      source: 'Booking.com',
      externalData: { notes: 'Test' },
      syncedAt: new Date(),
    })).rejects.toThrow();
  });

  it('should create an audit log with valid action', async () => {
    const log = await AuditLog.create({
      action: 'Login',
      entityType: 'User',
      details: { username: 'manager1' },
      timestamp: new Date(),
    });
    expect(log.action).toBe('Login');
  });

  it('should enforce valid notification type', async () => {
    await expect(Notification.create({
      type: 'Invalid',
      recipient: 'test@example.com',
      message: 'Test notification',
      status: 'Pending',
    })).rejects.toThrow();
  });
});