const express = require('express');
const axios = require('axios');
const { ethers } = require('ethers');
const { getDB } = require('../config/firebase');
const { asyncHandler } = require('../utils/asyncHandler');
const { validateRequest, authenticateUser } = require('../middleware/validation');
const { body } = require('express-validator');
const admin = require('firebase-admin');

const router = express.Router();

const verifyDomainLimiter = require('express-rate-limit')({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 requests per hour per IP
    message: 'Too many domain verification attempts, please try again later.',
    keyGenerator: (req) => `${req.ip}-${req.body.domain}` 
});

const verifyDomainValidation = [
    body('domain')
        .isFQDN()
        .withMessage('Invalid domain format'),
    body('issuerAddress')
        .isEthereumAddress()
        .withMessage('Invalid Ethereum address')
];

const checkDomainCooldown = async (domain, issuerAddress) => {
    const db = getDB();
    const cooldownDoc = await db
        .collection('domain_verifications')
        .doc(`${domain}-${issuerAddress}`)
        .get();

    if (cooldownDoc.exists) {
        const data = cooldownDoc.data();
        const cooldownPeriod = 24 * 60 * 60 * 1000; 
        const timeSinceLastAttempt = Date.now() - data.lastAttempt;

        if (timeSinceLastAttempt < cooldownPeriod) {
            const remainingTime = Math.ceil((cooldownPeriod - timeSinceLastAttempt) / (60 * 60 * 1000));
            throw new Error(`Domain verification cooldown active. Try again in ${remainingTime} hours.`);
        }
    }
};

const updateDomainCooldown = async (domain, issuerAddress, success = false) => {
    const db = getDB();
    await db
        .collection('domain_verifications')
        .doc(`${domain}-${issuerAddress}`)
        .set({
            domain,
            issuerAddress,
            lastAttempt: Date.now(),
            lastSuccess: success ? Date.now() : null,
            attempts: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
};

const updateIssuerVerificationStatus = async (issuerAddress, domain, isVerified = true) => {
    const db = getDB();
    const issuerRef = db.collection('issuers').doc(issuerAddress.toLowerCase());
    
    try {
        const updateData = {
            isVerified,
            verifiedAt: isVerified ? Date.now() : null,
            domain: domain,
            lastUpdated: Date.now()
        };

        await issuerRef.set(updateData, { merge: true });
        
        return true;
    } catch (error) {
        console.error('❌ Error updating issuer verification status:', error);
        throw new Error('Failed to update issuer verification status in database');
    }
};


router.post('/verify',
    verifyDomainLimiter,
    verifyDomainValidation,
    validateRequest,
    authenticateUser,
    asyncHandler(async (req, res) => {
        const { domain, issuerAddress } = req.body;
        
        await checkDomainCooldown(domain, issuerAddress);

        try {
            const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
            const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
            
            const contractAddress = process.env.CONTRACT_ADDRESS;
            const contractABI = [
                "function verifyDomainOwnership(address issuer, bool verified) external"
            ];
            
            const contract = new ethers.Contract(contractAddress, contractABI, wallet);
            
            const tx = await contract.verifyDomainOwnership(issuerAddress, true);
            await tx.wait();

            await updateIssuerVerificationStatus(issuerAddress, domain, true);

            await updateDomainCooldown(domain, issuerAddress, true);

            res.json({
                success: true,
                message: 'Domain verified successfully',
                transactionHash: tx.hash,
                domain,
                issuerAddress,
                firestoreUpdated: true
            });

        } catch (error) {
            console.error('Domain verification error:', error);
            
            await updateDomainCooldown(domain, issuerAddress, false);
                
                res.status(400).json({
                    success: false,
                    error: fallbackError.message,
                    code: 'DOMAIN_VERIFICATION_FAILED'
                });
        }
    })
);

router.post('/generate-wellknown',
    authenticateUser,
    body('domain').isFQDN().withMessage('Invalid domain format'),
    validateRequest,
    asyncHandler(async (req, res) => {
        const { domain } = req.body;
        const issuerAddress = req.user.address; 

        const timestamp = Date.now();
        const wellKnownContent = {
            domain,
            issuer: issuerAddress,
            timestamp,
            version: "1.0",
            purpose: "SkillChain domain verification"
        };

        res.json({
            content: wellKnownContent,
            instructions: `Place this content in https://${domain}/.well-known/skillchain-credentials`
        });
    })
);


module.exports = router;