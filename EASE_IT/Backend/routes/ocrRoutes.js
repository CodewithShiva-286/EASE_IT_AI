const express = require('express');
const { analyzeOCR } = require('../controllers/ocrController');
const authMiddleware = require('../middleware/authMiddleware');
const rateLimiter = require('../middleware/rateLimiter');
const router = express.Router();

const ocrLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 30, message: 'Too many scan requests. Please try again later.' });

// OCR Analysis Route
router.post('/analyze', authMiddleware, ocrLimiter, async (req, res) => {
    try {
        const response = await analyzeOCR(req.body);
        res.json({ response });
    } catch (error) {
        console.error("❌ OCR Processing Error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
