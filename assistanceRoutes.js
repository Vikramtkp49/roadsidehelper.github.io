const express  = require('express');
const multer   = require('multer');
const AssistanceRequest = require('./AssistanceRequest');
const { matchMechanic, getLocationFromCoords, getCoordsFromPincode } = require('./matchMechanic');
const { notifyCustomerRequestReceived, notifyCustomerMechanicAssigned, notifyMechanicRegistered } = require('./notify');
const { validateAssistanceRequest, validateMechanicRegistration, handleValidationErrors } = require('./middleware/validation');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename:    (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ─────────────────────────────────────────────────────────────
// POST /api/request-assistance
// ─────────────────────────────────────────────────────────────
router.post(
    '/request-assistance',
    upload.fields([{ name: 'image1', maxCount: 1 }, { name: 'image2', maxCount: 1 }]),
    validateAssistanceRequest,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { name, phone, latitude, longitude, vehicle, needs } = req.body;
            const image1 = req.files?.image1?.[0]?.filename || null;
            const image2 = req.files?.image2?.[0]?.filename || null;

            if (!name || !phone || !latitude || !longitude || !vehicle || !image1 || !image2) {
                return res.status(400).json({ message: 'All required fields must be provided, including 2 vehicle images' });
            }

            const lat = parseFloat(latitude);
            const lng = parseFloat(longitude);

            // ── Resolve city + pincode in parallel with matching ──────
            let assignedMechanic = null, matchMethod = 'none', userPincode = null;
            let status = 'pending';
            let userCity = null;
            try {

                const result = await matchMechanic(lat, lng, vehicle);
                assignedMechanic = result.mechanic?._id || null;
                matchMethod      = result.method;
                userPincode      = result.userPincode || null;
                if (assignedMechanic) status = 'assigned';

                // matchMechanic already called Nominatim; get city from a fresh call
                // (one extra req but keeps matchMechanic focused on its own concerns)
                const loc = await getLocationFromCoords(lat, lng);
                userCity    = loc.city;
                // If pincode was not resolved by matchMechanic, use what geocoder gave us
                if (!userPincode) userPincode = loc.pincode;
            } catch (matchErr) {
                console.error('[assistanceRoutes] match error:', matchErr.message);
            }

            const newRequest = new AssistanceRequest({
                name, phone,
                location: { latitude: lat, longitude: lng, pincode: userPincode, city: userCity },
                vehicle, needs, image1, image2,
                status, assignedMechanic, matchMethod,
                matchedAt: assignedMechanic ? new Date() : null
            });

            await newRequest.save();

            // 🔔 Notify customer that request was received (fire-and-forget)
            notifyCustomerRequestReceived(phone, name, vehicle).catch(err =>
                console.error('[notify] notifyCustomerRequestReceived failed:', err.message)
            );

            if (assignedMechanic) {
                const Mechanic = require('./Mechanic');
                await Mechanic.findByIdAndUpdate(assignedMechanic, { $inc: { totalJobs: 1 } });
            }

            const populated = await AssistanceRequest.findById(newRequest._id)
                .populate('assignedMechanic', 'name mobile email rating');

            // 🔔 Notify customer about mechanic assignment (if matched)
            if (populated.assignedMechanic) {
                notifyCustomerMechanicAssigned(
                    phone, name,
                    populated.assignedMechanic.name,
                    populated.assignedMechanic.mobile
                ).catch(err =>
                    console.error('[notify] notifyCustomerMechanicAssigned failed:', err.message)
                );
            }

            res.status(201).json({
                message: 'Request saved successfully',
                request: populated,
                matchInfo: {
                    method: matchMethod,
                    mechanic: populated.assignedMechanic
                        ? { name: populated.assignedMechanic.name, phone: populated.assignedMechanic.mobile }
                        : null
                }
            });
        } catch (error) {
            console.error('[assistanceRoutes] error:', error);
            res.status(500).json({ message: 'Server error', error: error.message });
        }
    }
);

// ─────────────────────────────────────────────────────────────
// POST /api/register-mechanic
// ─────────────────────────────────────────────────────────────
const Mechanic = require('./Mechanic');

