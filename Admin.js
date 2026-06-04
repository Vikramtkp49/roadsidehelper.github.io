const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const adminSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['super_admin', 'admin', 'moderator', 'support'],
        default: 'admin'
    },
    permissions: [{
        type: String,
        enum: [
            'view_requests',
            'approve_mechanics',
            'block_mechanics',
            'edit_requests',
            'view_analytics',
            'manage_admins',
            'manage_settings'
        ]
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: Date,
    loginAttempts: {
        type: Number,
        default: 0
    },
    lockedUntil: Date,
    activityLog: [{
        action: String,
        timestamp: { type: Date, default: Date.now },
        ipAddress: String,
        details: String
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

adminSchema.methods.comparePassword = function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('Admin', adminSchema);
