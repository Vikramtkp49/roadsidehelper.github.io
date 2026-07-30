const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const mechanicSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 15
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
        match: /^[0-9]{10}$/,
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
        trim: true,
        maxlength: 30
    },
    pincode: {
        type: String,
        required: true,
        match: /^[0-9]{6}$/
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

    // ── vehicle_type: stored as Array ['Bike','Van'] OR legacy string 'Bike'/'Both' ──
    vehicle_type: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },

    // ── specialization: stored as Array ['General Service','Towing'] OR legacy string ──
    specialization: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },

    shop_image: { 
        type: [String], 
        required: true
    },
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
    rating: {
        type: Number,
        default: 5.0,
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
    insuranceCertificate: String,
    certifications: [String],
    licenseNumber: {
        type: String,
        unique: true,
        sparse: true,
        select: false
    },
    aadharLastDigits: {
        type: String,
        select: false
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

// ── Indexes (NO compound index on vehicle_type + specialization —
//    both can be arrays and MongoDB forbids indexing two parallel arrays) ──
mechanicSchema.index({ email: 1, isBlocked: 1 });
mechanicSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
mechanicSchema.index({ createdAt: -1 });
// Index each array field separately (single-field array indexes are fine)
mechanicSchema.index({ vehicle_type: 1 });
mechanicSchema.index({ specialization: 1 });

// ── Static helper: normalise Mixed field to a clean string array ──
function toArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
    if (val === 'Both') return ['Bike', 'Car'];
    if (val === 'Load Van') return ['Van'];
    return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

mechanicSchema.statics.toArray = toArray;

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

mechanicSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

mechanicSchema.methods.toJSON = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.verificationToken;
    delete obj.licenseNumber;
    delete obj.aadharLastDigits;
    return obj;
};

module.exports = mongoose.model('Mechanic', mechanicSchema);