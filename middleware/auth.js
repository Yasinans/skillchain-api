const { getAuth } = require('../config/firebase');

const authenticateFirebaseToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({
                error: 'Authorization header missing',
                code: 'AUTH_HEADER_MISSING'
            });
        }

        const token = authHeader.split(' ')[1]; 
        
        if (!token) {
            return res.status(401).json({
                error: 'Token missing from authorization header',
                code: 'TOKEN_MISSING'
            });
        }

        const decodedToken = await getAuth().verifyIdToken(token);
    
        req.user = {
            uid: decodedToken.uid,
            address: decodedToken.address || decodedToken.uid,
            email: decodedToken.email || null,
            issuedAt: decodedToken.iat,
            expiresAt: decodedToken.exp
        };

        next();
    } catch (error) {
        console.error('Token verification error:', error);
        
        if (error.code === 'auth/id-token-expired') {
            return res.status(401).json({
                error: 'Token has expired',
                code: 'TOKEN_EXPIRED'
            });
        }
        
        if (error.code === 'auth/id-token-revoked') {
            return res.status(401).json({
                error: 'Token has been revoked',
                code: 'TOKEN_REVOKED'
            });
        }
        
        if (error.code === 'auth/invalid-id-token') {
            return res.status(401).json({
                error: 'Invalid token format',
                code: 'INVALID_TOKEN'
            });
        }

        return res.status(401).json({
            error: 'Token verification failed',
            code: 'TOKEN_VERIFICATION_FAILED'
        });
    }
};

const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            req.user = null;
            return next();
        }

        const token = authHeader.split(' ')[1];
        
        if (!token) {
            req.user = null;
            return next();
        }

        const decodedToken = await getAuth().verifyIdToken(token);
        
        req.user = {
            uid: decodedToken.uid,
            address: decodedToken.address || decodedToken.uid,
            email: decodedToken.email || null,
            issuedAt: decodedToken.iat,
            expiresAt: decodedToken.exp
        };

        next();
    } catch (error) {
        req.user = null;
        next();
    }
};

module.exports = {
    authenticateFirebaseToken,
    optionalAuth
};