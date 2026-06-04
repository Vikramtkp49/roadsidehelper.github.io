const { body, validationResult } = require('express-validator');

exports.validateAssistanceRequest = [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .matches(/^[a-zA-Z\s]*$/, 'i')
        .withMessage('Name must contain only letters'),
    
    body('phone')
        .trim()
        .matches(/^[0-9]{10,15}$/)
        .withMessage('Phone must be 10-15 digits'),
    
    body('latitude')
        .isFloat({ min: -90, max: 90 })
        .withMessage('Invalid latitude'),
    
    body('longitude')
        .isFloat({ min: -180, max: 180 })
        .withMessage('Invalid longitude'),
    
    body('vehicle')
        .isIn(['Bike', 'Car', 'Load Van'])
        .withMessage('Invalid vehicle type'),
    
    body('needs')
        .trim()
        .isLength({ max: 500 })
        .withMessage('Description too long'),
];

exports.handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            message: "Validation failed",
            errors: errors.array().map(e => ({ field: e.param, message: e.msg }))
        });
    }
    next();
};
