/**
 * UniConnectSphere Server
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

// 🔥 FIXED: Use the correct import pattern for Cloudinary v1
import cloudinary from "cloudinary";

// Load environment variables
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 4000;

function sendSuccess(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function sendError(res, error, status = 500, extra = {}) {
  return res.status(status).json({ success: false, error, ...extra });
}

// Fix __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CLOUDINARY CONFIG ---
// Configure Cloudinary (v1 API)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured =
  !!process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_CLOUD_NAME !== "your_actual_cloud_name";

console.log(
  isCloudinaryConfigured
    ? "✅ Cloudinary configured successfully"
    : "⚠️ Cloudinary NOT fully configured"
);

// --- RATE LIMITING ---
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

// --- MIDDLEWARE ---
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

app.use(cors());
app.use(compression());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Serve static files
app.use(express.static(__dirname));

// --- CLOUDINARY SIGNATURE ---
function generateSignature(params) {
  const timestamp = Math.round(Date.now() / 1000);

  const signature = cloudinary.utils.api_sign_request(
    { ...params, timestamp },
    cloudinary.config().api_secret
  );

  return { signature, timestamp };
}

// --- SIGNED UPLOAD ---
app.post("/api/cloudinary/sign-upload", uploadLimiter, (req, res) => {
  try {
    const { filename, fileType, fileSize } = req.body;

    if (!filename || !fileType) {
      return sendError(res, "Missing filename or type", 400);
    }

    const maxSize = 10 * 1024 * 1024;
    if (fileSize > maxSize) {
      return sendError(res, "Max file size is 10MB", 400);
    }

    let resourceType = "auto";
    if (fileType.startsWith("image/")) resourceType = "image";
    else if (fileType.startsWith("video/")) resourceType = "video";
    else if (fileType.startsWith("audio/")) resourceType = "video";
    else resourceType = "raw";

    const publicId = `uniconnect/${Date.now()}_${crypto
      .randomBytes(8)
      .toString("hex")}`;

    const uploadParams = {
      public_id: publicId,
      resource_type: resourceType,
      folder: "uniconnect",
    };

    const { signature, timestamp } = generateSignature(uploadParams);

    sendSuccess(res, {
      params: {
        ...uploadParams,
        signature,
        timestamp,
        api_key: cloudinary.config().api_key,
      },
      uploadUrl: `https://api.cloudinary.com/v1_1/${
        cloudinary.config().cloud_name
      }/${resourceType}/upload`,
    });
  } catch (err) {
    console.error("❌ Signing error:", err);
    sendError(res, "Server error", 500);
  }
});

// --- DIRECT UPLOAD USING MULTER ---
// 🔥 FIXED: Use memory storage instead of CloudinaryStorage to avoid dependency issues
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.post(
  "/api/cloudinary/direct-upload",
  uploadLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return sendError(res, "No file uploaded", 400);
      }

      // Upload buffer directly to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: "uniconnect/direct",
            resource_type: "auto",
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        
        uploadStream.end(req.file.buffer);
      });

      sendSuccess(res, {
        file: {
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
        cloudinary: {
          url: uploadResult.secure_url,
          public_id: uploadResult.public_id,
        },
      });
    } catch (err) {
      console.error("❌ Upload error:", err);
      sendError(res, "Upload failed", 500);
    }
  }
);

// --- DELETE CLOUDINARY FILE ---
app.delete("/api/cloudinary/delete-asset", apiLimiter, async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return sendError(res, "publicId required", 400);
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
    });

    sendSuccess(res, { result });
  } catch (err) {
    console.error("❌ Delete error:", err);
    sendError(res, "Server error", 500);
  }
});

// --- BASIC PAGES ---
const pages = [
  "index",
  "legal",
  "platform",
  "support",
  "login",
  "register",
  "dashboard",
  "profile",
  "upload",
  "marketplace",
  "chat",
  "games",
  "payment",
  "notifications",
  "settings",
  "forgot-password",
];

pages.forEach((page) => {
  app.get(`/${page === "index" ? "" : page}`, (req, res) => {
    res.sendFile(path.join(__dirname, `${page}.html`));
  });
});

// HEALTH CHECK
app.get("/health", (req, res) => {
  sendSuccess(res, {
    status: "OK",
    timestamp: new Date().toISOString(),
    cloudinary: isCloudinaryConfigured ? "Configured" : "Not Configured",
  });
});

// DEFAULT 404 HANDLERS
app.use("/api/*", (req, res) =>
  sendError(res, "API not found", 404)
);

app.use((req, res) => {
  if (req.accepts("html")) res.sendFile(path.join(__dirname, "index.html"));
  else sendError(res, "Not found", 404);
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
