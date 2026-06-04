const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const assistanceRoutes = require('./assistanceRoutes');
require('dotenv').config();

const app = express();

// Ensure uploads directory exists to prevent ENOENT error
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// ✅ Database Connection with Error Handling
const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mechanic';
mongoose.connect(mongoURI)
    .then(() => {
        console.log('✅ MongoDB Connected Successfully');
    })
    .catch(error => {
        console.error('❌ MongoDB Connection Failed:', error.message);
        console.error('Make sure MongoDB is running and MONGO_URI is correct');
        // Retry after 5 seconds
        setTimeout(() => {
            mongoose.connect(mongoURI);
        }, 5000);
    });

const db = mongoose.connection;

db.on('error', (error) => {
    console.error('❌ MongoDB Error:', error);
});

db.once('open', () => {
    console.log('✅ Database connected and ready');
});

// ─────────────────────────────────────────────
// Models & Imports
// ─────────────────────────────────────────────
const Admin = require('./Admin');
const Mechanic = require('./Mechanic');
const AssistanceRequest = require('./AssistanceRequest');
const adminRoutes = require('./adminRoutes');

// Seed default admin account if none exists
db.once('open', () => {
    Admin.findOne({ email: 'admin@roadside-helper.com' })
        .then(async (admin) => {
            if (!admin) {
                const hashedPassword = await bcrypt.hash('Admin@123', 10);
                const defaultAdmin = new Admin({
                    name: 'System Admin',
                    email: 'admin@roadside-helper.com',
                    password: hashedPassword,
                    role: 'super_admin',
                    permissions: ['view_requests', 'approve_mechanics', 'block_mechanics', 'edit_requests', 'view_analytics', 'manage_admins', 'manage_settings']
                });
                await defaultAdmin.save();
                console.log('✅ Default admin account created: admin@roadside-helper.com / Admin@123');
            }
        })
        .catch(err => console.error('❌ Error seeding default admin:', err));
});

// ─────────────────────────────────────────────
// Routes & Middlewares
// ─────────────────────────────────────────────

// API Routes
app.use('/api', assistanceRoutes);
app.use('/api', adminRoutes);

// Auth Route
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }

        const admin = await Admin.findOne({ email: email.toLowerCase() });
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: admin._id, email: admin.email, name: admin.name, role: admin.role },
            process.env.JWT_SECRET || 'fallback-secret-key-do-not-use-in-prod',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            token,
            admin: { id: admin._id, name: admin.name, email: admin.email }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Serve Admin Dashboard and Frontend Web App static pages
app.use('/admin', express.static('admin'));
app.use(express.static('./'));

// ✅ Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// ✅ Global error handling middleware
app.use((err, req, res, next) => {
    console.error('❌ Error:', err);
    res.status(err.status || 500).json({ 
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// ✅ 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        success: false,
        message: 'Route not found' 
    });
});

const PORT = process.env.PORT || 5000;

// ✅ Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down server...');
    await mongoose.connection.close();
    server.close(() => {
        console.log('✅ Server closed gracefully');
        process.exit(0);
    });
});

const server = app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
});
