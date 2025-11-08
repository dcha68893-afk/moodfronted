/**
 * UniConnectSphere Server
 * -----------------------
 * Runs an Express server that serves static HTML pages
 * and adds security + CSP headers for Firebase and Tailwind.
 * Includes secure Cloudinary upload with server-side signing.
 */

import express from "express";
import path from "path";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "url";
import crypto from "crypto";
import multer from "multer";
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Load environment variables
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Correct fix for __dirname and __filename in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CLOUDINARY CONFIGURATION ---
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Validate Cloudinary configuration
const isCloudinaryConfigured = !!process.env.CLOUDINARY_CLOUD_NAME && 
                               process.env.CLOUDINARY_CLOUD_NAME !== 'your_actual_cloud_name';

if (!isCloudinaryConfigured) {
  console.warn('⚠️  Cloudinary not properly configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.');
} else {
  console.log('✅ Cloudinary configured successfully');
}

// --- RATE LIMITING ---
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Limit each IP to 50 upload requests per windowMs
  message: {
    success: false,
    error: 'Too many upload attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later.'
  }
});

// --- MIDDLEWARE SETUP ---

// Basic security headers (disable Helmet's default CSP because we set our own)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);

// Enable CORS and gzip compression
app.use(cors());
app.use(compression());

// --- CUSTOM CONTENT SECURITY POLICY (CSP) ---
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self' data: blob: https:;",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://www.gstatic.com https://www.googleapis.com;",
      "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com https://cdnjs.cloudflare.com;",
      "connect-src 'self' https://firestore.googleapis.com https://www.googleapis.com https://www.gstatic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com https://firebaseinstallations.googleapis.com https://firebase.googleapis.com https://accounts.google.com https://apis.google.com https://api.cloudinary.com;",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com;",
      "img-src 'self' data: blob: https: res.cloudinary.com;",
      "media-src 'self' blob: https: res.cloudinary.com;",
      "frame-src 'self' https://cloudinary.com;"
    ].join(" ")
  );
  next();
});

// --- EXPRESS CONFIG ---
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ✅ Serve static files (HTML, CSS, JS) from the current directory
app.use(express.static(__dirname));

// --- CLOUDINARY ROUTES ---

/**
 * Generate secure signature for Cloudinary upload
 */
function generateSignature(params) {
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { ...params, timestamp },
    cloudinary.config().api_secret
  );
  
  return { signature, timestamp };
}

/**
 * POST /api/cloudinary/sign-upload
 * Securely signs upload requests from the client
 * This prevents exposing API secret to the client
 */
app.post('/api/cloudinary/sign-upload', uploadLimiter, (req, res) => {
  try {
    const { filename, fileType, fileSize } = req.body;
    
    // Validate request
    if (!filename || !fileType) {
      return res.status(400).json({
        success: false,
        error: 'Filename and fileType are required'
      });
    }

    // Validate file size (10MB limit)
    const maxSize = 10 * 1024 * 1024;
    if (fileSize > maxSize) {
      return res.status(400).json({
        success: false,
        error: `File size too large. Maximum: 10MB`
      });
    }

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/mov', 'video/avi', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain'
    ];

    if (!allowedTypes.includes(fileType)) {
      return res.status(400).json({
        success: false,
        error: 'File type not allowed. Please upload images, videos, audio, PDF, or document files.'
      });
    }

    // Determine resource type
    let resourceType = 'auto';
    if (fileType.startsWith('image/')) resourceType = 'image';
    else if (fileType.startsWith('video/')) resourceType = 'video';
    else if (fileType.startsWith('audio/')) resourceType = 'video'; // Cloudinary treats audio as video
    else resourceType = 'raw';

    // Generate unique public ID
    const publicId = `uniconnect/${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    
    // Upload parameters
    const uploadParams = {
      public_id: publicId,
      resource_type: resourceType,
      folder: 'uniconnect',
      tags: ['uniconnect', 'user_upload'],
      context: `filename=${filename}|uploaded_from=uniconnect_app`,
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'mov', 'avi', 'webm', 'pdf', 'doc', 'docx', 'xlsx', 'pptx', 'txt']
    };

    // Generate signature
    const { signature, timestamp } = generateSignature(uploadParams);

    // Return signed parameters to client
    res.json({
      success: true,
      params: {
        ...uploadParams,
        signature,
        timestamp,
        api_key: cloudinary.config().api_key
      },
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudinary.config().cloud_name}/${resourceType}/upload`
    });

  } catch (error) {
    console.error('❌ Cloudinary signing error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during upload signing'
    });
  }
});

