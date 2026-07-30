const { body, validationResult } = require('express-validator');

// ── Assistance request validation ─────────────────────────────────────────────
exports.validateAssistanceRequest = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be 2–100 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name must contain only letters and spaces'),

    body('phone')
        .trim()
        .matches(/^[0-9]{10}$/)
        .withMessage('Phone must be exactly 10 digits'),

    body('latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitude must be a number between -90 and 90'),

    body('longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitude must be a number between -180 and 180'),

    body('vehicle')
        .isIn(['Bike', 'Car', 'Van', 'Truck', 'Bus', 'Tractor'])
        .withMessage('Vehicle must be one of: Bike, Car, Van, Truck, Bus, Tractor'),

    body('needs')
        .optional()
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description must not exceed 500 characters'),
];

// ── Mechanic registration validation ─────────────────────────────────────────
exports.validateMechanicRegistration = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 15 })
        .withMessage('Name must be 2–15 characters')
        .matches(/^[a-zA-Z\s\.\'-]+$/)
        .withMessage('Name must contain only valid letters and spaces'),

    body('mobile')
        .trim()
        .matches(/^[0-9]{10}$/)
        .withMessage('Mobile must be exactly 10 digits'),

    body('address')
        .trim()
        .isLength({ min: 5, max: 40 })
        .withMessage('Address must be 5–40 characters'),

    body('pincode')
        .trim()
        .matches(/^[0-9]{6}$/)
        .withMessage('Pincode must be exactly 6 digits'),
];

// ── Admin creation validation ───────────────────────────────────────────────
exports.validateAdminCreation = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be 2–100 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name must contain only letters and spaces'),

    body('email')
        .trim()
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail(),

    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long'),

    body('role')
        .isIn(['super_admin', 'admin', 'moderator', 'support'])
        .withMessage('Role must be super_admin, admin, moderator, or support'),

    body('permissions')
        .isArray()
        .withMessage('Permissions must be an array of strings')
        .custom((permissions) => {
            const valid = [
                'view_requests',
                'approve_mechanics',
                'block_mechanics',
                'edit_requests',
                'view_analytics',
                'manage_admins',
                'manage_settings'
            ];
            const invalid = permissions.filter(p => !valid.includes(p));
            if (invalid.length > 0) {
                throw new Error(`Invalid permissions: ${invalid.join(', ')}`);
            }
            return true;
        })
];

// ── Admin update validation ─────────────────────────────────────────────────
exports.validateAdminUpdate = [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be 2–100 characters')
        .matches(/^[a-zA-Z\s]+$/)
        .withMessage('Name must contain only letters and spaces'),

    body('email')
        .optional()
        .trim()
        .isEmail()
        .withMessage('Must be a valid email address')
        .normalizeEmail(),

    body('password')
        .optional()
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long'),

    body('role')
        .optional()
        .isIn(['super_admin', 'admin', 'moderator', 'support'])
        .withMessage('Role must be super_admin, admin, moderator, or support'),

    body('permissions')
        .optional()
        .isArray()
        .withMessage('Permissions must be an array of strings')
        .custom((permissions) => {
            const valid = [
                'view_requests',
                'approve_mechanics',
                'block_mechanics',
                'edit_requests',
                'view_analytics',
                'manage_admins',
                'manage_settings'
            ];
            const invalid = permissions.filter(p => !valid.includes(p));
            if (invalid.length > 0) {
                throw new Error(`Invalid permissions: ${invalid.join(', ')}`);
            }
            return true;
        }),

    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean')
];

// ── Shared error handler ──────────────────────────────────────────────────────
exports.handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            // e.path is the express-validator v7 field name; e.param is the legacy v6 fallback
            errors: errors.array().map(e => ({ field: e.path || e.param, message: e.msg }))
        });
    }
    next();
};
