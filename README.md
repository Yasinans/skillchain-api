# SkillChain API

A blockchain-based credential verification API that enables secure issuance, storage, and verification of professional credentials using Web3 technology and Firebase.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Setup](#environment-setup)
- [Database Configuration](#database-configuration)
- [Development](#development)
- [Build](#build)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Deployment](#deployment)
- [Technologies Used](#technologies-used)

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v18.0.0 or higher)
- npm or yarn package manager
- Git
- Firebase project with Firestore enabled
- Ethereum wallet with testnet/mainnet access
- Deployed SkillChain smart contract

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/skillchain-api.git
cd skillchain-api
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up your environment variables (see [Environment Setup](#environment-setup))

## Environment Setup

1. Create a `.env` file in the root directory of your project:
```bash
cp .env.example .env
```

2. Add your environment variables to the `.env` file:
```env
NODE_ENV=development
PORT=3000
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"..."}
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
PRIVATE_KEY=your-oracle-wallet-private-key
CONTRACT_ADDRESS=0x39c52ea5190FaE336C7BCa389b2086897A55500E
```

### Getting your Firebase credentials:
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or select an existing one
3. Navigate to Project Settings > Service Accounts
4. Generate a new private key for Firebase Admin SDK
5. Copy the entire JSON object and paste it as the value for `FIREBASE_SERVICE_ACCOUNT_KEY`

### Environment Variables Explanation:
- **NODE_ENV**: Environment mode (`development` or `production`)
- **PORT**: Server port (default: 3000)
- **FIREBASE_PROJECT_ID**: Your Firebase project identifier
- **FIREBASE_SERVICE_ACCOUNT_KEY**: Complete JSON object from Firebase Admin SDK service account key
- **ALLOWED_ORIGINS**: CORS allowed origins (comma-separated)
- **RPC_URL**: Ethereum RPC endpoint (Infura, Alchemy, etc.)
- **PRIVATE_KEY**: Oracle/Admin wallet private key for domain verification
- **CONTRACT_ADDRESS**: Deployed SkillChain smart contract address

## Database Configuration

### Firebase Firestore Setup

For detailed Firebase setup instructions, refer to the main project: [Yasinans/skillchain](https://github.com/Yasinans/skillchain)

### Firestore Security Rules

The API works with the following Firestore collections and security rules (configured in the main project):

- **users/{walletAddress}**
  - User profile information
  - Nested collection: `credentials/{credentialId}`

- **issuers/{walletAddress}**
  - Issuer organization information
  - Domain verification status

- **sharedCredentials/{shareId}**
  - Shared credential links with access control
  - Rate limiting and cooldown tracking

- **domain_verifications/{domain-issuerAddress}**
  - Domain verification cooldown tracking

## Development

To run the development server:

```bash
npm run dev
# or
yarn dev
```

The API will be available at `http://localhost:3000` (or your configured PORT).

### Health Check

Test if the API is running:
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "1.0.0"
}
```

## Build

To build the project for production:

```bash
npm install --production
```

To start the production server:

```bash
npm start
```

## Project Structure

```
├── api/
│   └── index.js              # Main server entry point (Vercel)
├── config/
│   └── firebase.js           # Firebase Admin SDK configuration
├── middleware/
│   ├── auth.js               # Firebase authentication middleware
│   ├── errorHandlers.js      # Global error handling
│   ├── logger.js             # Request logging middleware
│   └── validation.js         # Input validation utilities
├── routes/
│   ├── auth.js               # Wallet-based authentication routes
│   ├── credentials.js        # Credential verification routes
│   └── domain.js             # Domain verification routes
├── utils/
│   └── asyncHandler.js       # Async error handling utility
├── .env                      # Environment variables (not in version control)
├── .gitignore                # Git ignore file
├── package-lock.json         # NPM lock file
├── package.json              # Project dependencies and scripts
├── README.md                 # This file
└── vercel.json               # Vercel deployment configuration
```

## API Documentation

### Authentication Endpoints

#### POST `/api/auth/verify-wallet`
Authenticate user with wallet signature and get Firebase custom token.

**Request Body:**
```json
{
  "address": "0x742d35Cc6634C0532925a3b8D80E...",
  "message": "Sign this message to log in to SkillChain: 1640995200000",
  "signature": "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e..."
}
```

**Response:**
```json
{
  "firebaseToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "address": "0x742d35cc6634c0532925a3b8d80e...",
    "email": "user@example.com",
    "hasProfile": true
  }
}
```

### Credential Endpoints

#### GET `/api/credentials/verify-blockchain/:credentialId`
Verify credential existence and data on blockchain.

**Parameters:**
- `credentialId`: Numeric credential ID

**Response:**
```json
{
  "success": true,
  "credential": {
    "issuer": "0x742d35Cc6634C0532925a3b8D80E...",
    "holder": "0x8ba1f109551bD432803012645Hac...",
    "dataHash": "0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e...",
    "issuedAt": 1640995200,
    "revoked": false,
    "issuerProfile": {
      "domain": "example.com",
      "isVerified": true,
      "organizationName": "Example Corp",
      "description": "Leading tech company"
    }
  },
  "verificationMethod": "API",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

#### POST `/api/credentials/verify-credential-data/:credentialId`
Verify credential data integrity by comparing with blockchain hash.

**Request Body:**
```json
{
  "credentialData": {
    "credentialName": "JavaScript Developer",
    "skillLevel": "Advanced",
    "description": "Full-stack JavaScript development",
    "organizationName": "Example Corp",
    "issuedDate": "2024-01-15T10:30:00.000Z",
    "expiryDate": "2025-01-15T10:30:00.000Z",
    "additionalNotes": "Completed advanced coursework",
    "certificateUrl": "https://example.com/cert.pdf"
  }
}
```

#### GET `/api/credentials/shared/:shareId/credentials`
Access shared credentials via share ID with access control.

**Parameters:**
- `shareId`: Share ID in format `share_abc123_def456`

#### POST `/api/credentials/verify-batch`
Batch verify multiple credentials on blockchain.

**Request Body:**
```json
{
  "credentialIds": [1, 2, 3, 4, 5]
}
```

### Domain Verification Endpoints

#### POST `/api/domain/verify`
Verify domain ownership for organization (requires authentication).

**Headers:**
```
Authorization: Bearer <firebase-id-token>
```

**Request Body:**
```json
{
  "domain": "example.com",
  "issuerAddress": "0x742d35Cc6634C0532925a3b8D80E..."
}
```

#### POST `/api/domain/generate-wellknown`
Generate well-known file content for domain verification.

**Request Body:**
```json
{
  "domain": "example.com"
}
```

**Response:**
```json
{
  "content": {
    "domain": "example.com",
    "issuer": "0x742d35Cc6634C0532925a3b8D80E...",
    "timestamp": 1640995200000,
    "version": "1.0",
    "purpose": "SkillChain domain verification"
  },
  "instructions": "Place this content in https://example.com/.well-known/skillchain-credentials"
}
```

## Deployment

### Vercel Deployment (Recommended)

1. **Install Vercel CLI**:
```bash
npm i -g vercel
```

2. **Deploy**:
```bash
vercel
```

3. **Set Environment Variables**:
Configure all environment variables in the Vercel dashboard under Settings > Environment Variables.

### Manual Deployment

1. **Build and start**:
```bash
npm install --production
npm start
```

2. **Environment Variables**:
Ensure all environment variables are set in your hosting environment.



## Smart Contract

### Contract Overview

The API integrates with the `VerifiedCredentials` smart contract that enables:
- Domain-based issuer verification
- Credential data hash verification
- Oracle-based domain ownership verification
- Credential revocation tracking

### Contract Configuration

Update the contract address in your `.env` file:
```env
CONTRACT_ADDRESS=0x39c52ea5190FaE336C7BCa389b2086897A55500E
```

For smart contract deployment instructions, refer to: [Yasinans/skillchain](https://github.com/Yasinans/skillchain)

### Supported Networks

- **Sepolia Testnet** (default): Chain ID `0xaa36a7`
- **Ethereum Mainnet**: Chain ID `0x1`
- **Polygon**: Chain ID `0x89`
- Any EVM-compatible network

## Technologies Used

- **Backend Framework**: Node.js with Express.js
- **Authentication**: Firebase Admin SDK with custom tokens
- **Database**: Firebase Firestore
- **Blockchain**: Ethereum-compatible networks
- **Smart Contract Integration**: Ethers.js
- **Validation**: express-validator
- **Security**: Helmet, CORS, express-rate-limit
- **Environment**: dotenv for configuration
- **Deployment**: Vercel (serverless functions)

### Security Features

- **Rate Limiting**: Configurable limits for different endpoints
- **Input Validation**: Comprehensive validation using express-validator
- **CORS Protection**: Configurable origin restrictions
- **Helmet**: Security headers for protection against common vulnerabilities
- **Firebase Authentication**: Secure token-based authentication
- **Wallet Signature Verification**: Cryptographic proof of wallet ownership
- **Domain Verification Cooldown**: 24-hour cooldown between verification attempts
---

## Additional Notes

- Make sure to never commit your `.env` file to version control
- The `PRIVATE_KEY` should be for an oracle/admin wallet that has permission to verify domains on the smart contract
- The `FIREBASE_SERVICE_ACCOUNT_KEY` must be the complete JSON object from Firebase Admin SDK
- Domain verification includes a 24-hour cooldown period to prevent abuse
- Rate limiting is configured per-endpoint with different limits for various operations
- The API supports both individual and batch credential verification
- All blockchain interactions use read-only calls except for domain verification
- CORS is configurable via the `ALLOWED_ORIGINS` environment variable
- The API is designed to work with the SkillChain frontend application
- For production deployment, ensure all environment variables are properly set
- Monitor your RPC provider usage and costs, especially for batch operations
