// Debug starter
console.log('=== Starting Milestone Madness Bot ===');

// Load environment variables from .env file
require('dotenv').config();

// Required packages
const fs = require('fs');
const path = require('path');
const { App } = require('@slack/bolt');
const { OpenAI } = require('openai');

// Define OPENAI_API_KEY variable
let OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Read OpenAI API key directly from the .env file if not available in process.env
if (!OPENAI_API_KEY) {
  try {
    console.log('Reading OpenAI API key directly from .env file');
    const envContent = fs.readFileSync(path.resolve(__dirname, '.env'), 'utf8');
    
    // Parse the file line by line to find the OpenAI API key
    const lines = envContent.split(/\r?\n/);
    
    for (const line of lines) {
      if (line.startsWith('OPENAI_API_KEY=')) {
        OPENAI_API_KEY = line.substring('OPENAI_API_KEY='.length);
        console.log('Found OpenAI API key in .env file');
        console.log(`Key length: ${OPENAI_API_KEY.length}`);
        console.log(`Key starts with: ${OPENAI_API_KEY.substring(0, 10)}...`);
        break;
      }
    }
  } catch (err) {
    console.error('Error reading OpenAI API key from file:', err);
  }
}

console.log('Using environment variable for API key');
console.log('OPENAI_API_KEY exists:', !!OPENAI_API_KEY);
if (OPENAI_API_KEY) {
  console.log('OPENAI_API_KEY length:', OPENAI_API_KEY.length);
  console.log('First 10 chars:', OPENAI_API_KEY.substring(0, 10) + '...');
}

// Debug environment variables
console.log('Environment variables check:');
console.log('SLACK_BOT_TOKEN exists:', !!process.env.SLACK_BOT_TOKEN);
console.log('SLACK_APP_TOKEN exists:', !!process.env.SLACK_APP_TOKEN);

// Initialize the Slack app with tokens from environment variables
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Global state to track conversations and API status
const state = {
  activeConversations: {}
};

// Initialize OpenAI client with environment variable API key
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Utility function to generate AI responses
async function generateAIResponse(prompt) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500
    });
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error("Error generating AI response:", error);
    return "I'm having trouble connecting to my AI services right now. Please try again later.";
  }
}

// Handle direct messages to the bot
app.message(async ({ message, say }) => {
  // Skip messages from the bot itself
  if (message.subtype === 'bot_message') return;
  
  // Only respond to direct messages or when mentioned
  const isBotMentioned = message.text && message.text.includes(`<@${app.botId}>`);
  const isDirectMessage = message.channel_type === 'im';
  
  if (isDirectMessage || isBotMentioned) {
    try {
      // Show typing indicator
      await app.client.chat.postMessage({
        channel: message.channel,
        text: "Thinking...",
        thread_ts: message.thread_ts || message.ts
      });
      
      // Generate response using OpenAI
      const userPrompt = message.text.replace(/<@[A-Z0-9]+>/g, '').trim();
      const response = await generateAIResponse(userPrompt);
      
      // Send the response
      await say({
        text: response,
        thread_ts: message.thread_ts || message.ts
      });
    } catch (error) {
      console.error("Error handling message:", error);
      await say({
        text: "Sorry, I encountered an error processing your request.",
        thread_ts: message.thread_ts || message.ts
      });
    }
  }
});

// Handle /audit command
app.command('/audit', async ({ command, ack, respond }) => {
  await ack();
  try {
    // Show typing indicator
    await respond({
      response_type: 'in_channel',
      text: "Generating audit report..."
    });
    
    // Generate audit report
    const prompt = `Create a brief audit report for project "${command.text}"`;
    const response = await generateAIResponse(prompt);
    
    // Send the response
    await respond({
      response_type: 'in_channel',
      text: response
    });
  } catch (error) {
    console.error("Error handling /audit command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error generating the audit report."
    });
  }
});

// Handle /draft command
app.command('/draft', async ({ command, ack, respond }) => {
  await ack();
  try {
    // Show typing indicator
    await respond({
      response_type: 'in_channel',
      text: "Creating draft..."
    });
    
    // Generate draft
    const prompt = `Create a project draft for "${command.text}"`;
    const response = await generateAIResponse(prompt);
    
    // Send the response
    await respond({
      response_type: 'in_channel',
      text: response
    });
  } catch (error) {
    console.error("Error handling /draft command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error creating the draft."
    });
  }
});

// Handle /reminder command
app.command('/reminder', async ({ command, ack, respond }) => {
  await ack();
  try {
    // Show typing indicator
    await respond({
      response_type: 'in_channel',
      text: "Setting reminder..."
    });
    
    // Process reminder
    const prompt = `Create a reminder for "${command.text}"`;
    const response = await generateAIResponse(prompt);
    
    // Send the response
    await respond({
      response_type: 'in_channel',
      text: response
    });
  } catch (error) {
    console.error("Error handling /reminder command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error setting the reminder."
    });
  }
});

// Handle /describe command
app.command('/describe', async ({ ack, respond }) => {
  await ack();
  try {
    await respond({
      response_type: 'ephemeral',
      text: "Milestone Madness is an AI-powered Slack bot designed to help teams manage projects, track milestones, and improve collaboration. Use commands like `/audit`, `/draft`, and `/reminder` to interact with me!"
    });
  } catch (error) {
    console.error("Error handling /describe command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error processing your request."
    });
  }
});

// port is set to 3000 unless specified otherwise in environment variables
const port = process.env.PORT || 3000;

// Import database connection testing
const { testConnection } = require('./utils/database');

// Start the app
(async () => {
  try {
    // Test database connection
    console.log('Testing database connection...');
    await testConnection();

    // Start the Slack app
    await app.start(port);
    console.log('⚡️ Milestone Madness bot is running in Socket Mode!');
    console.log('📡 No need for tunnels or public URLs with Socket Mode');
  } catch (error) {
    console.error('Failed to start app:', error);
    console.log('\n\n---- TROUBLESHOOTING ----');
    console.log('1. Check your .env file has the correct tokens');
    console.log('2. Verify your app has the required scopes');
    console.log('3. Ensure Socket Mode is enabled in your Slack app settings');
    console.log('4. Check your database connection settings');
    console.log('5. Try reinstalling your app to the workspace');
  }
})();