/**
 * POST /api/cloudinary/verify-upload
 * Verifies that an upload was successful and legitimate
 */
app.post('/api/cloudinary/verify-upload', apiLimiter, async (req, res) => {
  try {
    const { publicId, signature, version } = req.body;

    if (!publicId || !signature || !version) {
      return res.status(400).json({
        success: false,
        error: 'Missing required verification parameters'
      });
    }

    // Verify the signature matches what we expect
    const expectedSignature = cloudinary.utils.api_sign_request(
      { public_id: publicId, version },
      cloudinary.config().api_secret
    );

    if (expectedSignature !== signature) {
      return res.status(400).json({
        success: false,
        error: 'Invalid upload signature'
      });
    }

    // Get resource info from Cloudinary to verify upload
    const result = await cloudinary.api.resource(publicId, {
      resource_type: 'auto'
    });

    res.json({
      success: true,
      verified: true,
      resource: {
        public_id: result.public_id,
        format: result.format,
        resource_type: result.resource_type,
        bytes: result.bytes,
        created_at: result.created_at,
        secure_url: result.secure_url,
        width: result.width,
        height: result.height,
        duration: result.duration
      }
    });

  } catch (error) {
    console.error('❌ Cloudinary verification error:', error);
    
    if (error.error && error.error.message === 'Resource not found') {
      return res.status(404).json({
        success: false,
        error: 'Uploaded resource not found'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error during upload verification'
    });
  }
});

/**
 * POST /api/cloudinary/direct-upload
 * Alternative: Direct server-side upload (more secure but less efficient for large files)
 */
const multerStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'uniconnect/direct',
    resource_type: 'auto',
    tags: ['uniconnect', 'direct_upload'],
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'mp4', 'mov', 'avi', 'webm', 'pdf', 'doc', 'docx', 'xlsx', 'pptx', 'txt']
  },
});

const upload = multer({ 
  storage: multerStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/mov', 'video/avi', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/x-m4a',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: images, videos, audio, PDF, and documents.'), false);
    }
  }
});

app.post('/api/cloudinary/direct-upload', uploadLimiter, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    res.json({
      success: true,
      message: 'File uploaded successfully via direct upload',
      file: {
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      cloudinary: {
        public_id: req.file.filename,
        url: req.file.path,
        secure_url: req.file.path.replace('http://', 'https://'),
        resource_type: req.file.resource_type,
        format: req.file.format,
        bytes: req.file.size
      }
    });

  } catch (error) {
    console.error('❌ Direct upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Upload failed: ' + error.message
    });
  }
});

/**
 * DELETE /api/cloudinary/delete-asset
 * Securely delete assets from Cloudinary (admin only)
 */
app.delete('/api/cloudinary/delete-asset', apiLimiter, async (req, res) => {
  try {
    const { publicId, resourceType = 'image' } = req.body;

    if (!publicId) {
      return res.status(400).json({
        success: false,
        error: 'publicId is required'
      });
    }

    // Basic security check - in production, add proper authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required for delete operations'
      });
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true // Remove from CDN cache
    });

    if (result.result === 'ok') {
      res.json({
        success: true,
        message: 'Asset deleted successfully',
        result: result
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'Failed to delete asset: ' + result.result
      });
    }

  } catch (error) {
    console.error('❌ Cloudinary delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error during asset deletion'
    });
  }
});

/**
 * GET /api/cloudinary/resources
 * List uploaded resources (with basic pagination)
 */
