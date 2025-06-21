const admin = require('firebase-admin');
const { cert } = require('firebase-admin/app');

let db = null;

const initializeFirebase = () => {
    try {
        if (!admin.apps.length) {
            const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);  
            admin.initializeApp({
                credential: cert(serviceAccount),
                projectId: process.env.FIREBASE_PROJECT_ID
            });
        }
        
        db = admin.firestore();
        console.log('✅ Firebase initialized successfully');
    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        process.exit(1);
    }
};


const getDB = () => {
    if (!db) {
        throw new Error('Firebase not initialized');
    }
    return db;
};

const getAuth = () => admin.auth();

module.exports = {
    initializeFirebase,
    getDB,
    getAuth
};