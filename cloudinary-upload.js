// server.js - Express server for Cloudinary uploads
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

// Ensure cloudinary.js is available (it should be in the same directory)
const { uploadFromBuffer, cloudinary } = require('./cloudinary'); 

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
    methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json()); // For parsing application/json

// --- Routes ---

// Health Check
app.get('/', (req, res) => {
    res.status(200).json({ status: 'OK', service: 'UniConnect Backend API', version: '1.0' });
});

// File Upload Endpoint with Mood/Interest Tagging
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file provided for upload.' });
        }
        
        console.log(`Received file: ${req.file.originalname}`);
        
        // Extract tags from request body
        const tags = req.body.tags ? JSON.parse(req.body.tags) : [];
        const userId = req.body.userId || 'anonymous';
        
        // Add user ID as a tag
        const allTags = ['uploaded', `user:${userId}`, ...tags];
        
        // Use the uploadFromBuffer function with tags
        const result = await uploadFromBuffer(
            req.file.buffer, 
            req.file.originalname,
            allTags // Pass tags to the upload function
        );

        // Respond with the secure URL and public ID
        res.status(200).json({
            message: 'File uploaded successfully',
            url: result.url,
            publicId: result.public_id,
            format: result.format,
            tags: result.tags,
            userId: userId
        });

    } catch (error) {
        console.error('API Upload Error:', error);
        res.status(500).json({ 
            error: 'Failed to upload file to Cloudinary.',
            details: error.message 
        });
    }
});

// Get all images with filtering by tags
app.get('/api/media', async (req, res) => {
    try {
        const { tags, userId, mood, interest, maxResults = 50 } = req.query;
        
        // Build search expression
        let expression = 'resource_type:image';
        
        if (userId) {
            expression += ` AND tags=user:${userId}`;
        }
        
        if (tags) {
            const tagArray = tags.split(',');
            tagArray.forEach(tag => {
                expression += ` AND tags=${tag}`;
            });
        }
        
        if (mood) {
            expression += ` AND tags=mood:${mood}`;
        }
        
        if (interest) {
            expression += ` AND tags=interest:${interest}`;
        }
        
        console.log('Searching with expression:', expression);
        
        // Search Cloudinary
        const result = await cloudinary.search
            .expression(expression)
            .max_results(parseInt(maxResults))
            .execute();
            
        res.status(200).json({
            total: result.total_count,
            media: result.resources.map(item => ({
                publicId: item.public_id,
                url: item.secure_url,
                format: item.format,
                tags: item.tags,
                createdAt: item.created_at,
                width: item.width,
                height: item.height
            }))
        });
        
    } catch (error) {
        console.error('Media Fetch Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch media from Cloudinary.',
            details: error.message 
        });
    }
});

// Get available tags (moods and interests)
app.get('/api/tags', async (req, res) => {
    try {
        const { type } = req.query; // 'mood' or 'interest' or undefined for all
        
        let expression = 'resource_type:image';
        
        // Search for all tagged images
        const result = await cloudinary.search
            .expression(expression)
            .max_results(100)
            .execute();
        
        // Extract all tags
        const allTags = result.resources.flatMap(item => item.tags || []);
        
        // Categorize tags
        const moodTags = new Set();
        const interestTags = new Set();
        const otherTags = new Set();
        
        allTags.forEach(tag => {
            if (tag.startsWith('mood:')) {
                moodTags.add(tag.replace('mood:', ''));
            } else if (tag.startsWith('interest:')) {
                interestTags.add(tag.replace('interest:', ''));
            } else if (!tag.startsWith('user:')) {
                otherTags.add(tag);
            }
        });
        
        let response = {};
        
        if (!type) {
            response = {
                moods: Array.from(moodTags),
                interests: Array.from(interestTags),
                other: Array.from(otherTags)
            };
        } else if (type === 'mood') {
            response = { moods: Array.from(moodTags) };
        } else if (type === 'interest') {
            response = { interests: Array.from(interestTags) };
        }
        
        res.status(200).json(response);
        
    } catch (error) {
        console.error('Tags Fetch Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch tags from Cloudinary.',
            details: error.message 
        });
    }
});

// Add tags to existing image
app.post('/api/media/:publicId/tags', async (req, res) => {
    try {
        const { publicId } = req.params;
        const { tags } = req.body;
        
        if (!tags || !Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags array is required.' });
        }
        
        // Add tags to the image
        const result = await cloudinary.uploader.add_tag(tags, [publicId]);
        
        res.status(200).json({
            message: 'Tags added successfully',
            publicId: publicId,
            tags: tags,
            result: result
        });
        
    } catch (error) {
        console.error('Add Tags Error:', error);
        res.status(500).json({ 
            error: 'Failed to add tags to image.',
            details: error.message 
        });
    }
});

