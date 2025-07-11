"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const users_1 = __importDefault(require("./routes/users"));
const rooms_1 = __importDefault(require("./routes/rooms"));
const bookings_1 = __importDefault(require("./routes/bookings"));
const maintenance_1 = __importDefault(require("./routes/maintenance"));
const guests_1 = __importDefault(require("./routes/guests"));
const db_1 = require("./services/db");
dotenv_1.default.config();
exports.app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
exports.app.use((0, cors_1.default)());
exports.app.use(express_1.default.json());
// Verify database connection
db_1.pool.connect((err, client, release) => {
    if (err) {
        console.error('PostgreSQL connection error:', err.stack);
        process.exit(1);
    }
    console.log('Connected to PostgreSQL (database: hms)');
    client === null || client === void 0 ? void 0 : client.query('SELECT current_database()', (err, result) => {
        release();
        if (err) {
            console.error('Error verifying database:', err.stack);
        }
        else {
            console.log('Database:', result.rows[0].current_database);
        }
    });
});
// Routes
exports.app.use('/api/users', users_1.default);
exports.app.use('/api/rooms', rooms_1.default);
exports.app.use('/api/bookings', bookings_1.default);
exports.app.use('/api/guests', guests_1.default);
exports.app.use('/api/maintenance', maintenance_1.default);
exports.app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'HMS Backend is running' });
});
exports.app.use((err, req, res, next) => {
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    res.status(status).json({ error: message });
});
// Start Server
exports.app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
