const express = require('express');
const { asyncHandler } = require('../utils/asyncHandler');
const { validateRequest } = require('../middleware/validation');
const { ethers } = require('ethers');
const { getDB } = require('../config/firebase');
const router = express.Router();
const { body, param } = require('express-validator');

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const CONTRACT_ABI = [
  "function credentials(uint256) view returns (address issuer, address holder, bytes32 dataHash, uint256 issuedAt, bool revoked)",
  "function verifyCredentialData(uint256 credentialId, string credentialData) view returns (bool)",
  "function getIssuerProfile(address issuer) view returns (string domain, bool isVerified, uint256 verifiedAt, string organizationName, string description)"
];

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://sepolia.infura.io/v3/YOUR_INFURA_KEY');
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);

const shareIdValidation = [
    param('shareId')
        .matches(/^share_[a-z0-9]+_[a-z0-9]+$/)
        .withMessage('Invalid share ID format')
];
const getUserCredentials = async (address) => {
    try {
        const db = getDB();
        const credsRef = db.collection('users').doc(address.toLowerCase()).collection('credentials');
        const snapshot = await credsRef.get();
        
        const credentials = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
        
            let organizationName = 'Unknown Issuer';
            if (data.issuer) {
                try {
                    const issuerDoc = await data.issuer.get();
                    if (issuerDoc.exists) {
                        organizationName = issuerDoc.data().organizationName || 'Unknown Issuer';
                    }
                } catch (error) {
                    console.warn('Failed to fetch issuer data:', error);
                }
            }
            credentials.push({
                id: doc.id,
                credentialId: data.credentialId,
                credentialName: data.credentialName,
                description: data.description,
                organizationName,
                holder: address.toLowerCase(),
                issuer: data.issuer?.path || '',
                issuedDate: data.issuedDate?.toDate?.()?.toISOString() || data.issuedDate,
                canExpire: data.canExpire,
                expiryDate: data.expiryDate?.toDate?.()?.toISOString() || data.expiryDate,
                skillLevel: data.skillLevel,
                status: data.status === true || data.status === 'true',
                certificateUrl: data.certificateUrl,
                txHash: data.txHash,
                additionalNotes: data.additionalNotes || '' 
            });
        }
        
        return credentials;
    } catch (error) {
        console.error('Error fetching user credentials with notes:', error);
        throw new Error('Failed to fetch credentials');
    }
};

router.get('/verify-blockchain/:credentialId',
    param('credentialId').isNumeric().withMessage('Invalid credential ID'),
    validateRequest,
    asyncHandler(async (req, res) => {
        const { credentialId } = req.params;
        
        try {
            const credentialData = await contract.credentials(parseInt(credentialId));
            
            if (!credentialData || credentialData.issuer === '0x0000000000000000000000000000000000000000') {
                return res.status(404).json({
                    success: false,
                    error: 'Credential not found on blockchain',
                    code: 'CREDENTIAL_NOT_FOUND'
                });
            }

            let issuerProfile = null;
            try {
                issuerProfile = await contract.getIssuerProfile(credentialData.issuer);
            } catch (profileError) {
                console.warn('Could not fetch issuer profile:', profileError);
            }

            const credential = {
                issuer: credentialData.issuer,
                holder: credentialData.holder,
                dataHash: credentialData.dataHash,
                issuedAt: Number(credentialData.issuedAt),
                revoked: credentialData.revoked,
                issuerProfile: issuerProfile ? {
                    domain: issuerProfile.domain,
                    isVerified: issuerProfile.isVerified,
                    organizationName: issuerProfile.organizationName,
                    description: issuerProfile.description
                } : null
            };

            res.json({
                success: true,
                credential,
                verificationMethod: 'API',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Blockchain verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify credential on blockchain',
                code: 'BLOCKCHAIN_ERROR',
                details: error.message
            });
        }
    })
);

