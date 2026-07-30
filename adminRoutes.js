const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const AssistanceRequest = require('./AssistanceRequest');
const Mechanic = require('./Mechanic');
const Admin = require('./Admin');
const { authenticateToken, authorizeRole } = require('./middleware/auth');
const { validateAdminCreation, validateAdminUpdate, handleValidationErrors } = require('./middleware/validation');
const { matchMechanic } = require('./matchMechanic');
const { notifyMechanicApproved, notifyMechanicRejected, notifyCustomerMechanicAssigned } = require('./notify');

// ── Secure DB-backed Permission Verification middleware ──────────────────────
// Accepts one or more permissions — passes if admin has ANY of them (or is super_admin)
const authorizePermission = (...permissions) => {
    return async (req, res, next) => {
        try {
            const admin = await Admin.findById(req.user.id);
            if (!admin || !admin.isActive) {
                return res.status(403).json({ success: false, message: 'Account is inactive or invalid' });
            }
            const hasAccess = admin.role === 'super_admin' ||
                (admin.permissions && permissions.some(p => admin.permissions.includes(p)));
            if (hasAccess) return next();
            return res.status(403).json({ success: false, message: 'Insufficient permissions' });
        } catch (err) {
            console.error('Permission middleware error:', err);
            return res.status(500).json({ success: false, message: 'Auth permission check error' });
        }
    };
};

// ── Helper: normalise Mixed vehicle_type / specialization to a display string ──
function toArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (val === 'Both') return ['Bike', 'Car'];
    if (val === 'Load Van') return ['Van'];
    return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

function toDisplayString(val) {
    return toArray(val).join(', ') || 'Not specified';
}

// ==========================================
// ─── 1. ANALYTICS ENDPOINTS ───────────────
// ==========================================

