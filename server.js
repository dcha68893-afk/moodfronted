const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
// ✅ Allow external CDNs for Firebase, Tailwind, and Font Awesome
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self' data: https:; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://www.gstatic.com https://www.googleapis.com; " +
    "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://fonts.googleapis.com; " +
    "connect-src 'self' https://firestore.googleapis.com https://www.googleapis.com https://www.gstatic.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebasestorage.googleapis.com https://firebaseinstallations.googleapis.com https://firebase.googleapis.com https://accounts.google.com https://apis.google.com; " +
    "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; " +
    "img-src 'self' data: https:;"
  );
  next();
});
// Serve static files from the same directory
app.use(express.static(__dirname));

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
});

// Routes for all your HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/legal', (req, res) => {
    res.sendFile(path.join(__dirname, 'legal.html'));
});

app.get('/platform', (req, res) => {
    res.sendFile(path.join(__dirname, 'platform.html'));
});

app.get('/support', (req, res) => {
    res.sendFile(path.join(__dirname, 'support.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'register.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/profile', (req, res) => {
    res.sendFile(path.join(__dirname, 'profile.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        message: 'UniConnect server is running smoothly'
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 UniConnect Server Started!
📍 Port: ${PORT}
🌐 Environment: ${process.env.NODE_ENV || 'development'}

📄 Available Pages:
   • Home: http://localhost:${PORT}/
   • Legal: http://localhost:${PORT}/legal
   • Platform: http://localhost:${PORT}/platform
   • Support: http://localhost:${PORT}/support

❤️  Health Check: http://localhost:${PORT}/health
    `);
});

module.exports = app;