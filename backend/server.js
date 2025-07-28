const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const generatePortfolio = require('./api/generate');
const cleanup = require('./api/cleanup');
const generateCV = require('./api/generate-cv');
const generateCoverLetter = require('./api/generate-coverletter');

dotenv.config();

const app = express();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL || 'https://theidealcareerprogenerator.netlify.app' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.post('/api/generate', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'cv', maxCount: 1 },
  { name: 'portfolio', maxCount: 1 }
]), generatePortfolio);

app.post('/api/cleanup', cleanup);

app.post('/api/generate-cv', upload.single('cv'), generateCV);

app.post('/api/generate-coverletter', upload.single('coverletter'), generateCoverLetter);

// Health check
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err.message, err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
