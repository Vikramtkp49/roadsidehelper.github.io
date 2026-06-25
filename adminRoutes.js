const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const AssistanceRequest = require('./AssistanceRequest');
const Mechanic = require('./Mechanic');
const Admin = require('./Admin');
const { authenticateToken, authorizeRole } = require('./middleware/auth');

// ==========================================
// ─── 1. ANALYTICS ENDPOINTS ───────────────
// ==========================================

// GET /api/admin/analytics/overview
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

// GET /api/admin/analytics/requests-timeline
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

// GET /api/admin/analytics/monthly
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

// GET /api/admin/requests
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
            .limit(parseInt(limit));

        const formattedRequests = requests.map(req => {
            // Extract a mock city from the coordinates or fallback
            return {
                _id: req._id.toString(),
                name: req.name,
                phone: req.phone,
                vehicle: req.vehicle,
                vehicleModel: '2024 Model', // Fallback model info
                problem: req.needs || 'No details provided',
                location: {
                    address: `Coords: ${req.location.latitude.toFixed(4)}, ${req.location.longitude.toFixed(4)}`,
                    city: 'Chennai'
                },
                status: req.status,
                createdAt: req.createdAt
            };
        });

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

// PATCH /api/admin/requests/:id/status
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

// PATCH /api/admin/requests/:id/assign
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

// ==========================================
// ─── 3. MECHANICS MANAGEMENT ──────────────
// ==========================================

// GET /api/admin/mechanics
router.get('/admin/mechanics', authenticateToken, authorizeRole('admin', 'super_admin'), async (req, res) => {
    try {
        const { page = 1, limit = 12, status, search } = req.query;
        const query = {};

        if (status && status !== 'all') {
            if (status === 'pending') query.backgroundCheckStatus = 'pending';
            else if (status === 'approved') query.backgroundCheckStatus = 'verified';
            else if (status === 'rejected') query.backgroundCheckStatus = 'rejected';
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
                { specialization: { $regex: search, $options: 'i' } }
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

            // Extract last word of address as city, or fallback to Chennai
            const addressParts = m.address.split(',');
            const city = addressParts.length > 0 ? addressParts[addressParts.length - 1].trim() : 'Chennai';

            return {
                _id: m._id.toString(),
                name: m.name,
                email: m.email,
                phone: m.mobile,
                location: {
                    address: m.address,
                    city: city
                },
                skills: [m.specialization],
                experience: m.experience || 1,
                status: statusVal,
                rating: m.rating || 5.0,
                totalJobs: m.totalJobs || 0,
                profileImage: Array.isArray(m.shop_image) ? (m.shop_image[0] || 'default-shop.jpg') : (m.shop_image || 'default-shop.jpg')
            };
        });

        res.json({
            success: true,
            data: formattedMechanics,
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

// PATCH /api/admin/mechanics/:id/approve
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

        res.json({ success: true, data: mechanic });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PATCH /api/admin/mechanics/:id/reject
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

        res.json({ success: true, data: mechanic });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// DELETE /api/admin/mechanics/:id
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

module.exports = router;
