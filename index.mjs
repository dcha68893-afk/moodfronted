// PRODUCTION CLOUDINARY SERVER - OPTIMIZED & SECURE
console.log('🚀 Starting Cloudinary Upload Server...');

// 1. Load environment
import dotenv from 'dotenv';
dotenv.config();
console.log('✅ Environment loaded');

// 2. Load dependencies
import express from 'express';
import compression from 'compression';
import multer from 'multer';
import fs from 'fs';
import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

console.log('✅ Express loaded');

// 3. Validate required environment variables
const requiredEnvVars = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY', 
  'CLOUDINARY_API_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  process.exit(1);
}

// 4. Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
console.log('✅ Cloudinary configured');

// 5. Security & Optimization Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files with caching
app.use(express.static(process.cwd(), { 
  maxAge: '7d', 
  etag: true,
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

console.log('✅ Security & optimization middleware setup');

// 6. Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 uploads per windowMs
  message: {
    error: 'Too many upload attempts',
    message: 'Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'Please try again later.'
  }
});

// 7. Multer configuration with security
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '_');
    cb(null, `${Date.now()}-${sanitizedName}`);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow images, videos, and audio files
  const allowedMimes = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/webm',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1 // Single file upload
  }
});

// 8. Concurrent upload management
let currentUploads = 0;
const MAX_CONCURRENT_UPLOADS = 3;

// 9. Utility functions
const cleanupFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.warn('⚠️ Could not delete temporary file:', filePath);
    }
  }
};

const validateFile = (file) => {
  if (!file) {
    throw new Error('No file provided');
  }

  // Check file size (already handled by multer, but double-check)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File size exceeds 10MB limit');
  }

  return true;
};

// 10. Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
});

// API status endpoint
app.get('/api', apiLimiter, (req, res) => {
  res.json({
    message: 'Cloudinary Upload Server is running! 🎉',
    status: 'OK',
    version: '1.0.0',
    endpoints: [
      'GET  /health',
      'GET  /api',
      'POST /upload'
    ],
    limits: {
      fileSize: '10MB',
      concurrentUploads: MAX_CONCURRENT_UPLOADS,
      rateLimit: '50 uploads per 15 minutes'
    }
  });
});

// Health check endpoint
app.get('/health', apiLimiter, (req, res) => {
  res.json({ 
    status: 'healthy',
    server: 'running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    currentUploads: currentUploads,
    maxConcurrentUploads: MAX_CONCURRENT_UPLOADS,
    cloudinary: {
      configured: !!process.env.CLOUDINARY_CLOUD_NAME,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME ? '***' + process.env.CLOUDINARY_CLOUD_NAME.slice(-4) : 'not set'
    }
  });
});

// Main upload endpoint
app.post('/upload', uploadLimiter, upload.single('file'), async (req, res) => {
  // Check concurrent upload limit
  if (currentUploads >= MAX_CONCURRENT_UPLOADS) {
    return res.status(429).json({ 
      error: 'Server busy', 
      message: 'Too many concurrent uploads. Please try again in a moment.' 
    });
  }

  currentUploads++;
  let filePath = req.file?.path;

  try {
    // Validate file
    validateFile(req.file);

    console.log(`📤 Uploading file: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)}MB)`);
    console.log(`   Active uploads: ${currentUploads}/${MAX_CONCURRENT_UPLOADS}`);
    
    // Determine resource type based on MIME type
    let resourceType = 'auto';
    if (req.file.mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else if (req.file.mimetype.startsWith('video/')) {
      resourceType = 'video';
    } else if (req.file.mimetype.startsWith('audio/')) {
      resourceType = 'video'; // Cloudinary treats audio as video
    }

    // Upload to Cloudinary with optimization
    const uploadOptions = {
      resource_type: resourceType,
      folder: 'user_uploads',
      transformation: [
        { quality: 'auto', fetch_format: 'auto' }
      ],
      timeout: 30000 // 30 second timeout
    };

    const result = await cloudinary.uploader.upload(req.file.path, uploadOptions);

    // Clean up local file
    cleanupFile(filePath);
    filePath = null;

    console.log('✅ File uploaded to Cloudinary successfully');
    console.log(`   URL: ${result.secure_url}`);
    console.log(`   Size: ${(result.bytes / 1024 / 1024).toFixed(2)}MB`);
    
    res.json({
      success: true,
      message: 'File uploaded successfully!',
      file: {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      cloudinary: {
        url: result.secure_url,
        public_id: result.public_id,
        format: result.format,
        resource_type: result.resource_type,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        duration: result.duration,
        folder: result.folder
      },
      uploadInfo: {
        timestamp: new Date().toISOString(),
        uploadId: `upload_${Date.now()}`
      }
    });

  } catch (error) {
    console.error('❌ Upload error:', error.message);
    
    // Clean up file if it exists
    cleanupFile(filePath);
    
    let statusCode = 500;
    let errorMessage = 'Upload failed';

    if (error.message.includes('File size')) {
      statusCode = 413;
      errorMessage = 'File too large';
    } else if (error.message.includes('File type')) {
      statusCode = 415;
      errorMessage = 'File type not supported';
    } else if (error.message.includes('timeout')) {
      statusCode = 504;
      errorMessage = 'Upload timeout';
    }

    res.status(statusCode).json({ 
      success: false,
      error: errorMessage, 
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    currentUploads--;
  }
});

// 11. Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        error: 'File too large',
        message: 'File size exceeds 10MB limit'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        error: 'Too many files',
        message: 'Only one file allowed per upload'
      });
    }
  }

  console.error('❌ Server error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    message: `Route ${req.originalUrl} does not exist`
  });
});

// 12. Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  // Prevent new connections
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    // Clean up any remaining temporary files
    const uploadDir = 'uploads/';
    if (fs.existsSync(uploadDir)) {
      fs.readdirSync(uploadDir).forEach(file => {
        const filePath = path.join(uploadDir, file);
        cleanupFile(filePath);
      });
    }
    
    console.log('✅ Temporary files cleaned up');
    console.log('👋 Server shutdown complete');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.log('⚠️ Forcing shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// 13. Start server
const server = app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🎉 CLOUDINARY UPLOAD SERVER RUNNING SUCCESSFULLY!');
  console.log('='.repeat(60));
  console.log(`📍 Local:    http://localhost:${PORT}`);
  console.log(`📍 Network:  http://127.0.0.1:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(60));
  console.log('📋 Available endpoints:');
  console.log(`   🌐 http://localhost:${PORT}/ (Upload Page)`);
  console.log(`   🌐 http://localhost:${PORT}/api (API Status)`);
  console.log(`   ❤️  http://localhost:${PORT}/health (Health Check)`);
  console.log(`   📤 POST http://localhost:${PORT}/upload (File Upload)`);
  console.log('='.repeat(60));
  console.log('🛡️  Features:');
  console.log('   • Rate Limiting');
  console.log('   • File Type Validation');
  console.log('   • Size Limits (10MB)');
  console.log('   • Concurrent Upload Control');
  console.log('   • Security Headers');
  console.log('   • CORS Protection');
  console.log('   • Compression & Caching');
  console.log('='.repeat(60));
  console.log('⏹️  Press Ctrl + C to stop the server');
  console.log('='.repeat(60));
});

// 14. Process event handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;