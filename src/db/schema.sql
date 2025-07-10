-- Creating relational tables for HMS
-- CREATE DATABASE hms;
-- Connect to the hms database (already created by Docker)
\c hms

-- Drop tables if they exist to avoid conflicts (in reverse dependency order)
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS ota_reservations CASCADE;
DROP TABLE IF EXISTS housekeepings CASCADE;
DROP TABLE IF EXISTS maintenances CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS guests CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS room_types CASCADE;
DROP TABLE IF EXISTS properties CASCADE;

-- Properties table
CREATE TABLE properties (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Room Types table
CREATE TABLE room_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL CHECK (name IN ('Standard', 'Deluxe')),
  base_rate DECIMAL(10,2) NOT NULL
);

-- Rooms table
CREATE TABLE rooms (
  id SERIAL PRIMARY KEY,
  room_number VARCHAR(10) NOT NULL UNIQUE,
  floor INTEGER NOT NULL,
  room_type_id INTEGER REFERENCES room_types(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('Available', 'Occupied', 'Dirty', 'Maintenance')),
  features JSONB,
  property_id INTEGER REFERENCES properties(id),
  last_cleaned TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_room_number ON rooms (room_number);
CREATE INDEX idx_status_floor ON rooms (status, floor);

-- Guests table
CREATE TABLE guests (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(20),
  address TEXT,
  preferences JSONB,
  loyalty_points INTEGER DEFAULT 0,
  loyalty_tier VARCHAR(50) NOT NULL CHECK (loyalty_tier IN ('None', 'Bronze', 'Silver', 'Gold')),
  gdpr_consent BOOLEAN DEFAULT FALSE,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_email ON guests (email);
CREATE INDEX idx_loyalty_tier ON guests (loyalty_tier);

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('Receptionist', 'Manager')),
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_username ON users (username);
CREATE INDEX idx_email_users ON users (email);

-- Bookings table
CREATE TABLE bookings (
  id SERIAL PRIMARY KEY,
  guest_id INTEGER REFERENCES guests(id),
  room_id INTEGER REFERENCES rooms(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('Active', 'Completed', 'Cancelled')),
  source VARCHAR(50) NOT NULL CHECK (source IN ('Direct', 'Booking.com', 'Expedia', 'Airbnb', 'Other')),
  rate_applied DECIMAL(10,2) NOT NULL,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_check_in_check_out_status ON bookings (check_in, check_out, status);

-- Invoices table
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id),
  guest_id INTEGER REFERENCES guests(id),
  amount DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2),
  receipt TEXT,
  status VARCHAR(50) NOT NULL CHECK (status IN ('Paid', 'Pending', 'Refunded')),
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('Credit Card', 'Cash', 'Online')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_booking_id ON invoices (booking_id);

-- Maintenance table
CREATE TABLE maintenances (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id),
  description TEXT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('Open', 'In Progress', 'Resolved')),
  priority VARCHAR(20) CHECK (priority IN ('Low', 'Medium', 'High')),
  assignee_id INTEGER REFERENCES users(id),
  property_id INTEGER REFERENCES properties(id),
  history JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Housekeeping table
CREATE TABLE housekeepings (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id),
  assigned_to VARCHAR(50),
  status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTA Reservations table
CREATE TABLE ota_reservations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id),
  ota_id VARCHAR(50) NOT NULL UNIQUE,
  source VARCHAR(50) NOT NULL CHECK (source IN ('Direct', 'Booking.com', 'Expedia', 'Airbnb', 'Other')),
  guest_notes TEXT,
  cancellation_policy TEXT,
  synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_ota_id_source ON ota_reservations (ota_id, source);

-- Audit Logs table
CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(50) NOT NULL CHECK (action IN ('Login', 'Logout', 'CreateBooking', 'UpdateBooking', 'CancelBooking', 'UpdateRoomStatus', 'CreateInvoice', 'UpdateRate', 'SendNotification')),
  user_id INTEGER REFERENCES users(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  details JSONB,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  property_id INTEGER REFERENCES properties(id)
);
CREATE INDEX idx_timestamp_action ON audit_logs (timestamp, action);

-- Notifications table
CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL CHECK (type IN ('Email', 'SMS', 'Push', 'InApp')),
  recipient VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'Sent', 'Failed')),
  related_entity_id INTEGER,
  entity_type VARCHAR(50),
  property_id INTEGER REFERENCES properties(id),
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_status_type ON notifications (status, type);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updating timestamps
CREATE TRIGGER update_rooms_timestamp BEFORE UPDATE ON rooms FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_guests_timestamp BEFORE UPDATE ON guests FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_bookings_timestamp BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_invoices_timestamp BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_maintenances_timestamp BEFORE UPDATE ON maintenances FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_housekeepings_timestamp BEFORE UPDATE ON housekeepings FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_ota_reservations_timestamp BEFORE UPDATE ON ota_reservations FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_audit_logs_timestamp BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION update_timestamp();
CREATE TRIGGER update_notifications_timestamp BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_timestamp();