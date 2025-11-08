/**
 * UniConnectSphere Server
 * -----------------------
 * Runs an Express server that serves static HTML pages
 * and adds security + CSP headers for Firebase and Tailwind.
 */

import express from "express";
import path from "path";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Correct fix for __dirname and __filename in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- MIDDLEWARE SETUP ---

// Basic security headers (disable Helmet's default CSP because we set our own)
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// Enable CORS and gzip compression
app.use(cors());
app.use(compression());

// --- CUSTOM CONTENT SECURITY POLICY (CSP) ---
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy", // ✅ fixed typo ("Content-Scurity-Policy" → correct spelling)
    [
      "default-src 'self' data: blob: https:;",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://www.gstatic.com https://www.googleapis.com;",
      "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com https://cdnjs.cloudflare.com;",
      "connect-src 'self' https://firestore.googleapis.com https://www.googleapis.com https://www.gstatic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com https://firebaseinstallations.googleapis.com https://firebase.googleapis.com https://accounts.google.com https://apis.google.com;",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com;",
      "img-src 'self' data: blob: https:;",
    ].join(" ")
  );
  next();
});

// --- EXPRESS CONFIG ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static files (HTML, CSS, JS) from the current directory
app.use(express.static(__dirname));

// --- ROUTES ---
const pages = [
  "index",
  "legal",
  "platform",
  "support",
  "login",
  "register",
  "dashboard",
  "profile",
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
  });
});

// --- START SERVER ---
app.listen(PORT, "0.0.0.0", () => {
  console.log(`
🚀 UniConnectSphere Server Started!
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || "development"}

📄 Available Pages:
   • Home:      http://localhost:${PORT}/
   • Legal:     http://localhost:${PORT}/legal
   • Platform:  http://localhost:${PORT}/platform
   • Support:   http://localhost:${PORT}/support

❤  Health Check: http://localhost:${PORT}/health
`);
});