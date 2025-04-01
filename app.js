// app.js - Main application file
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const { HfInference } = require('@huggingface/inference');

// Use a simple JSON file for storage instead of Firebase to avoid auth issues
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

// Initialize Hugging Face
const hf = new HfInference(process.env.HUGGINGFACE_TOKEN);

// Personal details to help the AI respond like you
const personalDetails = {
  name: "Your Name",
  age: 25,
  interests: ["photography", "travel", "fitness", "cooking"],
  personality: "friendly, witty, slightly sarcastic but kind",
  commonPhrases: ["lol", "haha", "definitely", "for sure", "that's awesome"],
  typingHabits: {
    usesEmojis: true,
    frequentEmojis: ["😂", "👍", "❤️", "🔥", "🙌"],
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

  // Make sure this is a page webhook
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
    
    // Generate AI response
    const aiResponse = await generateAIResponse(senderId, messageText, userProfile);
    
    // Humanize the response
    const humanizedResponse = humanizeResponse(aiResponse, userProfile);
    
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
    
    // Fetch user info from Instagram
    const userInfo = await fetchInstagramUserInfo(senderId);
    
    // Create new user profile
    const newProfile = {
      id: senderId,
      name: userInfo.name || 'User',
      conversationStyle: 'casual',
      topics: [],
      relationshipLevel: 'acquaintance',
      conversationHistory: [],
      lastInteraction: new Date().toISOString()
    };
    
    saveUser(senderId, newProfile);
    return newProfile;
  }
}

// Fetch user info from Instagram API
async function fetchInstagramUserInfo(userId) {
  try {
    console.log(`Fetching Instagram user info for ${userId}`);
    const response = await axios.get(
      `${INSTAGRAM_BASE_URL}/${userId}`,
      {
        params: {
          fields: 'name,profile_pic',
          access_token: process.env.INSTAGRAM_ACCESS_TOKEN
        }
      }
    );
    console.log(`Retrieved user info:`, response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching user info:', error.message);
    if (error.response) {
      console.error('Error response:', error.response.data);
    }
    return { name: 'User' };
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
  
  userProfile.lastInteraction = new Date().toISOString();
  
  // Save updated profile
  saveUser(userId, userProfile);
}

// Generate AI response using Hugging Face
async function generateAIResponse(userId, messageText, userProfile) {
  console.log(`Generating AI response for ${userId}`);
  
  // Get last 5 messages for context
  const conversationHistory = userProfile.conversationHistory.slice(-10);
  const formattedHistory = conversationHistory.map(msg => 
    `${msg.sender === 'user' ? userProfile.name : 'You'}: ${msg.message}`
  ).join('\n');
  
  // Check if message might be suspecting an AI
  const suspicionKeywords = ['are you a bot', 'are you ai', 'is this automated', 'this sounds like ai'];
  const mightBeSuspicious = suspicionKeywords.some(keyword => 
    messageText.toLowerCase().includes(keyword)
  );
  
  // Create prompt for the AI
  let prompt = '';
  
  if (mightBeSuspicious) {
    // Create a deflection prompt
    prompt = `You are roleplaying as a human named ${personalDetails.name}. Someone just asked if you're an AI or bot. 
    Respond in a casual, slightly confused way. Be humorous and natural. Never admit you're AI.
    Your personality: ${personalDetails.personality}
    Recent conversation:\n${formattedHistory}\n
    Their message: ${messageText}\n
    Your response (casual, confused, and humorous):`;
  } else {
    // Create a normal conversation prompt
    prompt = `You are roleplaying as a human named ${personalDetails.name}. 
    Age: ${personalDetails.age}
    Interests: ${personalDetails.interests.join(', ')}
    Personality: ${personalDetails.personality}
    Common phrases you use: ${personalDetails.commonPhrases.join(', ')}
    
    You're having a conversation with ${userProfile.name}. Your relationship is: ${userProfile.relationshipLevel}.
    Their conversation style is: ${userProfile.conversationStyle}.
    
    Recent conversation:\n${formattedHistory}\n
    Their message: ${messageText}\n
    
    Your response (in your natural style, as a real human):`;
  }
  
  try {
    console.log(`Sending prompt to Hugging Face: ${prompt.substring(0, 100)}...`);
    
    // Use Hugging Face for text generation
    const response = await hf.textGeneration({
      model: 'mistralai/Mistral-7B-Instruct-v0.2', // A good open model for chat
      inputs: prompt,
      parameters: {
        max_new_tokens: 150,
        temperature: 0.7,
        top_p: 0.95,
        do_sample: true
      }
    });
    
    // Extract and clean AI response
    let aiResponse = response.generated_text;
    
    // Clean up the response
    aiResponse = aiResponse.replace(/^Your response.*?:/i, '').trim();
    aiResponse = aiResponse.replace(/^You:/i, '').trim();
    
    console.log(`AI response generated: ${aiResponse}`);
    return aiResponse;
  } catch (error) {
    console.error('Error generating AI response:', error.message);
    return "Hey! Sorry, I'm a bit busy right now. I'll get back to you soon! 😊";
  }
}

// Humanize the AI response
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
  if (Math.random() < 0.15 && personalDetails.commonPhrases.length > 0) {
    const phrase = personalDetails.commonPhrases[
      Math.floor(Math.random() * personalDetails.commonPhrases.length)
    ];
    
    if (Math.random() < 0.5) {
      humanized = `${phrase} ${humanized}`;
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
  // So that's about 0.67 words per second or 1.5 seconds per word
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
  } catch (error) {
    console.error('Error sending message:', error.message);
    if (error.response) {
      console.error('Error response:', error.response.data);
    }
  }
}

// Test route to verify server is running
app.get('/', (req, res) => {
  res.send('Instagram Auto-Reply Bot is running!');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Debug endpoint to test the Hugging Face API
app.get('/test-ai', async (req, res) => {
  try {
    const response = await hf.textGeneration({
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      inputs: 'Hello, how are you?',
      parameters: {
        max_new_tokens: 50,
        temperature: 0.7
      }
    });
    res.json({ success: true, response: response.generated_text });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to test Instagram API connection
app.get('/test-instagram', async (req, res) => {
  try {
    const response = await axios.get(
      `${INSTAGRAM_BASE_URL}/me`,
      {
        params: {
          fields: 'id,username',
          access_token: process.env.INSTAGRAM_ACCESS_TOKEN
        }
      }
    );
    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message,
      response: error.response ? error.response.data : null
    });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;