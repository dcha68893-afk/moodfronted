// server.js - Express server for Cloudinary uploads
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

// Ensure cloudinary.js is available (it should be in the same directory)
const { uploadFromBuffer } = require('./cloudinary'); 

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration for Multer (to handle file uploads in memory)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- Middleware Setup ---
// 1. CORS: Allow your frontend (Firebase Hosting URL) to communicate with this server.
// Replace 'YOUR_FIREBASE_HOSTING_DOMAIN' with your actual domain (e.g., 'https://uniconnect-ee95c.web.app')
const allowedOrigins = [
    'http://localhost:8080', 
    'http://127.0.0.1:5500',
    process.env.FRONTEND_URL // Will be set on Render
];

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true); 
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json()); // For parsing application/json

// --- Routes ---

// Health Check
app.get('/', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'UniConnect Backend API', version: '1.0' });
});

// File Upload Endpoint
// 'file' is the name of the field in the form-data request
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided for upload.' });
        }
        
        console.log(`Received file: ${req.file.originalname}`);

        // Use the uploadFromBuffer function from your cloudinary.js file
        const result = await uploadFromBuffer(req.file.buffer, req.file.originalname);

        // Respond with the secure URL and public ID
        res.status(200).json({
            message: 'File uploaded successfully',
            url: result.url,
            publicId: result.public_id,
            format: result.format
        });

    } catch (error) {
        console.error('API Upload Error:', error);
        res.status(500).json({ 
            error: 'Failed to upload file to Cloudinary.',
            details: error.message 
        });
    }
});


// --- Server Start ---
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`Access the API at http://localhost:${PORT}`);
});