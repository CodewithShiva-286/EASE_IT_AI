const Tesseract = require('tesseract.js');

// Helper function for retrying API calls with exponential backoff
async function retryFetch(url, options, maxRetries = 3, baseDelay = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await globalThis.fetch(url, options);
            if (response.ok || response.status < 500) {
                // Success or client error (4xx) - don't retry
                return response;
            }
            // Server error (5xx) - retry
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff
                console.log(`🔄 Retrying API call in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            return response; // Return the failed response after max retries
        } catch (error) {
            lastError = error;
            if (attempt < maxRetries) {
                const delay = baseDelay * Math.pow(2, attempt);
                console.log(`🔄 Retrying API call after error in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
        }
    }
    throw lastError;
}

// Helper function to sanitize input
function sanitizeInput(input) {
    if (!input) return '';
    return input.toString().trim().replace(/[\x00-\x1F\x7F-\x9F]/g, '').substring(0, 500); // Max 500 chars, strip control chars
}

function safeErrorMessage(error) {
    if (error.name === 'AbortError') {
        return 'AI analysis timed out after 60 seconds. The service may be busy. Please try again in a few minutes.';
    }

    if (error.message.includes('GEMINI_API_KEY')) {
        return 'Gemini API key is missing on the server.';
    }

    if (error.message.includes('AI service request failed with status 503')) {
        return 'AI service is currently experiencing high demand. Please try again in a few moments.';
    }

    if (error.message.includes('AI service request failed')) {
        return error.message;
    }

    if (error.message.includes('fetch is not available')) {
        return 'Server fetch support is unavailable. Use Node.js 18 or newer.';
    }

    if (error.message.includes('Missing imageSrc')) {
        return 'No image was received by the OCR service.';
    }

    return 'OCR analysis failed before completion. Check the server logs for details.';
}

exports.analyzeOCR = async ({ imageSrc, healthConditions }) => {
    console.log("📌 Received OCR request");

    try {
        if (!imageSrc) throw new Error("Missing imageSrc in request.");

        // Ensure imageSrc is a base64 data URI to prevent SSRF or local file read attacks via Tesseract
        if (typeof imageSrc !== 'string' || !imageSrc.startsWith('data:image/')) {
            throw new Error("Invalid image format. Only base64 data:image/... URIs are permitted.");
        }

        // ✅ Perform OCR using Tesseract.js
        console.log("🔄 Processing OCR...");
        const { data: { text } } = await Tesseract.recognize(imageSrc, 'eng', {
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,() -:',
        });

        console.log("📌 Extracted Text (Raw):", text);

        // ✅ Clean extracted text
        let cleanedText = text.replace(/[^a-zA-Z0-9\s,():-]/g, ''); // Strict cleaning
        console.log("📌 Cleaned Extracted Text:", cleanedText);

        // ✅ Extract ingredients (Improved regex)
        let ingredients = "";
        const match = cleanedText.match(/ingredients?[:\s-](.*)/i); // More flexible regex

        if (match) ingredients = match[1].trim();

        // ✅ Extract additional lines to ensure full ingredient list
        let lines = cleanedText.split("\n");
        let startIndex = lines.findIndex(line => line.toLowerCase().includes("ingredients"));

        if (startIndex !== -1) {
            ingredients = lines.slice(startIndex, startIndex + 15).join(" "); // Extract more lines
        }

        // ✅ Ensure meaningful ingredient data
        const validWords = ingredients.split(/\s+/).filter(word => word.length > 2);
        if (!ingredients || validWords.length < 5) {
            console.log("⚠️ Extracted ingredients are too short:", ingredients);
            return "⚠️ OCR detected text, but the ingredients list is incomplete. Please upload a clearer image.";
        }

        console.log("📌 Final Extracted Ingredients:", ingredients);

        // Sanitize inputs
        const sanitizedHealthConditions = sanitizeInput(healthConditions);
        const sanitizedIngredients = sanitizeInput(ingredients);

        // ✅ Build AI analysis prompt
        const analysisPrompt = `User Health Conditions: ${sanitizedHealthConditions || "None"}
Detected Ingredients: ${sanitizedIngredients}

Generate response in EXACTLY 4 lines:
 Hindi phrase + emoji (safe/unsafe)\n
 Explanation if unsafe in 2-3 lines/Food joke if safe\n
 "Caution:" + All harmful ingredients (user-specific + general)

**Examples:**

Unsafe:
"Arrey! Ye toh danger hai! 💀
Contains peanuts  (allergy alert!) 
Caution: ⚠️Peanut, ⚠️Palm Oil, ⚠️Added Sugar "

Safe:
"Wah! Bilkul safe hai! 👍
Khao aur mast raho! 😄
Caution: ⚠️Preservatives (E211), ⚠️Added Sugar"
`;
        // ✅ Send request to Gemini AI for analysis
        const API_KEY = process.env.GEMINI_API_KEY;
        if (!API_KEY) throw new Error("GEMINI_API_KEY is missing from environment variables.");

        const API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent';
        console.log("📡 Sending request to Gemini AI at", API_URL);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout (increased from 30)

        if (typeof globalThis.fetch !== 'function') {
            throw new Error('fetch is not available in this Node.js runtime.');
        }

        let response;
        try {
            response = await retryFetch(`${API_URL}?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: analysisPrompt }] }] }),
                signal: controller.signal
            });
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            let apiError = '';
            try {
                const errorBody = await response.json();
                apiError = errorBody?.error?.message ? `: ${errorBody.error.message}` : '';
            } catch {
                apiError = response.statusText ? `: ${response.statusText}` : '';
            }
            throw new Error(`AI service request failed with status ${response.status}${apiError}`);
        }

        const data = await response.json();
        console.log("📌 Gemini API Response:", data);

        return data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠️ No response from AI. Please try again.";
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error("❌ OCR Processing timed out:", error);
        } else {
            console.error("❌ Error in OCR Processing:", error);
        }
        return `Error processing OCR request: ${safeErrorMessage(error)}`;
    }
};