// Remove tags from existing image
app.delete('/api/media/:publicId/tags', async (req, res) => {
    try {
        const { publicId } = req.params;
        const { tags } = req.body;
        
        if (!tags || !Array.isArray(tags)) {
            return res.status(400).json({ error: 'Tags array is required.' });
        }
        
        // Remove tags from the image
        const result = await cloudinary.uploader.remove_tag(tags, [publicId]);
        
        res.status(200).json({
            message: 'Tags removed successfully',
            publicId: publicId,
            tags: tags,
            result: result
        });
        
    } catch (error) {
        console.error('Remove Tags Error:', error);
        res.status(500).json({ 
            error: 'Failed to remove tags from image.',
            details: error.message 
        });
    }
});

// Delete an image
app.delete('/api/media/:publicId', async (req, res) => {
    try {
        const { publicId } = req.params;
        
        const result = await cloudinary.uploader.destroy(publicId);
        
        if (result.result === 'ok') {
            res.status(200).json({
                message: 'Image deleted successfully',
                publicId: publicId,
                result: result
            });
        } else {
            res.status(404).json({
                error: 'Image not found or could not be deleted',
                result: result
            });
        }
        
    } catch (error) {
        console.error('Delete Image Error:', error);
        res.status(500).json({ 
            error: 'Failed to delete image.',
            details: error.message 
        });
    }
});

// Get images by specific mood
app.get('/api/media/mood/:mood', async (req, res) => {
    try {
        const { mood } = req.params;
        const { userId, maxResults = 30 } = req.query;
        
        let expression = `resource_type:image AND tags=mood:${mood}`;
        
        if (userId) {
            expression += ` AND tags=user:${userId}`;
        }
        
        const result = await cloudinary.search
            .expression(expression)
            .max_results(parseInt(maxResults))
            .execute();
            
        res.status(200).json({
            mood: mood,
            total: result.total_count,
            media: result.resources.map(item => ({
                publicId: item.public_id,
                url: item.secure_url,
                format: item.format,
                tags: item.tags,
                createdAt: item.created_at
            }))
        });
        
    } catch (error) {
        console.error('Mood Filter Error:', error);
        res.status(500).json({ 
            error: 'Failed to filter media by mood.',
            details: error.message 
        });
    }
});

// Get images by specific interest
app.get('/api/media/interest/:interest', async (req, res) => {
    try {
        const { interest } = req.params;
        const { userId, maxResults = 30 } = req.query;
        
        let expression = `resource_type:image AND tags=interest:${interest}`;
        
        if (userId) {
            expression += ` AND tags=user:${userId}`;
        }
        
        const result = await cloudinary.search
            .expression(expression)
            .max_results(parseInt(maxResults))
            .execute();
            
        res.status(200).json({
            interest: interest,
            total: result.total_count,
            media: result.resources.map(item => ({
                publicId: item.public_id,
                url: item.secure_url,
                format: item.format,
                tags: item.tags,
                createdAt: item.created_at
            }))
        });
        
    } catch (error) {
        console.error('Interest Filter Error:', error);
        res.status(500).json({ 
            error: 'Failed to filter media by interest.',
            details: error.message 
        });
    }
});

// Get user's media with optional tag filtering
app.get('/api/user/:userId/media', async (req, res) => {
    try {
        const { userId } = req.params;
        const { tags, mood, interest, maxResults = 50 } = req.query;
        
        let expression = `resource_type:image AND tags=user:${userId}`;
        
        if (tags) {
            const tagArray = tags.split(',');
            tagArray.forEach(tag => {
                expression += ` AND tags=${tag}`;
            });
        }
        
        if (mood) {
            expression += ` AND tags=mood:${mood}`;
        }
        
        if (interest) {
            expression += ` AND tags=interest:${interest}`;
        }
        
        const result = await cloudinary.search
            .expression(expression)
            .max_results(parseInt(maxResults))
            .execute();
            
        res.status(200).json({
            userId: userId,
            total: result.total_count,
            media: result.resources.map(item => ({
                publicId: item.public_id,
                url: item.secure_url,
                format: item.format,
                tags: item.tags,
                createdAt: item.created_at
            }))
        });
        
    } catch (error) {
        console.error('User Media Fetch Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch user media.',
            details: error.message 
        });
    }
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`Access the API at http://localhost:${PORT}`);
    console.log(`Available endpoints:`);
    console.log(`  POST   /api/upload - Upload file with tags`);
    console.log(`  GET    /api/media - Filter media by tags/mood/interest`);
    console.log(`  GET    /api/tags - Get available tags`);
    console.log(`  POST   /api/media/:publicId/tags - Add tags to existing image`);
    console.log(`  DELETE /api/media/:publicId/tags - Remove tags from image`);
    console.log(`  DELETE /api/media/:publicId - Delete image`);
    console.log(`  GET    /api/media/mood/:mood - Get images by mood`);
    console.log(`  GET    /api/media/interest/:interest - Get images by interest`);
    console.log(`  GET    /api/user/:userId/media - Get user's media`);
});
