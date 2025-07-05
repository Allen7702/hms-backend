HMS Schema Diagram (Relationships)

Property
 └─ owns ─▶ Room
 └─ owns ─▶ Guest
 └─ owns ─▶ Booking
 └─ owns ─▶ Invoice
 └─ owns ─▶ User
 └─ owns ─▶ Maintenance
 └─ owns ─▶ Housekeeping
 └─ owns ─▶ Rate
 └─ owns ─▶ OTAReservation
 └─ owns ─▶ AuditLog
 └─ owns ─▶ Notification
     └─ Note: `propertyId` links all entities to a specific hotel (e.g., Hotel Sunshine) for multi-property scalability. Currently set to a single Property ID or null.

User
 └─ creates ─▶ Booking
 └─ performs ─▶ AuditLog
 └─ receives ◄─ Notification (optional, via recipient as user ID)
     └─ Note: Users (e.g., Manager, Receptionist) create bookings and trigger audit logs. Notifications may target staff.

Guest
 └─ makes ─▶ Booking
 └─ has ─▶ stayHistory ◄─ Booking
 └─ receives ◄─ Notification (via recipient as email/phone)
     └─ Note: Guests have `loyaltyTier` (None, Bronze, Silver, Gold) and `loyaltyPoints` for future loyalty program. `stayHistory` tracks past bookings.

Booking
 ├─ belongs to ─▶ Guest
 ├─ assigned to ─▶ Room
 ├─ has ─▶ Invoice
 ├─ linked to ─▶ OTAReservation
 ├─ triggers ◄─ AuditLog (e.g., CreateBooking, UpdateBooking)
 └─ triggers ◄─ Notification (e.g., confirmation email)
     └─ Note: Bookings link to OTAs via `OTAReservation` and track source (e.g., Booking.com). `propertyId` ensures property-specific bookings.

Room
 ├─ assigned to ◄─ Booking
 ├─ requires ─▶ Maintenance
 ├─ requires ─▶ Housekeeping
 └─ applies ◄─ Rate
     └─ Note: Rooms have `status` (Available, Occupied, Dirty, Maintenance) and link to maintenance/housekeeping tasks. `propertyId` ties to a specific hotel.

Invoice
 └─ belongs to ─▶ Booking
     └─ Note: Invoices are tied to bookings for billing. `propertyId` ensures property-specific financial records.

Maintenance
 └─ applies to ─▶ Room
 └─ triggers ◄─ Notification (e.g., staff alert)
     └─ Note: Maintenance tasks track room issues. `propertyId` segregates tasks by hotel.

Housekeeping
 └─ applies to ─▶ Room
 └─ triggers ◄─ Notification (e.g., cleaning assignment)
     └─ Note: Housekeeping tasks manage room cleaning. `propertyId` segregates tasks by hotel.

Rate
 └─ applies to ─▶ Room (via roomType)
     └─ Note: Rates define pricing (base, seasonal, promotional) for room types. `propertyId` allows property-specific pricing.

OTAReservation
 └─ links to ─▶ Booking
     └─ Note: Stores OTA-specific data (e.g., Booking.com ID). `propertyId` ensures property-specific OTA sync.

AuditLog
 ├─ performed by ─▶ User (optional)
 ├─ affects ─▶ Booking (optional, via entityId)
 ├─ affects ─▶ Room (optional, via entityId)
 └─ affects ─▶ Other entities (via entityType/entityId)
     └─ Note: Tracks actions (e.g., Login, CreateBooking) for security. `propertyId` segregates logs by hotel.

Notification
 ├─ sent to ─▶ Guest (via recipient as email/phone)
 ├─ sent to ─▶ User (via recipient as user ID)
 ├─ related to ─▶ Booking (optional, via relatedEntity)
 ├─ related to ─▶ Maintenance (optional, via relatedEntity)
 └─ related to ─▶ Housekeeping (optional, via relatedEntity)
     └─ Note: Manages alerts (Email, SMS, Push, InApp). `propertyId` ensures property-specific notifications.


PostgreSQL Relational Setup for HMS

Database: hms (Neon free tier, 3 GB)
 └─ Tables:
     ├─ properties (1 row: Hotel Sunshine)
     ├─ room_types (2 rows: Standard, Deluxe)
     ├─ rooms (30 rows, FK: room_type_id, property_id)
     ├─ guests (FK: property_id, indexed: email, loyalty_tier)
     ├─ users (FK: property_id, indexed: username, email)
     ├─ bookings (FK: guest_id, room_id, property_id)
     ├─ invoices (FK: booking_id)
     ├─ maintenances (FK: room_id, property_id)
     ├─ housekeepings (FK: room_id, property_id)
     ├─ ota_reservations (FK: booking_id, property_id)
     ├─ audit_logs (FK: user_id, property_id)
     └─ notifications (FK: property_id)
 └─ Roles:
     ├─ hms_app_user (read/write)
     └─ hms_readonly_user (read-only)