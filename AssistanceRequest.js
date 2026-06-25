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
        type: String,  // ✅ FIX: Changed from 'number' to 'String'
        required: true,
        trim: true,
        match: /^[0-9]{10}$/  // Add phone validation regex for exactly 10 digits
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
        }
    },
    vehicle: { 
        type: String, 
        required: true,
        enum: ['Bike', 'Car', 'Load Van']  // Restrict to valid options
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
        default: 'pending'  // Add status tracking
    },
    createdAt: { 
        type: Date, 
        default: Date.now,
        index: true  // Add index for queries
    }
});

// Add indexes for better query performance
assistanceRequestSchema.index({ createdAt: -1 });
assistanceRequestSchema.index({ status: 1 });
assistanceRequestSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });

module.exports = mongoose.model('AssistanceRequest', assistanceRequestSchema);