router.post('/verify-credential-data/:credentialId',
    param('credentialId').isNumeric().withMessage('Invalid credential ID'),
    body('credentialData').isObject().withMessage('Credential data object is required'),
    validateRequest,
    asyncHandler(async (req, res) => {
        const { credentialId } = req.params;
        const { credentialData } = req.body;
        try {
            let issuedAtToUse = new Date(credentialData.issuedDate).toISOString();
            const originalFormat = JSON.stringify({
                skillName: credentialData.credentialName,
                skillLevel: credentialData.skillLevel,
                description: credentialData.description,
                expiryDate: credentialData.expiryDate || '',
                notes: credentialData.additionalNotes || '', 
                issuedBy: credentialData.organizationName,
                issuedAt: issuedAtToUse,
                certificateUrl: credentialData.certificateUrl || null
            });
            //console.log(originalFormat);
            const isValid = await contract.verifyCredentialData(parseInt(credentialId), originalFormat);
            res.json({
                success: true,
                isValid,
                credentialId: parseInt(credentialId),
                verificationMethod: 'API',
                originalDataFormat: originalFormat,
                debugInfo: {
                    receivedAdditionalNotes: credentialData.additionalNotes,
                    usedNotes: credentialData.notes,
                    receivedIssuedDate: credentialData.issuedDate,
                    usedIssuedAt: issuedAtToUse,
                    credentialName: credentialData.credentialName,
                    description: credentialData.description
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Credential data verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to verify credential data',
                code: 'VERIFICATION_ERROR',
                details: error.message
            });
        }
    })
);
router.get('/shared/:shareId/credentials',
    shareIdValidation,
    validateRequest,
    asyncHandler(async (req, res) => {
        const { shareId } = req.params;
        const db = getDB();

        try {
            const shareDoc = await db.collection('sharedCredentials').doc(shareId).get();
            
            if (!shareDoc.exists) {
                return res.status(404).json({
                    success: false,
                    error: 'Shared credential not found',
                    code: 'SHARE_NOT_FOUND'
                });
            }

            const shareData = shareDoc.data();
            const now = new Date();

            if (!shareData.isActive) {
                return res.status(410).json({
                    success: false,
                    error: 'This shared credential has been revoked',
                    code: 'SHARE_REVOKED'
                });
            }
            if (shareData.expiryDate && shareData.expiryDate.toDate() <= now) {
                return res.status(410).json({
                    success: false,
                    error: 'This shared credential has expired',
                    code: 'SHARE_EXPIRED'
                });
            }

            if (shareData.maxAccessCount && shareData.accessCount >= shareData.maxAccessCount) {
                return res.status(410).json({
                    success: false,
                    error: 'Access limit reached for this shared credential',
                    code: 'ACCESS_LIMIT_REACHED'
                });
            }

            const userCredentials = await getUserCredentials(shareData.owner);
            
            const sharedCredentials = userCredentials.filter(cred => 
                shareData.credentialIds.includes(cred.id)
            );

            if (sharedCredentials.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'No valid credentials found for this share',
                    code: 'NO_CREDENTIALS_FOUND'
                });
            }

            await shareDoc.ref.update({
                accessCount: shareData.accessCount + 1,
                 lastAccessedAt: now
            });

            res.json({
                success: true,
                credentials: sharedCredentials,
                shareInfo: {
                    shareId: shareData.shareId,
                    owner: shareData.owner,
                    createdAt: shareData.createdAt.toDate().toISOString(),
                    expiryDate: shareData.expiryDate?.toDate()?.toISOString() || null,
                    description: shareData.description,
                    accessCount: shareData.accessCount,
                    maxAccessCount: shareData.maxAccessCount,
                    isExpired: false,
                    totalCredentials: sharedCredentials.length
                },
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Error retrieving shared credentials:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to retrieve shared credentials',
                code: 'INTERNAL_ERROR',
                details: error.message
            });
        }
    })
);


router.get('/verify/:shareId',
    shareIdValidation,
    validateRequest,
    asyncHandler(async (req, res) => {
        const { shareId } = req.params;
        const db = getDB();

        const shareDoc = await db.collection('sharedCredentials').doc(shareId).get();
        
        if (!shareDoc.exists) {
            return res.status(404).json({
                error: 'Share not found',
                code: 'SHARE_NOT_FOUND'
            });
        }

        const shareData = shareDoc.data();
        const now = new Date();

        if (!shareData.isActive) {
            return res.status(410).json({
                error: 'This share has been revoked',
                code: 'SHARE_REVOKED'
            });
        }

        if (shareData.expiryDate && shareData.expiryDate.toDate() <= now) {
            return res.status(410).json({
                error: 'This share has expired',
                code: 'SHARE_EXPIRED'
            });
        }

        if (shareData.maxAccessCount && shareData.accessCount >= shareData.maxAccessCount) {
            return res.status(410).json({
                error: 'Access limit reached for this share',
                code: 'ACCESS_LIMIT_REACHED'
            });
        }

        const userCredentials = await getUserCredentials(shareData.owner);
        const sharedCredentials = userCredentials.filter(cred => 
            shareData.credentialIds.includes(cred.id)
        );

        await shareDoc.ref.update({
            accessCount: shareData.accessCount + 1,
            lastAccessedAt: now
        });

        res.json({
            success: true,
            credentials: sharedCredentials,
            shareInfo: {
                shareId: shareData.shareId,
                owner: shareData.owner,
                createdAt: shareData.createdAt.toDate().toISOString(),
                expiryDate: shareData.expiryDate?.toDate()?.toISOString() || null,
                description: shareData.description,
                accessCount: shareData.accessCount + 1,
                maxAccessCount: shareData.maxAccessCount,
                isExpired: false
            }
        });
    })
);

router.post('/verify-batch',
    body('credentialIds').isArray({ min: 1, max: 10 }).withMessage('Must provide 1-10 credential IDs'),
    body('credentialIds.*').isNumeric().withMessage('All credential IDs must be numeric'),
    validateRequest,
    asyncHandler(async (req, res) => {
        const { credentialIds } = req.body;
        
        try {
            const results = [];
            
            for (const credentialId of credentialIds) {
                try {
                    const credentialData = await contract.credentials(parseInt(credentialId));
                    
                    if (!credentialData || credentialData.issuer === '0x0000000000000000000000000000000000000000') {
                        results.push({
                            credentialId: parseInt(credentialId),
                            success: false,
                            error: 'Credential not found'
                        });
                        continue;
                    }

                    results.push({
                        credentialId: parseInt(credentialId),
                        success: true,
                        credential: {
                            issuer: credentialData.issuer,
                            holder: credentialData.holder,
                            dataHash: credentialData.dataHash,
                            issuedAt: Number(credentialData.issuedAt),
                            revoked: credentialData.revoked
                        }
                    });

                } catch (credError) {
                    results.push({
                        credentialId: parseInt(credentialId),
                        success: false,
                        error: credError.message
                    });
                }
            }

            res.json({
                success: true,
                results,
                totalVerified: results.filter(r => r.success).length,
                totalRequested: credentialIds.length,
                verificationMethod: 'API',
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('Batch verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to perform batch verification',
                code: 'BATCH_VERIFICATION_ERROR',
                details: error.message
            });
        }
    })
);

module.exports = router;