router.get('/admin/analytics/overview', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const [
            todayRequests,
            totalRequests,
            monthRequests,
            totalMechanics,
            pendingApprovals,
            requestsByStatus
        ] = await Promise.all([
            AssistanceRequest.countDocuments({ createdAt: { $gte: startOfDay } }),
            AssistanceRequest.countDocuments(),
            AssistanceRequest.countDocuments({ createdAt: { $gte: startOfMonth } }),
            Mechanic.countDocuments({ backgroundCheckStatus: 'verified' }),
            Mechanic.countDocuments({ backgroundCheckStatus: 'pending' }),
            AssistanceRequest.aggregate([
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ])
        ]);

        const statusMap = { pending: 0, assigned: 0, completed: 0, cancelled: 0 };
        requestsByStatus.forEach(s => {
            if (s._id) statusMap[s._id] = s.count;
        });

        res.json({
            success: true,
            data: {
                todayRequests,
                totalRequests,
                monthRequests,
                totalMechanics,
                pendingApprovals,
                requestsByStatus: statusMap
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/admin/analytics/requests-timeline', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const timeline = await AssistanceRequest.aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({ success: true, data: timeline });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.get('/admin/analytics/monthly', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const monthly = await AssistanceRequest.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            { $limit: 12 }
        ]);

        const topMechanics = await Mechanic.find({ backgroundCheckStatus: 'verified' })
            .sort({ totalJobs: -1 })
            .limit(5)
            .select('name totalJobs rating');

        res.json({
            success: true,
            data: {
                monthly,
                topMechanics: topMechanics.map(m => ({
                    name: m.name,
                    totalJobs: m.totalJobs || 0,
                    rating: m.rating || 5.0
                }))
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==========================================
// ─── 2. SERVICE REQUESTS MANAGEMENT ──────
// ==========================================

router.get('/admin/requests', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const { page = 1, limit = 10, status, search } = req.query;
        const query = {};

        if (status && status !== 'all') {
            query.status = status;
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { vehicle: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;
        const total = await AssistanceRequest.countDocuments(query);
        const requests = await AssistanceRequest.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('assignedMechanic', 'name mobile rating vehicle_type');

        const formattedRequests = requests.map(req => ({
            _id: req._id.toString(),
            name: req.name,
            phone: req.phone,
            vehicle: req.vehicle,
            problem: req.needs || 'No details provided',
            location: {
                address: `Coords: ${req.location.latitude.toFixed(4)}, ${req.location.longitude.toFixed(4)}`,
                city: req.location.city || 'Unknown',
                pincode: req.location.pincode || '—'
            },
            status: req.status,
            matchMethod: req.matchMethod || 'none',
            assignedMechanic: req.assignedMechanic
                ? { name: req.assignedMechanic.name, phone: req.assignedMechanic.mobile }
                : null,
            createdAt: req.createdAt
        }));

        res.json({
            success: true,
            data: formattedRequests,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.patch('/admin/requests/:id/status', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const { status } = req.body;
        const valid = ['pending', 'assigned', 'completed', 'cancelled'];
        if (!valid.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const request = await AssistanceRequest.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        res.json({ success: true, data: request });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.patch('/admin/requests/:id/assign', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const { mechanicId } = req.body;
        const mechanic = await Mechanic.findById(mechanicId);
        if (!mechanic || mechanic.isBlocked) {
            return res.status(400).json({ success: false, message: 'Invalid mechanic selected' });
        }

        const request = await AssistanceRequest.findByIdAndUpdate(
            req.params.id,
            { status: 'assigned' },
            { new: true }
        );

        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        res.json({ success: true, data: request });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ── Re-match a request ────────────────────────────────────────
router.post('/admin/requests/:id/rematch', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const request = await AssistanceRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ success: false, message: 'Request not found' });
        }

        const result = await matchMechanic(
            request.location.latitude,
            request.location.longitude,
            request.vehicle
        );

        if (result.mechanic) {
            await AssistanceRequest.findByIdAndUpdate(req.params.id, {
                assignedMechanic: result.mechanic._id,
                matchMethod: result.method,
                status: 'assigned',
                matchedAt: new Date()
            });
            await Mechanic.findByIdAndUpdate(result.mechanic._id, { $inc: { totalJobs: 1 } });

            // 🔔 Notify customer about newly assigned mechanic (fire-and-forget)
            notifyCustomerMechanicAssigned(
                request.phone, request.name,
                result.mechanic.name, result.mechanic.mobile
            ).catch(err =>
                console.error('[notify] notifyCustomerMechanicAssigned (rematch) failed:', err.message)
            );

            return res.json({
                success: true,
                message: `Matched to ${result.mechanic.name} via ${result.method}`,
                data: { assignedMechanic: result.mechanic._id, method: result.method }
            });
        } else {
            return res.json({
                success: true,
                message: 'No mechanic found nearby. Request remains unassigned.',
                data: { assignedMechanic: null }
            });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error during re-match' });
    }
});

// ==========================================
// ─── 3. MECHANICS MANAGEMENT ──────────────
// ==========================================

router.get('/admin/mechanics', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const { page = 1, limit = 12, status, search } = req.query;
        const query = {};

        if (status && status !== 'all') {
            if (status === 'pending')  query.backgroundCheckStatus = 'pending';
            else if (status === 'approved') query.backgroundCheckStatus = 'verified';
            else if (status === 'rejected') query.backgroundCheckStatus = 'rejected';
        }

        if (search) {
            query.$or = [
                { name:    { $regex: search, $options: 'i' } },
                { email:   { $regex: search, $options: 'i' } },
                { mobile:  { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (page - 1) * limit;
        const total = await Mechanic.countDocuments(query);
        const mechanics = await Mechanic.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const formattedMechanics = mechanics.map(m => {
            let statusVal = 'pending';
            if (m.backgroundCheckStatus === 'verified') statusVal = 'approved';
            else if (m.backgroundCheckStatus === 'rejected') statusVal = 'rejected';

            const addressParts = m.address.split(',');
            const city = addressParts.length > 0
                ? addressParts[addressParts.length - 1].trim()
                : 'Chennai';

            // Normalise both fields to arrays for display
            const vtArr   = toArray(m.vehicle_type);
            const specArr = toArray(m.specialization);

            // Build a readable vehicle type display with emojis
            const emojiMap = { Bike: '🏍️', Car: '🚗', Van: '🚐', Truck: '🚚', Bus: '🚌', Tractor: '🚜' };
            const vehicleTypeDisplay = vtArr.length > 0
                ? vtArr.map(t => `${emojiMap[t] || ''} ${t}`).join(', ')
                : 'Not specified';

            return {
                _id:         m._id.toString(),
                name:        m.name,
                email:       m.email,
                phone:       m.mobile,
                location: {
                    address: m.address,
                    city,
                    pincode: m.pincode || '—'
                },
                vehicleType:       vehicleTypeDisplay,
                vehicleTypesArray: vtArr,
                skills:            specArr,
                experience:        m.experience || 1,
                status:            statusVal,
                rating:            m.rating    || 5.0,
                totalJobs:         m.totalJobs || 0,
                profileImage: Array.isArray(m.shop_image)
                    ? (m.shop_image[0] || 'default-shop.jpg')
                    : (m.shop_image   || 'default-shop.jpg')
            };
        });

        res.json({
            success: true,
            data: formattedMechanics,
            pagination: {
                total,
                page:  parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.patch('/admin/mechanics/:id/approve', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const mechanic = await Mechanic.findByIdAndUpdate(
            req.params.id,
            {
                isVerified: true,
                backgroundCheckStatus: 'verified',
                backgroundCheckDate: new Date()
            },
            { new: true }
        );

        if (!mechanic) {
            return res.status(404).json({ success: false, message: 'Mechanic not found' });
        }

        // 🔔 Notify mechanic they are approved (fire-and-forget)
        notifyMechanicApproved(mechanic.mobile, mechanic.name).catch(err =>
            console.error('[notify] notifyMechanicApproved failed:', err.message)
        );

        res.json({ success: true, data: mechanic });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.patch('/admin/mechanics/:id/reject', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const mechanic = await Mechanic.findByIdAndUpdate(
            req.params.id,
            {
                isVerified: false,
                backgroundCheckStatus: 'rejected',
                backgroundCheckDate: new Date()
            },
            { new: true }
        );

        if (!mechanic) {
            return res.status(404).json({ success: false, message: 'Mechanic not found' });
        }

        // 🔔 Notify mechanic they are rejected (fire-and-forget)
        notifyMechanicRejected(mechanic.mobile, mechanic.name).catch(err =>
            console.error('[notify] notifyMechanicRejected failed:', err.message)
        );

        res.json({ success: true, data: mechanic });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

router.delete('/admin/mechanics/:id', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const mechanic = await Mechanic.findByIdAndDelete(req.params.id);
        if (!mechanic) {
            return res.status(404).json({ success: false, message: 'Mechanic not found' });
        }

        res.json({ success: true, message: 'Mechanic deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ==========================================
// ─── 4. ADMIN USER SYSTEM MANAGEMENT ──────
// ==========================================

// Get all admins
router.get('/admin/users', authenticateToken, authorizePermission('manage_admins'), async (req, res) => {
    try {
        const admins = await Admin.find({}).sort({ name: 1 }).select('-password -activityLog');
        res.json({ success: true, data: admins });
    } catch (err) {
        console.error('Fetch admins error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create new admin
router.post('/admin/users', authenticateToken, authorizePermission('manage_admins'), validateAdminCreation, handleValidationErrors, async (req, res) => {
    try {
        const { name, email, password, role, permissions } = req.body;
        
        const existing = await Admin.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ success: false, message: 'An admin with this email already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newAdmin = new Admin({
            name,
            email: email.toLowerCase(),
            password: hashedPassword,
            role,
            permissions,
            isActive: true
        });

        await newAdmin.save();
        res.status(201).json({ success: true, message: 'Admin user created successfully', data: { id: newAdmin._id, name, email, role } });
    } catch (err) {
        console.error('Create admin error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update admin details
router.patch('/admin/users/:id', authenticateToken, authorizePermission('manage_admins'), validateAdminUpdate, handleValidationErrors, async (req, res) => {
    try {
        const { name, email, password, role, permissions, isActive } = req.body;
        const targetId = req.params.id;

        const targetAdmin = await Admin.findById(targetId);
        if (!targetAdmin) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        // Prevent deactivating or demoting the active system super_admin from themselves
        if (targetId === req.user.id) {
            if (isActive === false) {
                return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
            }
            if (role && role !== targetAdmin.role) {
                return res.status(400).json({ success: false, message: 'You cannot change your own role' });
            }
        }

        if (name) targetAdmin.name = name;
        if (email) {
            const existing = await Admin.findOne({ email: email.toLowerCase(), _id: { $ne: targetId } });
            if (existing) {
                return res.status(400).json({ success: false, message: 'An admin with this email already exists' });
            }
            targetAdmin.email = email.toLowerCase();
        }
        if (password) {
            targetAdmin.password = await bcrypt.hash(password, 10);
        }
        if (role) targetAdmin.role = role;
        if (permissions) targetAdmin.permissions = permissions;
        if (isActive !== undefined) targetAdmin.isActive = isActive;

        targetAdmin.updatedAt = new Date();
        await targetAdmin.save();

        res.json({
            success: true,
            message: 'Admin updated successfully',
            data: { id: targetAdmin._id, name: targetAdmin.name, email: targetAdmin.email, role: targetAdmin.role, isActive: targetAdmin.isActive }
        });
    } catch (err) {
        console.error('Update admin error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete admin
router.delete('/admin/users/:id', authenticateToken, authorizePermission('manage_admins'), async (req, res) => {
    try {
        const targetId = req.params.id;

        if (targetId === req.user.id) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
        }

        const deleted = await Admin.findByIdAndDelete(targetId);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Admin not found' });
        }

        res.json({ success: true, message: 'Admin deleted successfully' });
    } catch (err) {
        console.error('Delete admin error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;