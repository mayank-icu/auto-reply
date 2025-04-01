// app.js - Main application file
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

// Use a simple JSON file for storage
const fs = require('fs');
const path = require('path');
const dataPath = path.join(__dirname, 'data');
const usersPath = path.join(dataPath, 'users');

// Create data directories if they don't exist
if (!fs.existsSync(dataPath)) {
  fs.mkdirSync(dataPath);
}
if (!fs.existsSync(usersPath)) {
  fs.mkdirSync(usersPath);
}

// Initialize Express
const app = express();
app.use(bodyParser.json());

// Personal details to make responses feel more human
const personalDetails = {
  name: "Alex",
  age: 27,
  interests: ["photography", "hiking", "music festivals", "cooking", "travel"],
  personality: "friendly, witty, slightly flirty but respectful",
  commonPhrases: ["haha", "so tell me more about you", "that's interesting", "I was just thinking about that", "we should talk more often"],
  typingHabits: {
    usesEmojis: true,
    frequentEmojis: ["😊", "😉", "😂", "👋", "✨", "🙌", "💕", "🔥"],
    punctuation: "relaxed",
    capitalization: "inconsistent"
  }
};

// Instagram API settings
const INSTAGRAM_API_VERSION = 'v17.0';
const INSTAGRAM_BASE_URL = `https://graph.facebook.com/${INSTAGRAM_API_VERSION}`;

// Simple database functions
function saveUser(userId, userData) {
  const userFile = path.join(usersPath, `${userId}.json`);
  fs.writeFileSync(userFile, JSON.stringify(userData, null, 2));
}

function getUser(userId) {
  const userFile = path.join(usersPath, `${userId}.json`);
  if (fs.existsSync(userFile)) {
    return JSON.parse(fs.readFileSync(userFile, 'utf8'));
  }
  return null;
}

// Instagram webhook setup
app.get('/webhook', (req, res) => {
  console.log('Received webhook verification request');
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`Mode: ${mode}, Token: ${token}, Challenge: ${challenge}`);

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('Webhook verification failed');
    res.sendStatus(403);
  }
});

