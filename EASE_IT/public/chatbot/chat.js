// API calls will proxy through backend for security

// DOM Elements
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const micButton = document.getElementById('mic-btn');
const attachmentBtn = document.getElementById('attachment-btn');
const fileInput = document.getElementById('file-input');
const token = localStorage.getItem('token');

// State Management
let chatHistory = [];
let lastScanResult = localStorage.getItem("lastScanResult") || "";

try {
  const stored = localStorage.getItem("chatHistory");
  if (stored) {
    chatHistory = JSON.parse(stored);
  }
} catch (error) {
  console.warn("Invalid chatHistory in localStorage, resetting:", error);
  localStorage.removeItem("chatHistory");
}

// Format Bot Response
function formatBotResponse(text) {
    return text
        .replace(/(Arrey|Nahi|Yaar|Wah|Bhai)/gi, '<span class="hindi-phrase">$1</span>')
        .replace(/(🍛|🌶️|🍴|💡|🚨)/g, '<span class="food-emoji">$1</span>')
        .replace(/(Try ye karo:|Chhota tip:)/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
        .replace(/Line \d+:/gi, '');
}

// Message Handling
function addMessage(message, isUser) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message', isUser ? 'user-message' : 'bot-message');
    
    const content = document.createElement('div');
    content.classList.add('message-content');
    
    if (message.startsWith('📎')) {
        content.classList.add('file-attachment');
        content.innerHTML = `<i class="fas fa-paperclip"></i>${message}`;
    } else if (message.startsWith('🔍')) {
        content.classList.add('analysis-status');
        content.textContent = message;
    } else {
        if (isUser) {
            content.textContent = message;
        } else {
            // Sanitize bot response
            const sanitized = formatBotResponse(message).replace(/<script[^>]*>.*?<\/script>/gi, '');
            content.innerHTML = sanitized;
        }
    }

    if (!isUser) {
        const botIcon = document.createElement('i');
        botIcon.className = 'fas fa-robot';
        messageElement.appendChild(botIcon);
    }

    messageElement.appendChild(content);
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Voice Recognition
if ('webkitSpeechRecognition' in window) {
    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;

    micButton.addEventListener('click', () => {
        recognition.start();
        micButton.style.backgroundColor = '#ff4d4d';
    });

    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        userInput.value = transcript;
        micButton.style.backgroundColor = '';
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        micButton.style.backgroundColor = '';
        if (event.error === 'no-speech') {
            addMessage('No speech detected. Please try again.', false);
        } else if (event.error === 'audio-capture') {
            addMessage('Microphone access denied.', false);
        } else if (event.error === 'not-allowed') {
            addMessage('Microphone permission required.', false);
        }
    };

    recognition.onend = () => {
        micButton.style.backgroundColor = '';
    };
}

// Enhanced File Handling
attachmentBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
        if (!file.type.startsWith('image/')) {
            addMessage('Please select a valid image file.', false);
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB
            addMessage('File size too large. Please select an image under 5MB.', false);
            return;
        }
        
        addMessage(`📎 ${file.name}`, true);
        addMessage('🔍 Analyzing attached file...', false);
        
        try {
            const imageSrc = await readFileAsDataUrl(file);
            const token = localStorage.getItem('token');

            const response = await fetch('/api/ocr/analyze', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    imageSrc,
                    healthConditions: localStorage.getItem('healthConditions') || 'No health data'
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                addMessage(`Analysis failed: ${errorData.error || 'Unknown error'}`, false);
                return;
            }
            
            const result = await response.json();
            if (result && result.response) {
                lastScanResult = result.response;
                localStorage.setItem("lastScanResult", lastScanResult);
                addMessage(lastScanResult, false);
            } else {
                addMessage('Analysis completed but no valid response received.', false);
            }
            
        } catch (error) {
            addMessage("Arrey! Image scan mein gadbad hai! 📵", false);
        }
    }
});

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Enhanced Chat Functionality
async function generateResponse(prompt) {
    try {
        const response = await fetch('/api/chatbot/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {})
            },
            body: JSON.stringify({
                prompt,
                chatHistory,
                lastScanResult
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        return data.response;
        
    } catch (error) {
        return "Arrey! Kuch technical gadbad hai. Thoda wait karo! 🤖⚡";
    }
}

async function handleUserInput() {
    const message = userInput.value.trim();
    if (!message) return;

    addMessage(message, true);
    userInput.value = '';
    sendButton.disabled = true;

    try {
        const response = await generateResponse(message);
        addMessage(response, false);
        chatHistory.push({ user: message, bot: response });
        localStorage.setItem("chatHistory", JSON.stringify(chatHistory));
    } finally {
        sendButton.disabled = false;
    }
}

// Event Listeners
sendButton.addEventListener('click', handleUserInput);
userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleUserInput();
    }
});

// Initialization
window.addEventListener('load', () => {
    if (lastScanResult) {
        addMessage("📋 Pichla Scan Result:", false);
        addMessage(lastScanResult, false);
    }
});