router.post('/register-mechanic', upload.array('shop_image', 3), validateMechanicRegistration, handleValidationErrors, async (req, res) => {
    try {
        const { name, mobile, address, pincode } = req.body;
        const shop_images = req.files ? req.files.map(f => f.filename) : [];

        // ── Parse vehicle types ────────────────────────────────────────────
        // FormData may send multiple values for same key OR a single comma-joined string
        let vehicle_type_raw = req.body.vehicle_type || req.body['vehicle_types[]'] || [];
        if (!Array.isArray(vehicle_type_raw)) {
            // Could be comma-joined string: "Bike, Van, Truck"
            vehicle_type_raw = String(vehicle_type_raw).split(',').map(s => s.trim()).filter(Boolean);
        }
        // Also collect any checkbox values sent as vehicle_types[] (some form encoders do this)
        const vtArr2 = req.body['vehicle_types[]'];
        if (vtArr2) {
            const extra = Array.isArray(vtArr2) ? vtArr2 : [vtArr2];
            vehicle_type_raw = [...new Set([...vehicle_type_raw, ...extra.map(s => s.trim())])];
        }
        const vehicleTypesArr = vehicle_type_raw.filter(Boolean);

        // ── Parse specializations ──────────────────────────────────────────
        let spec_raw = req.body.specialization || req.body['specializations[]'] || [];
        if (!Array.isArray(spec_raw)) {
            spec_raw = String(spec_raw).split(',').map(s => s.trim()).filter(Boolean);
        }
        const specArr2 = req.body['specializations[]'];
        if (specArr2) {
            const extra = Array.isArray(specArr2) ? specArr2 : [specArr2];
            spec_raw = [...new Set([...spec_raw, ...extra.map(s => s.trim())])];
        }
        const specializationsArr = spec_raw.filter(Boolean);

        // ── Validate required fields ────────────────────────────────────────
        if (!name || !mobile || !address || !pincode || vehicleTypesArr.length === 0 || specializationsArr.length === 0 || shop_images.length !== 3) {
            return res.status(400).json({
                success: false,
                message: `All required fields must be provided. Missing: ${[
                    !name && 'name',
                    !mobile && 'mobile',
                    !address && 'address',
                    !pincode && 'pincode',
                    vehicleTypesArr.length === 0 && 'vehicle types',
                    specializationsArr.length === 0 && 'specializations',
                    shop_images.length !== 3 && 'exactly 3 shop images'
                ].filter(Boolean).join(', ')}`
            });
        }

        const existing = await Mechanic.findOne({ mobile });
        if (existing) {
            return res.status(400).json({ success: false, message: 'A mechanic with this mobile number already exists' });
        }

        // ── Geocode pincode → lat/lng so radius matching works ──
        let locationCoords = {};
        try {
            const coords = await getCoordsFromPincode(pincode);
            if (coords) {
                locationCoords = { latitude: coords.lat, longitude: coords.lng };
                console.log(`[register-mechanic] geocoded ${pincode} → ${coords.lat}, ${coords.lng}`);
            } else {
                console.warn(`[register-mechanic] could not geocode pincode ${pincode}`);
            }
        } catch (geoErr) {
            console.error('[register-mechanic] geocode error:', geoErr.message);
        }

        const email        = `mechanic-${mobile}@roadside.com`.toLowerCase();
        const tempPassword = `Pass@${mobile}`;

        const newMechanic = new Mechanic({
            name,
            email,
            mobile,
            password: tempPassword,
            address,
            pincode,
            // Store as arrays — the schema uses Mixed so both arrays and strings are valid
            vehicle_type:   vehicleTypesArr,
            specialization: specializationsArr,
            shop_image:     shop_images,
            location:       locationCoords,
            experience:     1,
            rating:         5.0,
            totalJobs:      0
        });

        await newMechanic.save();

        console.log(`[register-mechanic] ✅ Registered: ${name} | Types: ${vehicleTypesArr.join(', ')} | Specs: ${specializationsArr.join(', ')}`);

        // 🔔 Notify mechanic that registration was received (fire-and-forget)
        notifyMechanicRegistered(mobile, name).catch(err =>
            console.error('[notify] notifyMechanicRegistered failed:', err.message)
        );

        res.status(201).json({
            success: true,
            message: 'Registration submitted successfully',
            mechanic: {
                id: newMechanic._id,
                name: newMechanic.name,
                mobile: newMechanic.mobile,
                vehicle_types: vehicleTypesArr,
                specializations: specializationsArr
            }
        });

    } catch (error) {
        console.error('Mechanic registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during registration',
            error: error.message
        });
    }
});

module.exports = router;