// Receive Instagram messages
app.post('/webhook', async (req, res) => {
  console.log('Received webhook event:', JSON.stringify(req.body));
  const data = req.body;

  // Make sure this is an Instagram webhook
  if (data.object === 'instagram') {
    for (const entry of data.entry) {
      // Check if there's messaging in the entry
      if (entry.messaging) {
        for (const messaging of entry.messaging) {
          const senderId = messaging.sender.id;
          const message = messaging.message;

          if (message && message.text) {
            try {
              console.log(`Processing message from ${senderId}: ${message.text}`);
              // Process the incoming message
              await processMessage(senderId, message.text);
            } catch (error) {
              console.error('Error processing message:', error);
            }
          }
        }
      } else {
        console.log('No messaging data in entry:', entry);
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    console.log('Non-Instagram object received:', data.object);
    res.sendStatus(404);
  }
});

// Process incoming messages
async function processMessage(senderId, messageText) {
  try {
    console.log(`Processing message for user ${senderId}`);
    
    // Get or create user profile
    let userProfile = await getUserProfile(senderId);
    
    // Update conversation history
    await updateConversationHistory(senderId, 'user', messageText, userProfile);
    
    // Generate response (without relying on external AI API initially)
    const response = generateBackupResponse(messageText, userProfile);
    
    // Humanize the response
    const humanizedResponse = humanizeResponse(response, userProfile);
    
    console.log(`Generated response: ${humanizedResponse}`);
    
    // Add delay to simulate typing
    const typingDelay = calculateTypingDelay(humanizedResponse);
    await new Promise(resolve => setTimeout(resolve, typingDelay));
    
    // Send the response
    await sendInstagramMessage(senderId, humanizedResponse);
    
    // Update conversation history with bot response
    await updateConversationHistory(senderId, 'bot', humanizedResponse, userProfile);
    
    console.log(`Completed processing for user ${senderId}`);
  } catch (error) {
    console.error(`Error in processMessage: ${error.message}`);
    console.error(error.stack);
    
    // Attempt to send a fallback message if there was an error
    try {
      await sendInstagramMessage(senderId, "Hey there! Having some internet issues... can you give me a minute? 😊");
    } catch (sendError) {
      console.error('Error sending fallback message:', sendError);
    }
  }
}

// Get or create user profile
async function getUserProfile(senderId) {
  let userProfile = getUser(senderId);
  
  if (userProfile) {
    console.log(`Found existing user profile for ${senderId}`);
    return userProfile;
  } else {
    console.log(`Creating new user profile for ${senderId}`);
    
    // Don't try to fetch user info from Instagram as it's failing
    // Instead create a basic profile
    const newProfile = {
      id: senderId,
      name: 'Friend',  // Generic name since we can't fetch it
      conversationStyle: 'casual',
      topics: [],
      relationshipLevel: 'acquaintance',
      conversationHistory: [],
      lastInteraction: new Date().toISOString(),
      responseCount: 0
    };
    
    saveUser(senderId, newProfile);
    return newProfile;
  }
}

// Update conversation history
async function updateConversationHistory(userId, sender, message, userProfile) {
  console.log(`Updating conversation history for ${userId}`);
  
  // Add new message to conversation history
  userProfile.conversationHistory.push({
    sender: sender,
    message: message,
    timestamp: new Date().toISOString()
  });
  
  // Keep conversation history limited to last 20 messages
  if (userProfile.conversationHistory.length > 20) {
    userProfile.conversationHistory = userProfile.conversationHistory.slice(-20);
  }
  
  // Update last interaction timestamp
  userProfile.lastInteraction = new Date().toISOString();
  
  // Increment response count if this is a bot response
  if (sender === 'bot') {
    userProfile.responseCount = (userProfile.responseCount || 0) + 1;
  }
  
  // Save updated profile
  saveUser(userId, userProfile);
}

// Generate a backup response without using external AI APIs
function generateBackupResponse(messageText, userProfile) {
  console.log('Generating backup response');
  const messageTextLower = messageText.toLowerCase();
  const responseCount = userProfile.responseCount || 0;
  
  // First-time response
  if (responseCount === 0) {
    return "Hey there! 👋 So nice to hear from you! I was just scrolling through some travel photos. How's your day going? ✨";
  }
  
  // Greeting patterns
  if (/^(hi|hello|hey|hola|sup|yo|hii|heya)/i.test(messageTextLower)) {
    const greetings = [
      "Heyyy there! 😊 Great to hear from you! What are you up to today?",
      "Hi! I was just thinking about messaging you actually... How have you been? 💕",
      "Hey you! 👋 So nice to see your message pop up. Tell me something good that happened today?",
      "Well hello there! 😉 Perfect timing, I was just taking a break. How's life treating you?"
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  // Question detection
  if (messageTextLower.includes("?") || /^(what|who|where|when|why|how|do you|are you|can you|will you)/i.test(messageTextLower)) {
    const questionResponses = [
      "Hmm, that's an interesting question... 🤔 I'd say it depends on what you're looking for. What do you think?",
      "Oh I love talking about this! I actually have a few thoughts about that... but I'm curious to hear yours first? 😊",
      "That's something I've been wondering about too! I've been leaning towards... wait, what's your take on it? ✨",
      "Great question! I was discussing something similar with a friend yesterday. I think... Actually, let me hear your perspective first 💭"
    ];
    return questionResponses[Math.floor(Math.random() * questionResponses.length)];
  }
  
  // If message mentions activities
  const activities = ["work", "working", "job", "busy", "studying", "watching", "listening", "reading", "cooking", "gym", "exercise", "game", "playing"];
  if (activities.some(activity => messageTextLower.includes(activity))) {
    const activityResponses = [
      "That sounds like a full day! I've been meaning to do more of that myself. How long have you been into it? 😊",
      "Sounds fun! I actually love doing that too when I get some free time. Any tips for someone who's still getting the hang of it? 💕",
      "Oh, I'm kinda jealous! I've been so busy lately and haven't had time for that. Tell me more about it? ✨",
      "That's awesome! I'm planning to do something similar this weekend. Maybe you can give me some pointers? 😉"
    ];
    return activityResponses[Math.floor(Math.random() * activityResponses.length)];
  }
  
  // If message is short (less than 10 characters)
  if (messageText.length < 10) {
    const shortResponses = [
      "Hey, don't leave me hanging! Tell me more... 😉",
      "Oh come on, I need more details than that! 💕 What else?",
      "I'm intrigued... care to elaborate? ✨",
      "Hmm, mysterious! I like it, but I want to hear more from you 😊"
    ];
    return shortResponses[Math.floor(Math.random() * shortResponses.length)];
  }
  
  // Default conversation extenders
  const defaultResponses = [
    "That's really interesting! I've been thinking about something similar lately. What made you bring that up? 😊",
    "I totally get what you mean! It's been on my mind too. So what else has been happening with you? ✨",
    "Oh I can definitely relate to that! Actually, it reminds me of... wait, I'm curious - what else is new with you? 💕",
    "No way! That's exactly what I needed to hear today. We should definitely talk more about this... what else is on your mind? 😉",
    "I love the way you think! That's such a refreshing perspective. Tell me more about what inspires you? 🔥"
  ];
  
  return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}

// Humanize the response
function humanizeResponse(response, userProfile) {
  console.log(`Humanizing response: ${response}`);
  let humanized = response;
  
  // Add occasional typos (1 in 5 responses)
  if (Math.random() < 0.2) {
    const words = humanized.split(' ');
    const randomIndex = Math.floor(Math.random() * words.length);
    
    if (words[randomIndex] && words[randomIndex].length > 3) {
      const typoIndex = Math.floor(Math.random() * (words[randomIndex].length - 1)) + 1;
      const chars = words[randomIndex].split('');
      
      // Swap two adjacent characters
      [chars[typoIndex], chars[typoIndex - 1]] = [chars[typoIndex - 1], chars[typoIndex]];
      words[randomIndex] = chars.join('');
      
      // Add correction in a follow-up message (50% chance)
      if (Math.random() < 0.5) {
        words.push(`*${words[randomIndex].replace(/[^\w]/g, '')}`);
      }
    }
    
    humanized = words.join(' ');
  }
  
  // Add personal emojis (if the person uses them)
  if (personalDetails.typingHabits.usesEmojis && Math.random() < 0.7) {
    const emojis = personalDetails.typingHabits.frequentEmojis;
    const randomEmoji = emojis[Math.floor(Math.random() * emojis.length)];
    
    // Add emoji at end (if not already there)
    if (!humanized.endsWith('😂') && !humanized.endsWith('😊') && !humanized.endsWith('👍')) {
      humanized += ' ' + randomEmoji;
    }
  }
  
  // Add common phrases occasionally
  if (Math.random() < 0.25 && personalDetails.commonPhrases.length > 0) {
    const phrase = personalDetails.commonPhrases[
      Math.floor(Math.random() * personalDetails.commonPhrases.length)
    ];
    
    if (Math.random() < 0.5) {
      humanized = `${phrase}, ${humanized}`;
    } else {
      humanized = `${humanized} ${phrase}`;
    }
  }
  
  // Adjust capitalization based on typing habits
  if (personalDetails.typingHabits.capitalization === 'inconsistent') {
    if (Math.random() < 0.3) {
      humanized = humanized.charAt(0).toLowerCase() + humanized.slice(1);
    }
  }
  
  console.log(`Humanized response: ${humanized}`);
  return humanized;
}

// Calculate typing delay based on message length
function calculateTypingDelay(message) {
  // Average typing speed is about 40 words per minute
  const wordCount = message.split(' ').length;
  const baseDelay = 1000; // Base delay in milliseconds
  const typingTime = wordCount * 500; // 0.5 seconds per word
  
  // Add some randomness
  const randomFactor = 0.7 + (Math.random() * 0.6); // Between 0.7 and 1.3
  
  // Return total delay with a maximum cap
  return Math.min(baseDelay + (typingTime * randomFactor), 8000);
}

// Send message to Instagram
async function sendInstagramMessage(recipientId, message) {
  try {
    console.log(`Sending message to ${recipientId}: ${message}`);
    
    // Check if we have a valid access token
    if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
      throw new Error('Missing Instagram access token');
    }
    
    // Send message to Instagram
    const response = await axios.post(
      `${INSTAGRAM_BASE_URL}/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text: message },
        messaging_type: 'RESPONSE'
      },
      {
        params: {
          access_token: process.env.INSTAGRAM_ACCESS_TOKEN
        }
      }
    );
    
    console.log(`Message sent successfully to ${recipientId}`, response.data);
    return response.data;
  } catch (error) {
    console.error('Error sending message:', error.message);
    
    if (error.response) {
      console.error('Error response:', error.response.data);
      
      // Check if token is expired or invalid
      if (error.response.data?.error?.code === 190) {
        console.error('Access token is invalid or expired. Please update your INSTAGRAM_ACCESS_TOKEN.');
      }
    }
    
    // Rethrow the error to be handled by the caller
    throw error;
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Test route to verify server is running
app.get('/', (req, res) => {
  res.send('Instagram Auto-Reply Bot is running!');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Debug endpoint to manually test responses
app.post('/test-response', (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const mockUserProfile = {
      id: 'test-user',
      name: 'Test User',
      conversationStyle: 'casual',
      relationshipLevel: 'acquaintance',
      conversationHistory: [],
      responseCount: Math.floor(Math.random() * 5)
    };
    
    const response = generateBackupResponse(message, mockUserProfile);
    const humanizedResponse = humanizeResponse(response, mockUserProfile);
    
    res.json({ 
      originalMessage: message,
      response: humanizedResponse
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual message send endpoint for testing
app.post('/send-test-message', async (req, res) => {
  try {
    const { userId, message } = req.body;
    if (!userId || !message) {
      return res.status(400).json({ error: 'Both userId and message are required' });
    }
    
    const result = await sendInstagramMessage(userId, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      details: error.response?.data || 'No additional details'
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;