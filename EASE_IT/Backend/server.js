const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');

if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

// Import API routes
const authRoutes = require('./routes/auth');
const healthDataRoutes = require('./routes/healthData');
const chatbotRoutes = require('./routes/chatRoutes');
const ocrRoutes = require('./routes/ocrRoutes'); // OCR route

const app = express();
const PORT = process.env.PORT || 10000;
const DB_URI = process.env.DB_URI;

// ✅ Environment Variable Validation
const requiredEnv = ['DB_URI', 'JWT_SECRET', 'GEMINI_API_KEY'];
const missingEnv = requiredEnv.filter(env => !process.env[env]);

if (missingEnv.length > 0) {
  console.error(`❌ CRITICAL ERROR: Missing environment variables: ${missingEnv.join(', ')}`);
  console.error('The application will now exit to prevent insecure or broken operation.');
  process.exit(1);
}

let cachedDbConnection = null;

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});

// Middleware
const allowedOrigin = process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? false : 'http://localhost:10000');
app.use(cors({ origin: allowedOrigin, credentials: true }));
app.use(express.json({ limit: process.env.JSON_LIMIT || '8mb' }));
app.use(express.urlencoded({ limit: process.env.JSON_LIMIT || '8mb', extended: true }));

// Debug Logging Middleware (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`📌 ${req.method} Request to ${req.url}`);
    next();
  });
}

// Connect to MongoDB
async function connectToDatabase() {
  if (!DB_URI) {
    throw new Error('Missing DB_URI environment variable');
  }

  if (cachedDbConnection && mongoose.connection.readyState === 1) {
    return cachedDbConnection;
  }

  cachedDbConnection = mongoose.connect(DB_URI);
  await cachedDbConnection;
  console.log('✅ Connected to MongoDB!');
  return cachedDbConnection;
}

const databaseMiddleware = async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    res.status(500).json({ error: 'Database connection failed' });
  }
};

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../public')));

// Default route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/html/index.html'));
});

// Mount API routes
app.use('/api', databaseMiddleware);
app.use('/api/auth', authRoutes);
app.use('/api/healthdata', healthDataRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/ocr', ocrRoutes);



// Start the server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
  });
}

module.exports = app;


