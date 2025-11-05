const express = require('express');
const app = express();
const PORT = 3000;

// Minimal route that ALWAYS works
app.get('/', (req, res) => {
  res.send('Hello World! Server is working!');
});

// Start server with maximum visibility
console.log('🔴 STARTING SERVER...');
console.log('🔴 Attempting to start on port:', PORT);

app.listen(PORT, () => {
  console.log('🟢 SUCCESS: Server started!');
  console.log('🟢 URL: http://localhost:' + PORT);
  console.log('🟢 Test it: curl http://localhost:' + PORT);
}).on('error', (error) => {
  console.log('🔴 FAILED: Could not start server');
  console.log('🔴 Error:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.log('🔴 Port 3000 is busy. Try:');
    console.log('   netstat -ano | findstr :3000  (Windows)');
    console.log('   lsof -i :3000                 (Mac/Linux)');
    console.log('   Or use: PORT=3001 node test-server.js');
  }
});