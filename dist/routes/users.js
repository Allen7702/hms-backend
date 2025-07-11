"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../services/db");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Login
router.post('/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { username, password } = req.body;
    if (!username || !password) {
        res.status(400).json({ error: 'Username and password are required' });
        return;
    }
    try {
        const result = yield (0, db_1.query)('SELECT * FROM users WHERE username = $1', [username]);
        if (result.rows.length === 0) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const user = result.rows[0];
        const isValidPassword = yield bcryptjs_1.default.compare(password, user.password);
        if (!isValidPassword) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }
        const accessToken = jsonwebtoken_1.default.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'your_jwt_secret_here', { expiresIn: '15m' });
        const refreshToken = jsonwebtoken_1.default.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_here', { expiresIn: '7d' });
        yield (0, db_1.query)('INSERT INTO refresh_tokens (user_id, token, expires_at, property_id) VALUES ($1, $2, $3, $4)', [user.id, refreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), user.property_id]);
        res.status(200).json({
            access_token: accessToken,
            refresh_token: refreshToken,
            user: { id: user.id, username: user.username, role: user.role, property_id: user.property_id },
        });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Refresh Token
router.post('/refresh-token', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { refresh_token } = req.body;
    if (!refresh_token) {
        res.status(400).json({ error: 'Refresh token is required' });
        return;
    }
    try {
        const tokenCheck = yield (0, db_1.query)('SELECT * FROM refresh_tokens WHERE token = $1 AND expires_at > NOW()', [refresh_token]);
        if (tokenCheck.rows.length === 0) {
            res.status(401).json({ error: 'Invalid or expired refresh token' });
            return;
        }
        const decoded = jsonwebtoken_1.default.verify(refresh_token, process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_here');
        const userResult = yield (0, db_1.query)('SELECT * FROM users WHERE id = $1', [decoded.id]);
        if (userResult.rows.length === 0) {
            res.status(401).json({ error: 'User not found' });
            return;
        }
        const user = userResult.rows[0];
        const newAccessToken = jsonwebtoken_1.default.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'your_jwt_secret_here', { expiresIn: '15m' });
        const newRefreshToken = jsonwebtoken_1.default.sign({ id: user.id }, process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_here', { expiresIn: '7d' });
        yield (0, db_1.query)('BEGIN');
        yield (0, db_1.query)('DELETE FROM refresh_tokens WHERE token = $1', [refresh_token]);
        yield (0, db_1.query)('INSERT INTO refresh_tokens (user_id, token, expires_at, property_id) VALUES ($1, $2, $3, $4)', [user.id, newRefreshToken, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), user.property_id]);
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['RefreshToken', user.id, 'User', user.id, { action: 'Token refreshed' }, user.property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(200).json({
            access_token: newAccessToken,
            refresh_token: newRefreshToken,
            user: { id: user.id, username: user.username, role: user.role, property_id: user.property_id },
        });
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(401).json({ error: 'Invalid refresh token' });
    }
}));
// Get all users
router.get('/', auth_1.authenticate, (0, auth_1.restrictTo)('Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield (0, db_1.query)('SELECT id, username, email, role, property_id FROM users');
        res.status(200).json(result.rows);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
}));
// Create a new user
router.post('/', auth_1.authenticate, (0, auth_1.restrictTo)('Manager'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { username, email, password, role, property_id } = req.body;
    if (!username || !email || !password || !role || !property_id) {
        res.status(400).json({ error: 'Missing required fields' });
        return;
    }
    // if (!req.user?.id) {
    //   res.status(401).json({ error: 'User not authenticated' });
    //   return;
    // }
    try {
        const hashedPassword = yield bcryptjs_1.default.hash(password, 10);
        yield (0, db_1.query)('BEGIN');
        const result = yield (0, db_1.query)('INSERT INTO users (username, email, password, role, property_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, role, property_id', [username, email, hashedPassword, role, property_id]);
        yield (0, db_1.query)('INSERT INTO audit_logs (action, user_id, entity_type, entity_id, details, property_id) VALUES ($1, $2, $3, $4, $5, $6)', ['CreateUser', (_a = req === null || req === void 0 ? void 0 : req.user) === null || _a === void 0 ? void 0 : _a.id, 'User', result.rows[0].id, { username, email, role }, property_id]);
        yield (0, db_1.query)('COMMIT');
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        yield (0, db_1.query)('ROLLBACK');
        res.status(500).json({ error: err.message });
    }
}));
exports.default = router;