app.get('/api/cloudinary/resources', apiLimiter, async (req, res) => {
  try {
    const { type = 'upload', max_results = 20, next_cursor } = req.query;

    const result = await cloudinary.api.resources({
      type: type,
      max_results: parseInt(max_results),
      next_cursor: next_cursor,
      resource_type: 'image' // Can be extended to other types
    });

    res.json({
      success: true,
      resources: result.resources,
      next_cursor: result.next_cursor,
      total_count: result.resources.length
    });

  } catch (error) {
    console.error('❌ Cloudinary resources error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resources'
    });
  }
});

// --- EXISTING ROUTES ---
const pages = [
  "index",
  "legal",
  "platform",
  "support",
  "login",
  "register",
  "dashboard",
  "profile",
  "upload", // Add upload page to served pages
  "marketplace",
  "chat",
  "games",
  "payment",
  "notifications",
  "settings",
  "forgot-password"
];

pages.forEach((page) => {
  app.get(`/${page === "index" ? "" : page}`, (req, res) => {
    res.sendFile(path.join(__dirname, `${page}.html`));
  });
});

// Health-check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    message: "UniConnectSphere server running fine",
    cloudinary: isCloudinaryConfigured ? "Configured" : "Not Configured",
    services: {
      cloudinary: isCloudinaryConfigured,
      upload: true,
      rate_limiting: true
    },
    environment: process.env.NODE_ENV || 'development'
  });
});

// Cloudinary status endpoint
app.get("/api/cloudinary/status", apiLimiter, (req, res) => {
  res.json({
    configured: isCloudinaryConfigured,
    cloud_name: isCloudinaryConfigured ? cloudinary.config().cloud_name : 'Not set',
    upload_methods: ['signed-client-upload', 'direct-server-upload'],
    max_file_size: '10MB',
    allowed_formats: ['images', 'videos', 'audio', 'PDF', 'documents', 'text']
  });
});

// Root endpoint with server info
app.get("/api", (req, res) => {
  res.json({
    name: "UniConnectSphere API",
    version: "1.0.3",
    description: "Social media and chat platform API",
    endpoints: {
      health: "/health",
      cloudinary: {
        sign_upload: "POST /api/cloudinary/sign-upload",
        verify_upload: "POST /api/cloudinary/verify-upload",
        direct_upload: "POST /api/cloudinary/direct-upload",
        status: "GET /api/cloudinary/status",
        resources: "GET /api/cloudinary/resources",
        delete: "DELETE /api/cloudinary/delete-asset"
      }
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Server Error:', error);
  
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File too large. Maximum size is 10MB.'
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        error: 'Unexpected file field.'
      });
    }
  }
  
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found'
  });
});

// 404 handler for HTML routes - serve index.html for SPA routing
app.use((req, res) => {
  if (req.accepts('html')) {
    res.sendFile(path.join(__dirname, 'index.html'));
  } else {
    res.status(404).json({
      success: false,
      error: 'Endpoint not found'
    });
  }
});

// --- START SERVER ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
🚀 UniConnectSphere Server Started!
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || "development"}
☁️  Cloudinary: ${isCloudinaryConfigured ? '✅ Configured' : '❌ Not Configured'}
🛡️  Rate Limiting: ✅ Enabled

📄 Available Pages:
   • Home:          http://localhost:${PORT}/
   • Legal:         http://localhost:${PORT}/legal
   • Platform:      http://localhost:${PORT}/platform
   • Support:       http://localhost:${PORT}/support
   • Upload:        http://localhost:${PORT}/upload
   • Dashboard:     http://localhost:${PORT}/dashboard
   • Chat:          http://localhost:${PORT}/chat

🔐 Cloudinary Endpoints:
   • Sign Upload:   POST http://localhost:${PORT}/api/cloudinary/sign-upload
   • Verify Upload: POST http://localhost:${PORT}/api/cloudinary/verify-upload
   • Direct Upload: POST http://localhost:${PORT}/api/cloudinary/direct-upload
   • Status:        GET  http://localhost:${PORT}/api/cloudinary/status
   • Resources:     GET  http://localhost:${PORT}/api/cloudinary/resources
   • Delete:        DELETE http://localhost:${PORT}/api/cloudinary/delete-asset

📊 API Info:        http://localhost:${PORT}/api
❤  Health Check:    http://localhost:${PORT}/health

💡 Upload Test:     http://localhost:${PORT}/upload
`);
});