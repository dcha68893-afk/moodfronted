// SIMPLE CLOUDINARY SERVER - OPTIMIZED & GUARANTEED TO WORK
console.log('🚀 Starting Cloudinary Upload Server...');

// 1. Load environment
import dotenv from 'dotenv';
dotenv.config();
console.log('✅ Environment loaded');

// 2. Load express and other dependencies
import express from 'express';
import compression from 'compression';
import multer from 'multer';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;

console.log('✅ Express loaded');

// 3. Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
console.log('✅ Cloudinary configured');

// 4. Enhanced middleware with optimization
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(compression()); // ✅ Gzip compression
app.use(express.static(process.cwd(), { maxAge: '7d', etag: true })); // ✅ Caching static files
console.log('✅ Middleware setup with optimization');

// 5. Multer setup for file uploads
const upload = multer({ dest: 'uploads/' });

// 6. ✅ Limit concurrent uploads to avoid CPU overload
let currentUploads = 0;
const MAX_UPLOADS = 5;

// 7. Routes
// Serve HTML page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

// API endpoints
app.get('/api', (req, res) => {
  res.json({
    message: 'Cloudinary Server is running! 🎉',
    status: 'OK',
    endpoints: [
      'GET  /health',
      'GET  /test',
      'POST /upload (with Cloudinary!)'
    ]
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    server: 'running',
    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME,
    timestamp: new Date().toISOString(),
    currentUploads: currentUploads,
    maxUploads: MAX_UPLOADS
  });
});

app.get('/test', (req, res) => {
  res.json({ message: 'Test successful! Server is working!' });
});

// 8. ENHANCED Cloudinary upload route with optimization
app.post('/upload', upload.single('file'), async (req, res) => {
  // Check concurrent upload limit
  if (currentUploads >= MAX_UPLOADS) {
    return res.status(429).json({ 
      error: 'Too many uploads', 
      message: 'Server is busy. Please try again in a moment.' 
    });
  }

  currentUploads++;
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`📤 Uploading file: ${req.file.originalname} (Active uploads: ${currentUploads}/${MAX_UPLOADS})`);
    
    // Upload to Cloudinary with optimization
    const result = await cloudinary.uploader.upload(req.file.path, {
      resource_type: 'auto',
      folder: 'user_uploads', // ✅ Organized storage
      transformation: [{ quality: 'auto', fetch_format: 'auto' }] // ✅ Auto optimize
    });

    // Clean up local file
    fs.unlinkSync(req.file.path);

    console.log('✅ File uploaded to Cloudinary successfully');
    
    res.json({
      success: true,
      message: 'File uploaded to Cloudinary successfully!',
      file: {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      cloudinary: {
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        folder: result.folder
      }
    });

  } catch (error) {
    console.error('❌ Upload error:', error);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      error: 'Upload failed', 
      details: error.message 
    });
  } finally {
    currentUploads--;
  }
});

console.log('✅ Routes setup');

// 9. Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🎉 CLOUDINARY UPLOAD SERVER RUNNING SUCCESSFULLY!');
  console.log('='.repeat(60));
  console.log(`📍 Local:    http://localhost:${PORT}`);
  console.log(`📍 Network:  http://127.0.0.1:${PORT}`);
  console.log('='.repeat(60));
  console.log('📋 Test these endpoints:');
  console.log(`   🌐 http://localhost:${PORT}/ (HTML Upload Page)`);
  console.log(`   🌐 http://localhost:${PORT}/api (API Status)`);
  console.log(`   ❤️  http://localhost:${PORT}/health`);
  console.log(`   🧪 http://localhost:${PORT}/test`);
  console.log(`   📤 POST http://localhost:${PORT}/upload`);
  console.log('='.repeat(60));
  console.log('⚡ Features: Compression, Caching, Concurrent Limit, Auto-Optimization');
  console.log('='.repeat(60));
  console.log('⏹️  Press Ctrl + C to stop the server');
  console.log('='.repeat(60));
});

// 10. Handle errors
process.on('uncaughtException', (error) => {
  console.log('❌ Uncaught Exception:', error.message);
});

process.on('unhandledRejection', (reason, promise) => {
  console.log('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});