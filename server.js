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
const PORT = process.env.PORT || 3000;

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
      return res
        .status(400)
        .json({ success: false, error: "Missing filename or type" });
    }

    const maxSize = 10 * 1024 * 1024;
    if (fileSize > maxSize) {
      return res.status(400).json({
        success: false,
        error: "Max file size is 10MB",
      });
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

    res.json({
      success: true,
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
    res.status(500).json({ success: false, error: "Server error" });
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
        return res
          .status(400)
          .json({ success: false, error: "No file uploaded" });
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

      res.json({
        success: true,
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
      res.status(500).json({ success: false, error: "Upload failed" });
    }
  }
);

// --- DELETE CLOUDINARY FILE ---
app.delete("/api/cloudinary/delete-asset", apiLimiter, async (req, res) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      return res
        .status(400)
        .json({ success: false, error: "publicId required" });
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
    });

    res.json({ success: true, result });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({ success: false, error: "Server error" });
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
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    cloudinary: isCloudinaryConfigured ? "Configured" : "Not Configured",
  });
});

// DEFAULT 404 HANDLERS
app.use("/api/*", (req, res) =>
  res.status(404).json({ success: false, error: "API not found" })
);

app.use((req, res) => {
  if (req.accepts("html")) res.sendFile(path.join(__dirname, "index.html"));
  else res.status(404).json({ success: false, error: "Not found" });
});

// START SERVER
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});