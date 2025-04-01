// Required packages
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// Environment variables
const PORT = process.env.PORT || 3000;
const WEBHOOK_VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
const INSTAGRAM_ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const HUGGINGFACE_TOKEN = process.env.HUGGINGFACE_TOKEN;

// Your personal details to feed to the AI
const MY_DETAILS = {
  name: "Mayank",
  interests: ["technology", "photography", "travel"],
  tone: "friendly and casual",
  responseStyle: "I use emojis occasionally and tend to write in shorter messages. I'm enthusiastic but not overly formal."
};

// Webhook verification for Instagram
app.get('/webhook', (req, res) => {
  if (
    req.query['hub.mode'] === 'subscribe' &&
    req.query['hub.verify_token'] === WEBHOOK_VERIFY_TOKEN
  ) {
    res.send(req.query['hub.challenge']);
  } else {
    res.sendStatus(400);
  }
});

// Receive messages from Instagram
app.post('/webhook', async (req, res) => {
  const data = req.body;
  
  // Acknowledge receipt of the event
  res.sendStatus(200);

  // Process each entry
  if (data.object === 'instagram') {
    for (const entry of data.entry) {
      for (const messaging of entry.messaging) {
        if (messaging.message) {
          try {
            await handleMessage(messaging);
          } catch (error) {
            console.error('Error handling message:', error);
          }
        }
      }
    }
  }
});

// Handle incoming messages
async function handleMessage(messaging) {
  const senderId = messaging.sender.id;
  const messageText = messaging.message.text;
  
  // Skip if it's not a text message
  if (!messageText) return;
  
  // Check if message might be about bot detection
  const isBotDetectionQuestion = messageText.toLowerCase().includes('are you a bot') || 
                                messageText.toLowerCase().includes('are you ai') ||
                                messageText.toLowerCase().includes('is this automated');
  
  let aiResponse;
  
  if (isBotDetectionQuestion) {
    // Humorous deflection
    const deflections = [
      "Lol what? I'm just replying from my phone 😂",
      "Haha no I'm just multitasking. What's up?",
      "Robot? Me? *beep boop* just kidding! What's going on?",
      "I'm 100% human, just efficient with my replies! 😊"
    ];
    aiResponse = deflections[Math.floor(Math.random() * deflections.length)];
  } else {
    // Get AI response from Hugging Face
    aiResponse = await getAIResponse(messageText);
  }
  
  // Add human-like touches
  const humanizedResponse = humanizeResponse(aiResponse);
  
  // Send response back to user
  await sendMessage(senderId, humanizedResponse);
}

// Get AI response from Hugging Face
async function getAIResponse(message) {
  try {
    // Create a prompt that includes your personal details
    const prompt = `
    The following is a conversation with a person messaging me on Instagram.
    
    About me: My name is ${MY_DETAILS.name}. I'm interested in ${MY_DETAILS.interests.join(', ')}. 
    My tone is ${MY_DETAILS.tone}. ${MY_DETAILS.responseStyle}
    
    Their message: "${message}"
    
    My response:`;
    
    const response = await axios.post(
      'https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta',
      { inputs: prompt },
      {
        headers: {
          'Authorization': `Bearer ${HUGGINGFACE_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Extract the generated text from response
    let generatedText = response.data[0].generated_text;
    
    // Clean up the response by extracting just the reply part
    const myResponseIndex = generatedText.indexOf("My response:");
    if (myResponseIndex !== -1) {
      generatedText = generatedText.substring(myResponseIndex + 12).trim();
    }
    
    return generatedText;
  } catch (error) {
    console.error('Error getting AI response:', error);
    return "Hey! I'll get back to you soon!";
  }
}

// Add human-like touches to make responses seem more natural
function humanizeResponse(text) {
  // Add random delay simulation (in real implementation, this would be actual delay)
  // For demo purposes, we're just logging it
  const typingTime = Math.floor(Math.random() * (text.length / 5)) + 1;
  console.log(`Would wait ${typingTime} seconds before responding`);
  
  // Occasionally add typos (1 in 5 chance)
  if (Math.random() < 0.2) {
    const words = text.split(' ');
    const randomIndex = Math.floor(Math.random() * words.length);
    
    if (words[randomIndex] && words[randomIndex].length > 3) {
      // Swap two adjacent letters in a word
      const word = words[randomIndex];
      const pos = Math.floor(Math.random() * (word.length - 2)) + 1;
      words[randomIndex] = 
        word.substring(0, pos) + 
        word.charAt(pos + 1) + 
        word.charAt(pos) + 
        word.substring(pos + 2);
    }
    
    text = words.join(' ');
  }
  
  return text;
}

// Send message back to Instagram
async function sendMessage(recipientId, text) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/me/messages`,
      {
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE"
      },
      {
        params: { access_token: INSTAGRAM_ACCESS_TOKEN }
      }
    );
    
    console.log('Message sent successfully:', response.data);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});