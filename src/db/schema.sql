-- DROP DATABASE IF EXISTS hms;
-- CREATE DATABASE hms;
-- Do not drop the database while connected; assume hms exists
\connect hms

-- Drop tables in reverse dependency order with CASCADE to handle foreign keys
DROP TABLE IF EXISTS ota_reservations CASCADE;
DROP TABLE IF EXISTS housekeepings CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS maintenances CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS guests CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS room_types CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS properties CASCADE;

-- Create tables with IF NOT EXISTS
CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('Receptionist', 'Manager', 'Housekeeping')),
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  base_rate DECIMAL(10, 2) NOT NULL,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_room_types_property_id ON room_types (property_id);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  room_number VARCHAR(50) NOT NULL,
  floor INTEGER NOT NULL,
  room_type_id INTEGER REFERENCES room_types(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('Available', 'Occupied', 'Maintenance', 'Dirty')),
  features JSONB,
  property_id INTEGER REFERENCES properties(id),
  last_cleaned TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (room_number, property_id)
);

CREATE INDEX IF NOT EXISTS idx_rooms_property_id ON rooms (property_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON rooms (room_type_id);

CREATE TABLE IF NOT EXISTS guests (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  preferences JSONB,
  loyalty_points INTEGER DEFAULT 0,
  loyalty_tier VARCHAR(50) DEFAULT 'None' CHECK (loyalty_tier IN ('None', 'Bronze', 'Silver', 'Gold')),
  gdpr_consent BOOLEAN DEFAULT FALSE,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_guests_property_id ON guests (property_id);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  guest_id INTEGER REFERENCES guests(id),
  room_id INTEGER REFERENCES rooms(id),
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('Active', 'Completed', 'Cancelled')),
  source VARCHAR(50),
  rate_applied DECIMAL(10, 2) NOT NULL,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bookings_property_id ON bookings (property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_guest_id ON bookings (guest_id);

CREATE TABLE IF NOT EXISTS maintenances (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id),
  description TEXT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('Open', 'In Progress', 'Resolved')),
  priority VARCHAR(50) NOT NULL CHECK (priority IN ('Low', 'Medium', 'High')),
  assignee_id INTEGER REFERENCES users(id),
  property_id INTEGER REFERENCES properties(id),
  history JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_maintenances_property_id ON maintenances (property_id);

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id),
  amount DECIMAL(10, 2) NOT NULL,
  tax DECIMAL(10, 2) NOT NULL,
  receipt TEXT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('Not Paid','Pending', 'Paid')),
  payment_method VARCHAR(50) NOT NULL,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoices_booking_id ON invoices (booking_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  action VARCHAR(100) NOT NULL,
  user_id INTEGER REFERENCES users(id),
  entity_type VARCHAR(50) NOT NULL,
  entity_id INTEGER,
  details JSONB,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_property_id ON audit_logs (property_id);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  type VARCHAR(50) NOT NULL CHECK (type IN ('Email', 'SMS', 'Push')),
  recipient VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'Sent', 'Failed')),
  related_entity_id INTEGER,
  entity_type VARCHAR(50),
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_property_id ON notifications (property_id);

CREATE TABLE IF NOT EXISTS housekeepings (
  id SERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id),
  status VARCHAR(50) NOT NULL CHECK (status IN ('Pending', 'In Progress', 'Completed')),
  assignee_id INTEGER REFERENCES users(id),
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_housekeepings_property_id ON housekeepings (property_id);

CREATE TABLE IF NOT EXISTS ota_reservations (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER REFERENCES bookings(id),
  ota_id VARCHAR(100) NOT NULL,
  ota_name VARCHAR(50) NOT NULL,
  property_id INTEGER REFERENCES properties(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ota_reservations_booking_id ON ota_reservations (booking_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updating updated_at
CREATE TRIGGER update_properties_updated_at
  BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_room_types_updated_at
  BEFORE UPDATE ON room_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_guests_updated_at
  BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_maintenances_updated_at
  BEFORE UPDATE ON maintenances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_audit_logs_updated_at
  BEFORE UPDATE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_refresh_tokens_updated_at
  BEFORE UPDATE ON refresh_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_housekeepings_updated_at
  BEFORE UPDATE ON housekeepings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ota_reservations_updated_at
  BEFORE UPDATE ON ota_reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();