import { Schema, model, Document, Types } from 'mongoose';

// Enums for type safety
enum RoomStatus {
  Available = 'Available',
  Occupied = 'Occupied',
  Dirty = 'Dirty',
  Maintenance = 'Maintenance',
}

enum BookingStatus {
  Active = 'Active',
  Completed = 'Completed',
  Cancelled = 'Cancelled',
}

enum BookingSource {
  Direct = 'Direct',
  BookingCom = 'Booking.com',
  Expedia = 'Expedia',
  Airbnb = 'Airbnb',
  Other = 'Other',
}

enum InvoiceStatus {
  Paid = 'Paid',
  Pending = 'Pending',
  Refunded = 'Refunded',
}

enum PaymentMethod {
  CreditCard = 'Credit Card',
  Cash = 'Cash',
  Online = 'Online',
}

enum UserRole {
  Receptionist = 'Receptionist',
  Manager = 'Manager',
}

enum MaintenanceStatus {
  Open = 'Open',
  InProgress = 'In Progress',
  Resolved = 'Resolved',
}

enum HousekeepingStatus {
  Pending = 'Pending',
  InProgress = 'In Progress',
  Completed = 'Completed',
}

enum RoomType {
  Standard = 'Standard',
  Deluxe = 'Deluxe',
}

enum RoomRateType {
  Base = 'Base',
  Seasonal = 'Seasonal',
  Promotional = 'Promotional',
}

enum priority {
  Low = 'Low',
  Medium = 'Medium',
  High = 'High',
}

enum LoyaltyTag {
  New = 'new',
  Returning = 'returning',
  VIP = 'vip',
  Problematic = 'problematic',
}

enum LoyaltyTier {
  New = 'New',
  Bronze = 'Bronze',
  Silver = 'Silver',
  Gold = 'Gold',
  Platinum = 'Platinum',
}

enum NotificationType {
  Email = 'Email',
  SMS = 'SMS',
  Push = 'Push',
  InApp = 'InApp',
}

enum NotificationStatus {
  Pending = 'Pending',
  Sent = 'Sent',
  Failed = 'Failed',
}

enum AuditAction {
  Login = 'Login',
  Logout = 'Logout',
  CreateBooking = 'CreateBooking',
  UpdateBooking = 'UpdateBooking',
  CancelBooking = 'CancelBooking',
  UpdateRoomStatus = 'UpdateRoomStatus',
  CreateInvoice = 'CreateInvoice',
  UpdateRate = 'UpdateRate',
  SendNotification = 'SendNotification',
}

interface IRoom extends Document {
  roomNumber: string;
  floor: number;
  type: RoomType;
  rate: number;
  status: RoomStatus;
  propertyId?: Types.ObjectId;
  lastCleaned?: Date;
  maintenanceNotes: Types.ObjectId[];
}

interface IGuest extends Document {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  stayHistory: Types.ObjectId[];
  loyaltyPoints: number;
  loyaltyTier?: string;
  preferences: Map<string, string>;
  gdprConsent: boolean;
}

interface IBooking extends Document {
  guest: Types.ObjectId;
  room: Types.ObjectId;
  checkIn: Date;
  checkOut: Date;
  status: BookingStatus;
  source: BookingSource;
  rateApplied: number;
  propertyId?: Types.ObjectId;
  otaReservation?: Types.ObjectId;
}

interface IInvoice extends Document {
  booking: Types.ObjectId;
  amount: number;
  status: InvoiceStatus;
  paymentMethod: PaymentMethod;
  createdAt: Date;
  propertyId?: Types.ObjectId;
}

interface IUser extends Document {
  username: string;
  password: string;
  role: UserRole;
  email?: string;
  isActive?: boolean;
  propertyId?: Types.ObjectId;
}

interface IMaintenance extends Document {
  room: Types.ObjectId;
  description: string;
  status: MaintenanceStatus;
  priority?: priority;
  assignedTo?: string;
  propertyId?: Types.ObjectId;
}

