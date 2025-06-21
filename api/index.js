const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config({
    path: '../.env'
});

const authRoutes = require('../routes/auth');
const domainRoutes = require('../routes/domain');
const credentialsRoutes = require('../routes/credentials');
const { initializeFirebase } = require('../config/firebase');
const { errorHandler, notFoundHandler } = require('../middleware/errorHandlers');
const { requestLogger } = require('../middleware/logger');

const app = express();
const port = process.env.PORT || 3000;

initializeFirebase();

app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || "*",
    credentials: true,
    methods: ["GET", "POST", "DELETE", "UPDATE", "PUT", "PATCH"]
}));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 100, 
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

const credentialSharingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 share requests per windowMs
    message: {
        error: 'Too many credential sharing requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

const verificationLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // Allow more verification requests
    message: {
        error: 'Too many verification requests from this IP, please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
    }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(requestLogger);

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: process.env.API_VERSION || '1.0.0'
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/domain', domainRoutes);

app.use('/api/credentials/share', credentialSharingLimiter);
app.use('/api/credentials/verify', verificationLimiter);
app.use('/api/credentials', credentialsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});

module.exports = app;