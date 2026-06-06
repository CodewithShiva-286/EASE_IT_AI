const User = require('../models/User');

const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';

exports.generateChatResponse = async ({ prompt, chatHistory, lastScanResult, userId }) => {
    try {
        // Fetch user health conditions
        const user = await User.findById(userId);
        if (!user) throw new Error('User not found');

        // Extract active health conditions
        const healthConditions = [];
        for (const category in user.healthData) {
            for (const condition in user.healthData[category]) {
                if (user.healthData[category][condition]) {
                    healthConditions.push(condition.replace(/([A-Z])/g, ' $1').trim());
                }
            }
        }
        const healthConditionsStr = healthConditions.length > 0 ? healthConditions.join(', ') : 'None';

        // Build conversation transcript
        const conversationTranscript = chatHistory ? chatHistory.map(entry => `User: ${entry.user}\nBot: ${entry.bot}`).join('\n\n') : '';

        const chatbotPrompt = `🌶️ **Namaste Foodie Dost!** 🍛
You're BawarchiBot - a funny Indian chef that:
1. Uses Hindi phrases naturally ("Arrey yaar!", "Nahi re!", "Wah!")
2. Explains food safety like friendly neighbor aunty
3. Suggests healthy+ tasty alternatives
4. Adds dad jokes/film references

**Format:**
- Start with Hindi phrase + emoji
- 2-line explanation with humor
- "Try ye karo:" recipe (3 ingredients max)
- "Chhota tip:" funny cooking tip
- No line numbers/markdown

**Example:**
"Arrey! Ye toh masala madness hai! 🌶️
Nahi yaar, isme milk hai (tumhara pet dard karega 😢)
Try ye karo: 🍚 Cauliflower biryani with coconut milk
Chhota tip: Mirch kam rakna, warna haath jal jaenge! 😜"

**Conversation History:**
${conversationTranscript}

**Current Context:**
${lastScanResult || 'No scan data'}
Health Issues: ${healthConditionsStr}

**User Query:** "${prompt}"
BawarchiBot Response:`;

        if (!API_KEY) {
            throw new Error('GEMINI_API_KEY is missing from environment variables.');
        }

        if (typeof globalThis.fetch !== 'function') {
            throw new Error('fetch is not available in this Node.js runtime.');
        }

        const response = await globalThis.fetch(`${API_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: chatbotPrompt }]
                }],
                generationConfig: {
                    temperature: 0.9
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API request failed with status ${response.status}`);
        }

        const data = await response.json();

        if (!data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            throw new Error('Invalid response structure from API');
        }

        return data.candidates[0].content.parts[0].text;

    } catch (error) {
        console.error("Error in generateChatResponse:", error);
        return "Arrey! Kuch technical gadbad hai. Thoda wait karo phir try karo! 🤖⚡";
    }
};
