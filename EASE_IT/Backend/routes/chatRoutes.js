const express = require('express');
const { generateChatResponse } = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

router.post('/ask', authMiddleware, async (req, res) => {
    const { prompt, chatHistory, lastScanResult } = req.body;

    if (!prompt || typeof prompt !== 'string') {
        return res.status(400).json({ error: 'User prompt is required and must be a string' });
    }

    if (chatHistory && !Array.isArray(chatHistory)) {
        return res.status(400).json({ error: 'Chat history must be an array' });
    }

    if (chatHistory) {
        for (const entry of chatHistory) {
            if (!entry || typeof entry !== 'object' || typeof entry.user !== 'string' || typeof entry.bot !== 'string') {
                return res.status(400).json({ error: 'Invalid chat history entry format' });
            }
        }
    }

    if (lastScanResult && typeof lastScanResult !== 'string') {
        return res.status(400).json({ error: 'Last scan result must be a string' });
    }

    try {
        const response = await generateChatResponse({ prompt, chatHistory, lastScanResult, userId: req.user.userId });
        res.json({ response });
    } catch (error) {
        console.error("❌ Chatbot Error:", error);
        res.status(500).json({ error: 'Failed to generate response' });
    }
});

module.exports = router;














