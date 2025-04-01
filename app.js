// app.js - Main application file
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const { HfInference } = require('@huggingface/inference');

// Initialize Firebase
const serviceAccount = {
  "type": "service_account",
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": "private-key-id",
  "private_key": process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": "client-id",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "client-cert-url"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();
const app = express();
app.use(bodyParser.json());

// Initialize Hugging Face
const hf = new HfInference(process.env.HUGGINGFACE_TOKEN);

// Personal details to help the AI respond like you
const personalDetails = {
    name: "Mayank",
    age: 15,
    interests: ["web development", "AI", "cybersecurity", "music", "movies", "startups", "reading"],
    personality: "ambitious, witty, slightly sarcastic but kind, innovative, independent",
    commonPhrases: ["lol", "haha", "definitely", "for sure", "that's awesome", "bruh", "ngl", "fr", "damn"],
    typingHabits: {
      usesEmojis: true,
      frequentEmojis: ["😂", "👍", "❤️", "🔥", "🙌", "🤔", "😏", "💀", "😆", "✨"],
      punctuation: "relaxed",
      capitalization: "inconsistent"
    }
  };
  
// Instagram API settings
const INSTAGRAM_API_VERSION = 'v17.0';
const INSTAGRAM_BASE_URL = `https://graph.facebook.com/${INSTAGRAM_API_VERSION}`;

// Instagram webhook setup
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Receive Instagram messages
app.post('/webhook', async (req, res) => {
  const data = req.body;

  // Make sure this is a page webhook
  if (data.object === 'instagram') {
    for (const entry of data.entry) {
      for (const messaging of entry.messaging) {
        const senderId = messaging.sender.id;
        const message = messaging.message;

        if (message && message.text) {
          try {
            // Process the incoming message
            await processMessage(senderId, message.text);
          } catch (error) {
            console.error('Error processing message:', error);
          }
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

// Process incoming messages
async function processMessage(senderId, messageText) {
  // Get or create user profile in database
  let userProfile = await getUserProfile(senderId);
  
  // Update conversation history
  await updateConversationHistory(senderId, 'user', messageText);
  
  // Generate AI response
  const aiResponse = await generateAIResponse(senderId, messageText, userProfile);
  
  // Humanize the response
  const humanizedResponse = humanizeResponse(aiResponse, userProfile);
  
  // Add delay to simulate typing
  const typingDelay = calculateTypingDelay(humanizedResponse);
  await new Promise(resolve => setTimeout(resolve, typingDelay));
  
  // Send the response
  await sendInstagramMessage(senderId, humanizedResponse);
  
  // Update conversation history with bot response
  await updateConversationHistory(senderId, 'bot', humanizedResponse);
}

// Get or create user profile
async function getUserProfile(senderId) {
  const userRef = db.collection('users').doc(senderId);
  const doc = await userRef.get();
  
  if (doc.exists) {
    return doc.data();
  } else {
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
      lastInteraction: admin.firestore.FieldValue.serverTimestamp()
    };
    
    await userRef.set(newProfile);
    return newProfile;
  }
}

// Fetch user info from Instagram API
async function fetchInstagramUserInfo(userId) {
  try {
    const response = await axios.get(
      `${INSTAGRAM_BASE_URL}/${userId}`,
      {
        params: {
          fields: 'name,profile_pic',
          access_token: process.env.INSTAGRAM_ACCESS_TOKEN
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Error fetching user info:', error);
    return { name: 'User' };
  }
}

// Update conversation history
async function updateConversationHistory(userId, sender, message) {
  const userRef = db.collection('users').doc(userId);
  
  await userRef.update({
    conversationHistory: admin.firestore.FieldValue.arrayUnion({
      sender: sender,
      message: message,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    }),
    lastInteraction: admin.firestore.FieldValue.serverTimestamp()
  });
  
  // Keep conversation history limited to last 20 messages
  const userDoc = await userRef.get();
  const userData = userDoc.data();
  
  if (userData.conversationHistory.length > 20) {
    const newHistory = userData.conversationHistory.slice(-20);
    await userRef.update({ conversationHistory: newHistory });
  }
}

// Generate AI response using Hugging Face
async function generateAIResponse(userId, messageText, userProfile) {
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
    
    return aiResponse;
  } catch (error) {
    console.error('Error generating AI response:', error);
    return "Hey! Sorry, I'm a bit busy right now. I'll get back to you soon! 😊";
  }
}

// Humanize the AI response
function humanizeResponse(response, userProfile) {
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
    await axios.post(
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
    console.log(`Message sent to ${recipientId}`);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app;