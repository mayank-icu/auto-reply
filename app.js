require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Configuration
const {
  INSTAGRAM_APP_ID,
  INSTAGRAM_APP_SECRET,
  INSTAGRAM_ACCESS_TOKEN,
  HUGGINGFACE_TOKEN,
  WEBHOOK_VERIFY_TOKEN,
  PORT = 3000
} = process.env;

// Personal context for AI
const MY_CONTEXT = "I'm Mayank, a tech enthusiast who loves gaming and music. I respond casually with emojis sometimes. ";

// Add human-like touches to responses
function humanize(text) {
  if (Math.random() < 0.3) {
    return text
      .replace(' a ', ' a, ')
      .replace('the ', 'teh ')
      .replace(' you ', ' u ')
      .replace('!', '!!');
  }
  return text;
}

// Get AI response from Hugging Face
async function getAIResponse(prompt) {
  try {
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/microsoft/DialoGPT-large',
      { inputs: MY_CONTEXT + `\nUser: ${prompt}\nMayank:` },
      { headers: { Authorization: `Bearer ${HUGGINGFACE_TOKEN}` } }
    );
    return response.data[0].generated_text.split("Mayank:")[1].trim();
  } catch (error) {
    console.error("AI Error:", error.response?.data || error.message);
    return "Hmm, could you repeat that? 😅";
  }
}

// Send message via Instagram API
async function sendMessage(recipientId, message) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/me/messages?access_token=${INSTAGRAM_ACCESS_TOKEN}`,
      {
        recipient: { id: recipientId },
        message: { text: humanize(message) }
      }
    );
    return response.data;
  } catch (error) {
    console.error("Send Error:", error.response?.data || error.message);
  }
}

// Webhook setup
app.get('/webhook', (req, res) => {
  if (req.query['hub.mode'] === 'subscribe' && 
      req.query['hub.verify_token'] === WEBHOOK_VERIFY_TOKEN) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(403);
  }
});

// Handle incoming messages
app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    if (data.object === 'instagram') {
      for (const entry of data.entry) {
        for (const event of entry.messaging) {
          const senderId = event.sender.id;
          const messageText = event.message.text;
          
          // Get AI response with delay
          const aiResponse = await getAIResponse(messageText);
          
          // Random delay between 1-3 seconds
          await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
          
          // Send response
          await sendMessage(senderId, aiResponse);
        }
      }
    }
    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook Error:", error);
    res.sendStatus(500);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Set your webhook URL to: https://your-subdomain.loca.lt/webhook`);
});