interface IHousekeeping extends Document {
  room: Types.ObjectId;
  assignedTo?: string;
  status: HousekeepingStatus;
  propertyId?: Types.ObjectId;
}

interface IRate extends Document {
  roomType: RoomType;
  baseRate: number;
  seasonalRate?: number;
  promotionalRate?: number;
  startDate?: Date;
  endDate?: Date;
  propertyId?: Types.ObjectId;
}

interface IProperty extends Document {
  name: string;
  address: string;
}

interface IOTAReservation extends Document {
  booking: Types.ObjectId; // Link to HMS Booking
  otaId: string; // Unique OTA reservation ID (e.g., Booking.com ID)
  source: BookingSource;
  externalData: Record<string, any>; // Flexible OTA-specific data
  cancellationPolicy?: string;
  syncedAt: Date;
  propertyId?: Types.ObjectId;
}

interface IAuditLog extends Document {
  action: AuditAction;
  user?: Types.ObjectId; // User performing the action
  entityType: string; // e.g., 'Booking', 'Room'
  entityId?: Types.ObjectId; // ID of affected entity
  details: Record<string, any>; // Flexible action details
  timestamp: Date;
  propertyId?: Types.ObjectId;
}

interface INotification extends Document {
  type: NotificationType;
  recipient: string; // Email, phone, or user ID
  message: string;
  status: NotificationStatus;
  relatedEntity?: Types.ObjectId; // e.g., Booking or Maintenance
  entityType?: string;
  propertyId?: Types.ObjectId;
  sentAt?: Date;
}

// Schemas
const roomSchema = new Schema<IRoom>({
  roomNumber: { type: String, required: true, unique: true },
  floor: { type: Number, required: true },
  type: { type: String, enum: Object.values(RoomType), required: true },
  rate: { type: Number, required: true },
  status: { type: String, enum: Object.values(RoomStatus), default: RoomStatus.Available },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
  lastCleaned: { type: Date },
  maintenanceNotes: [{ type: Schema.Types.ObjectId, ref: 'Maintenance' }],
}, { timestamps: true });

roomSchema.index({ status: 1, floor: 1, propertyId: 1 });

const guestSchema = new Schema<IGuest>({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, trim: true },
  phone: { type: String, trim: true },
  address: { type: String },
  stayHistory: [{ type: Schema.Types.ObjectId, ref: 'Booking' }],
  loyaltyPoints: { type: Number, default: 0 },
  loyaltyTier: { type: String, enum: Object.values(LoyaltyTag), default: 'new' },
  preferences: { type: Map, of: String },
  gdprConsent: { type: Boolean, default: false },
}, { timestamps: true });

guestSchema.index({ email: 1 });

const bookingSchema = new Schema<IBooking>({
  guest: { type: Schema.Types.ObjectId, ref: 'Guest', required: true },
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  checkIn: { type: Date, required: true },
  checkOut: { type: Date, required: true },
  status: { type: String, enum: Object.values(BookingStatus), default: BookingStatus.Active },
  source: { type: String, enum: Object.values(BookingSource), default: BookingSource.Direct },
  rateApplied: { type: Number, required: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
  otaReservation: { type: Schema.Types.ObjectId, ref: 'OTAReservation' },
}, { timestamps: true });

bookingSchema.index({ checkIn: 1, checkOut: 1, status: 1 });

const invoiceSchema = new Schema<IInvoice>({
  booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: Object.values(InvoiceStatus), default: InvoiceStatus.Pending },
  paymentMethod: { type: String, enum: Object.values(PaymentMethod), default: PaymentMethod.Online },
  createdAt: { type: Date, default: Date.now },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
}, { timestamps: true });

invoiceSchema.index({ booking: 1 });

const userSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: { type: String, unique: true, trim: true },
  isActive: { type: Boolean, default: true },
  role: { type: String, enum: Object.values(UserRole), required: true },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
}, { timestamps: true });

