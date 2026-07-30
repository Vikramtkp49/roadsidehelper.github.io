const mongoose = require('mongoose');

const assistanceRequestSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true,
        minlength: 2,
        maxlength: 100
    },
    phone: { 
        type: String,
        required: true,
        trim: true,
        match: /^[0-9]{10}$/
    },
    location: {
        latitude: { 
            type: Number, 
            required: true,
            min: -90,
            max: 90
        },
        longitude: { 
            type: Number, 
            required: true,
            min: -180,
            max: 180
        },
        pincode: {
            type: String,
            default: null   // populated via reverse-geocode after save
        },
        city: {
            type: String,
            default: null   // populated via reverse-geocode after save
        }

    },
    vehicle: { 
        type: String, 
        required: true,
        enum: ['Bike', 'Car', 'Van', 'Truck', 'Bus', 'Tractor']
    },
    needs: { 
        type: String,
        maxlength: 500
    },
    image1: { 
        type: String, 
        required: true
    },
    image2: { 
        type: String, 
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'assigned', 'completed', 'cancelled'],
        default: 'pending'
    },
    // ── AUTO-MATCH FIELDS ──────────────────────────────────────
    assignedMechanic: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mechanic',
        default: null
    },
    matchMethod: {
        // 'pincode_exact' | 'radius_15km' | 'none'
        type: String,
        default: 'none'
    },
    matchedAt: {
        type: Date,
        default: null
    },
    // ──────────────────────────────────────────────────────────
    createdAt: { 
        type: Date, 
        default: Date.now,
        index: true
    }
});

assistanceRequestSchema.index({ createdAt: -1 });
assistanceRequestSchema.index({ status: 1 });
assistanceRequestSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
assistanceRequestSchema.index({ assignedMechanic: 1 });

module.exports = mongoose.model('AssistanceRequest', assistanceRequestSchema);