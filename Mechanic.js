const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const mechanicSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    mobile: { 
        type: String,
        required: true,
        match: /^[0-9]{10,15}$/,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    address: { 
        type: String, 
        required: true,
        trim: true
    },
    location: {
        latitude: { 
            type: Number,
            min: -90,
            max: 90
        },
        longitude: { 
            type: Number,
            min: -180,
            max: 180
        }
    },
    vehicle_type: { 
        type: String, 
        required: true,
        enum: ['Bike', 'Car', 'Both', 'Load Van'] // Updated enum to match current choices
    },
    specialization: { 
        type: String, 
        required: true
    },
    shop_image: { 
        type: String, 
        required: true
    },
    // New security fields
    isVerified: {
        type: Boolean,
        default: false
    },
    verificationToken: {
        type: String,
        select: false
    },
    isBlocked: {
        type: Boolean,
        default: false
    },
    blockedReason: String,
    // Ratings and reviews
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    reviewCount: {
        type: Number,
        default: 0
    },
    totalJobs: {
        type: Number,
        default: 0
    },
    experience: {
        type: Number,
        default: 1,
        min: 0
    },
    // Insurance and certification
    insuranceCertificate: String,
    certifications: [String],
    licenseNumber: {
        type: String,
        unique: true,
        sparse: true, // Allow multiple nulls if not provided during MVP
        select: false // Only for admins
    },
    aadharLastDigits: {
        type: String,
        select: false // Only for admins
    },
    backgroundCheckStatus: {
        type: String,
        enum: ['pending', 'verified', 'rejected'],
        default: 'pending'
    },
    backgroundCheckDate: Date,
    documents: [{
        type: String,
        name: String,
        uploadedAt: Date
    }],
    createdAt: { 
        type: Date, 
        default: Date.now,
        index: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    },
    lastLoginAt: Date
});

// Compound indexes for performance
mechanicSchema.index({ email: 1, isBlocked: 1 });
mechanicSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
mechanicSchema.index({ vehicle_type: 1, specialization: 1 });
mechanicSchema.index({ createdAt: -1 });

// Hash password before saving
mechanicSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
mechanicSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive fields from JSON
mechanicSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.verificationToken;
    delete obj.licenseNumber;
    delete obj.aadharLastDigits;
    return obj;
};

module.exports = mongoose.model('Mechanic', mechanicSchema);
