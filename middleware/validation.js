const { validationResult } = require('express-validator');
const { getAuth } = require('../config/firebase');

const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        if (errors.array().length > 0) {
            return res.status(400).json({
                success: false,
                error: errors.array()[0].msg,
                code: 'VALIDATION_ERROR',
                details: errors.array()
            });
        }
        else {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                code: 'VALIDATION_ERROR',
                details: errors.array()
            });
        }
    }
    next();
};

const authenticateUser = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await getAuth().verifyIdToken(token);
        req.user = {
            uid: decodedToken.uid,
            address: decodedToken.address,
            email: decodedToken.email
        };

        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

module.exports = {
    validateRequest,
    authenticateUser
};