const express = require('express');
const multer = require('multer');
const AssistanceRequest = require('./AssistanceRequest');

const router = express.Router();

// Multer Setup for File Uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// POST - Save assistance request
router.post('/request-assistance', upload.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }]), async (req, res) => {
    try {
        const { name, phone, latitude, longitude, vehicle, needs } = req.body;
        const image1 = req.files && req.files.image1 ? req.files.image1[0].filename : null;
        const image2 = req.files && req.files.image2 ? req.files.image2[0].filename : null;

        if (!name || !phone || !latitude || !longitude || !vehicle || !image1 || !image2) {
            return res.status(400).json({ message: "All required fields must be provided, including 2 vehicle images" });
        }

        const newRequest = new AssistanceRequest({
            name,
            phone,
            location: { latitude, longitude },
            vehicle,
            needs,
            image1,
            image2
        });

        await newRequest.save();
        res.status(201).json({ message: "Request saved successfully", request: newRequest });

    } catch (error) {
        res.status(500).json({ message: "Server error", error });
    }
});

// POST - Register mechanic from public portal
const Mechanic = require('./Mechanic');
router.post('/register-mechanic', upload.array('shop_image', 3), async (req, res) => {
    try {
        const { name, mobile, address, pincode, vehicle_type, specialization } = req.body;
        const shop_images = req.files ? req.files.map(f => f.filename) : [];

        if (!name || !mobile || !address || !pincode || !vehicle_type || !specialization || shop_images.length !== 3) {
            return res.status(400).json({ success: false, message: "All required fields must be provided, including exactly 3 shop images and a pincode." });
        }

        // Check if mechanic already exists by mobile
        const existing = await Mechanic.findOne({ mobile });
        if (existing) {
            return res.status(400).json({ success: false, message: "A mechanic with this mobile number already exists" });
        }

        // Generate fallback unique email and default password since the public UI doesn't ask for them
        const email = `mechanic-${mobile}@roadside.com`.toLowerCase();
        const tempPassword = `Pass@${mobile}`; // Default password

        const newMechanic = new Mechanic({
            name,
            email,
            mobile,
            password: tempPassword,
            address,
            pincode,
            vehicle_type,
            specialization,
            shop_image: shop_images,
            experience: 1, // Default 1 year
            status: 'pending', // Default to pending admin approval
            rating: 5.0, // Default starting rating
            totalJobs: 0
        });

        await newMechanic.save();
        res.status(201).json({ success: true, message: "Registration submitted successfully", mechanic: newMechanic });

    } catch (error) {
        console.error("Mechanic registration error:", error);
        res.status(500).json({ success: false, message: "Server error during registration", error: error.message });
    }
});

module.exports = router;