const maintenanceSchema = new Schema<IMaintenance>({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  description: { type: String, required: true },
  status: { type: String, enum: Object.values(MaintenanceStatus), default: MaintenanceStatus.Open },
  priority: { type: String, enum: Object.values(priority), default: priority.Medium },
  assignedTo: { type: String },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
}, { timestamps: true });

const housekeepingSchema = new Schema<IHousekeeping>({
  room: { type: Schema.Types.ObjectId, ref: 'Room', required: true },
  assignedTo: { type: String },
  status: { type: String, enum: Object.values(HousekeepingStatus), default: HousekeepingStatus.Pending },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
}, { timestamps: true });

const rateSchema = new Schema<IRate>({
  roomType: { type: String, enum: Object.values(RoomType), required: true },
  baseRate: { type: Number, required: true },
  seasonalRate: { type: Number },
  promotionalRate: { type: Number },
  startDate: { type: Date },
  endDate: { type: Date },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
}, { timestamps: true });

const propertySchema = new Schema<IProperty>({
  name: { type: String, required: true },
  address: { type: String, required: true },
}, { timestamps: true });

const otaReservationSchema = new Schema<IOTAReservation>({
  booking: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  otaId: { type: String, required: true, unique: true }, // e.g., Booking.com reservation ID
  source: { type: String, enum: Object.values(BookingSource), required: true },
  externalData: { type: Schema.Types.Mixed }, // Flexible for OTA-specific data (e.g., guest notes)
  cancellationPolicy: { type: String }, // e.g., "Non-refunded"
  syncedAt: { type: Date, default: Date.now },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
}, { timestamps: true });

otaReservationSchema.index({ otaId: 1, source: 1 });

const auditLogSchema = new Schema<IAuditLog>({
  action: { type: String, enum: Object.values(AuditAction), required: true },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  entityType: { type: String, required: true }, // e.g., 'Booking', 'Room'
  entityId: { type: Schema.Types.ObjectId },
  details: { type: Schema.Types.Mixed }, // e.g., { oldStatus: 'Available', newStatus: 'Occupied' }
  timestamp: { type: Date, default: Date.now },
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
}, { timestamps: true });

auditLogSchema.index({ timestamp: 1, action: 1, propertyId: 1 });

const notificationSchema = new Schema<INotification>({
  type: { type: String, enum: Object.values(NotificationType), required: true },
  recipient: { type: String, required: true }, // Email, phone, or user ID
  message: { type: String, required: true },
  status: { type: String, enum: Object.values(NotificationStatus), default: NotificationStatus.Pending },
  relatedEntity: { type: Schema.Types.ObjectId }, // e.g., Booking or Maintenance
  entityType: { type: String }, // e.g., 'Booking', 'Maintenance'
  propertyId: { type: Schema.Types.ObjectId, ref: 'Property', default: null },
  sentAt: { type: Date },
}, { timestamps: true });

notificationSchema.index({ status: 1, type: 1, propertyId: 1 });


export const Room = model<IRoom>('Room', roomSchema);
export const Guest = model<IGuest>('Guest', guestSchema);
export const Booking = model<IBooking>('Booking', bookingSchema);
export const Invoice = model<IInvoice>('Invoice', invoiceSchema);
export const User = model<IUser>('User', userSchema);
export const Maintenance = model<IMaintenance>('Maintenance', maintenanceSchema);
export const Housekeeping = model<IHousekeeping>('Housekeeping', housekeepingSchema);
export const Rate = model<IRate>('Rate', rateSchema);
export const Property = model<IProperty>('Property', propertySchema);
export const OTAReservation = model<IOTAReservation>('OTAReservation', otaReservationSchema);
export const AuditLog = model<IAuditLog>('AuditLog', auditLogSchema);
export const Notification = model<INotification>('Notification', notificationSchema);