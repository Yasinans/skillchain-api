const express = require('express');
const { ethers } = require('ethers');
const { getDB, getAuth } = require('../config/firebase');
const { asyncHandler } = require('../utils/asyncHandler');
const { validateRequest } = require('../middleware/validation');
const { body } = require('express-validator');

const router = express.Router();

const getUserData = async (address) => {
    try {
        const db = getDB();
        const userDoc = await db.collection('users').doc(address.toLowerCase()).get();
        
        if (!userDoc.exists) {
            return null;
        }
        
        return userDoc.data();
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw new Error('Database error');
    }
};

const verifyWalletValidation = [
    body('address')
        .isEthereumAddress()
        .withMessage('Invalid Ethereum address'),
    body('message')
        .isLength({ min: 10, max: 500 })
        .withMessage('Message must be between 10 and 500 characters'),
    body('signature')
        .isLength({ min: 100, max: 200 })
        .withMessage('Invalid signature format')
];

router.post('/verify-wallet', 
    verifyWalletValidation,
    validateRequest,
    asyncHandler(async (req, res) => {
        const { address, message, signature } = req.body;

        let signerAddr;
        try {
            signerAddr = ethers.verifyMessage(message, signature);
        } catch (error) {
            return res.status(400).json({ 
                error: 'Invalid signature format',
                code: 'INVALID_SIGNATURE_FORMAT'
            });
        }

        if (signerAddr.toLowerCase() !== address.toLowerCase()) {
            return res.status(401).json({ 
                error: 'Signature does not match address',
                code: 'SIGNATURE_MISMATCH'
            });
        }

        const messageRegex = /Sign this message to log in to SkillChain: (\d+)/;
        const match = message.match(messageRegex);
        
        if (!match) {
            return res.status(400).json({ 
                error: 'Invalid message format',
                code: 'INVALID_MESSAGE_FORMAT'
            });
        }

        const timestamp = parseInt(match[1]);
        const now = Date.now();
        const fiveMinutes = 5 * 60 * 1000;

        if (now - timestamp > fiveMinutes) {
            return res.status(400).json({ 
                error: 'Message expired',
                code: 'MESSAGE_EXPIRED'
            });
        }

        const userData = await getUserData(address);
        const email = userData?.email || null;

        const additionalClaims = {
            email: email,
            address: address.toLowerCase(),
            issuedAt: now
        };

        const firebaseToken = await getAuth().createCustomToken(address.toLowerCase(), additionalClaims);
        
        res.json({ 
            firebaseToken,
            user: {
                address: address.toLowerCase(),
                email: email,
                hasProfile: !!userData
            }
        });
    })
);

module.exports = router;