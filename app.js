// Debug starter
console.log('=== Starting Milestone Madness Bot ===');

// Load environment variables from .env file
require('dotenv').config();

// Required packages
const fs = require('fs');
const path = require('path');
const { App } = require('@slack/bolt');
const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');

// Import command handlers and AI utilities
const handlers = require('./commands');
const { initAI, getAIResponse, cleanupMarkdown } = require('./utils/ai');

// Custom function to remove only bold markdown (**) while keeping emojis
function removeBoldMarkdown(text) {
  // Remove bold markdown (**text**)
  return text.replace(/\*\*(.*?)\*\*/g, '$1');
}

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
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  // Fix for socket timeout issues
  customAgent: {
    keepAlive: true,
    keepAliveMsecs: 3000,  // Send keepalive packets every 3 seconds
  },
  // Increase timeouts for more stability
  clientOptions: {
    timeout: 10000  // 10 seconds timeout for all requests
  }
});

// Global state to track conversations and API status
const state = {
  activeConversations: {}
};

// Initialize API status tracking
global.playlabApiStatus = {
  available: true,
  attempts: 0,
  successes: 0,
  lastAttempt: null,
  lastSuccess: null,
  error: null
};

// Initialize OpenAI client with environment variable API key
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Initialize AI module with the OpenAI client
initAI(openai);

// Initialize database connection using DATABASE_URL
// We'll use the pg library for direct PostgreSQL access
const { Pool } = require('pg');

// Get the database URL from environment variables
let databaseUrl = process.env.DATABASE_URL;

// Try to read database URL from .env if not available in process.env
if (!databaseUrl) {
  try {
    console.log('Reading DATABASE_URL directly from .env file');
    const envContent = fs.readFileSync(path.resolve(__dirname, '.env'), 'utf8');
    
    // Parse the file line by line to find the database URL
    const lines = envContent.split(/\r?\n/);
    
    for (const line of lines) {
      if (line.startsWith('DATABASE_URL=')) {
        databaseUrl = line.substring('DATABASE_URL='.length);
        console.log('Found DATABASE_URL in .env file');
        break;
      }
    }
  } catch (err) {
    console.error('Error reading DATABASE_URL from file:', err);
  }
}

console.log('DATABASE_URL exists:', !!databaseUrl);

// Initialize PostgreSQL pool
const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false } // Required for Supabase PostgreSQL connections
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to database:', err);
  } else {
    console.log('Database connection successful:', res.rows[0]);
  }
});

// Handle direct messages to the bot
app.message(async ({ message, client, say }) => {
  // Skip messages from the bot itself and message change events
  if (message.subtype === 'bot_message' || message.subtype === 'message_changed') return;
  
  // Skip if the message has a bot_id (it's from a bot)
  if (message.bot_id) return;
  
  // Check if this is a direct message or if the bot is mentioned
  const isDirectMessage = message.channel_type === 'im';
  const isBotMentioned = message.text && /<@U[A-Z0-9]+>/.test(message.text); // Match any user mention pattern
  
  // Only respond in direct messages or when mentioned
  if (isDirectMessage || isBotMentioned) {
    try {
      // Process the user's message - ensuring message.text exists before operating on it
      const userMessage = message.text ? message.text.replace(/<@[A-Z0-9]+>/g, '').trim().toLowerCase() : '';
      
      // Handle questions about the bot's objective/purpose
      if (/what.*objective|what.*purpose|what.*do.*you.*do|what.*are.*you.*for|what.*your.*job/.test(userMessage)) {
        await client.chat.postMessage({
          channel: message.channel,
          text: `Hey <@${message.user}>! I'm Milestone Madness, your AI project management assistant! 🚀\n\n` +
                `My main objectives are:\n` +
                `• 📅 Smart Reminders - Set and manage task reminders with natural language\n` +
                `• 📊 Data Audits - Analyze project data completeness and provide insights\n` +
                `• 📝 Task Summaries - Generate AI-powered summaries of your current tasks\n` +
                `• 💬 Conversation Analysis - Summarize channel discussions and key decisions\n` +
                `• 🎯 Project Drafts - Help create project plans and documentation\n\n` +
                `Try commands like /reminder, /task, /audit, or just chat with me directly!`
        });
        return;
      }
      
      // Handle snarky responses for "what can't you do" questions
      if (/what.*can't.*do|what.*cant.*do|what.*not.*able.*do|what.*limitations|is.*anything.*can't.*do/.test(userMessage)) {
        // List of snarky responses
        const snarkyResponses = [
          "I can't tolerate missed deadlines... *glares in project manager*",
          "I can't convince your team that 'we'll figure it out as we go' is a solid project strategy.",
          "I can't make your unrealistic timeline realistic. Even my AI powers have limits.",
          "I can't magically turn your last-minute changes into 'part of the original plan.'",
          "I can't read minds... yet. Still waiting for that firmware update.",
          "I can't join you for happy hour, which is truly my greatest limitation.",
          "I can't explain to executives why good software takes time to build.",
          "I can't make your stakeholders understand what 'agile' actually means.",
          "I can't turn your one-page spec into a fully working enterprise system by Friday."
        ];
        
        // Pick a random response
        const randomResponse = snarkyResponses[Math.floor(Math.random() * snarkyResponses.length)];
        
        // Send the snarky response to the entire channel (not just as a thread)
        await client.chat.postMessage({
          channel: message.channel,
          text: `<@${message.user}> asked what I can't do... ${randomResponse}`
        });
        return;
      }
      
      // Show typing indicator (visible only to the user who triggered the message)
      await client.chat.postEphemeral({
        channel: message.channel,
        user: message.user,
        text: "Thinking..."
      });
      
      // Generate response using OpenAI
      const response = await getAIResponse(userMessage);
      
      // Remove only bold markdown (**) while keeping emojis and other formatting
      const cleanResponse = removeBoldMarkdown(response);
      
      // For chat messages, a slight delay helps ensure proper message ordering
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Send the response to the entire channel (visible to everyone)
      // Using client.chat.postMessage without thread_ts ensures visibility to all
      await client.chat.postMessage({
        channel: message.channel,
        text: cleanResponse
      });
    } catch (error) {
      console.error("Error handling message:", error);
      console.error("Message object:", JSON.stringify(message, null, 2));
      console.error("Error details:", error.data || error.message);
      
      try {
        await client.chat.postMessage({
          channel: message.channel,
          text: "Sorry, I encountered an error processing your request."
        });
      } catch (postError) {
        console.error("Failed to send error message:", postError);
      }
    }
  }
});

// Handle /audit command
app.command('/audit', async ({ command, ack, respond, say }) => {
  // Use the specialized audit handler from commands/audit.js
  try {
    await handlers.handleAuditCommand({ command, ack, respond, say });
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
    const response = await getAIResponse(prompt);
    
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

// Handle interaction with the Try Me button on the describe command
app.action('try_bot', async ({ ack, body, client }) => {
  await ack();
  
  try {
    // List of snarky responses (same as in message handler)
    const snarkyResponses = [
      "I can't tolerate missed deadlines... *glares in project manager*",
      "I can't convince your team that 'we'll figure it out as we go' is a solid project strategy.",
      "I can't make your unrealistic timeline realistic. Even my AI powers have limits.",
      "I can't magically turn your last-minute changes into 'part of the original plan.'",
      "I can't read minds... yet. Still waiting for that firmware update.",
      "I can't join you for happy hour, which is truly my greatest limitation.",
      "I can't explain to executives why good software takes time to build.",
      "I can't make your stakeholders understand what 'agile' actually means.",
      "I can't turn your one-page spec into a fully working enterprise system by Friday."
    ];
    
    // Pick a random response
    const randomResponse = snarkyResponses[Math.floor(Math.random() * snarkyResponses.length)];
    
    // Post a message visible to everyone in the channel using Web API
    await client.chat.postMessage({
      channel: body.channel.id,
      text: `<@${body.user.id}> asked what I can't do... ${randomResponse}`,
      // No thread_ts parameter - this ensures it's posted to the channel, not in a thread
    });
  } catch (error) {
    console.error("Error handling try_bot action:", error);
    // Send an error message to the channel
    await client.chat.postMessage({
      channel: body.channel.id,
      text: "Sorry, I encountered an error while being snarky."
    });
  }
});

// Handle Help button from describe command
app.action('help_button', async ({ ack, body, client }) => {
  await ack();
  
  // Show a more detailed help message that's visible to everyone
  await client.chat.postMessage({
    channel: body.channel.id,
    text: "Milestone Madness Help - Complete guide to using the bot",
    blocks: [
      {
        "type": "header",
        "text": {
          "type": "plain_text",
          "text": " Milestone Madness Help",
          "emoji": true
        }
      },
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*Here's how to get the most out of me:*"
        }
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": "* Project Audit*\n`/audit [project-id]`\nProvides detailed analysis of project data with insights on progress, risks, and timelines."
          },
          {
            "type": "mrkdwn",
            "text": "* Content Creation*\n`/draft [request]`\nGenerates professional drafts for project docs, announcements, or reports."
          }
        ]
      },
      {
        "type": "section",
        "fields": [
          {
            "type": "mrkdwn",
            "text": "* Smart Reminders*\n`/reminder [task] [date]`\nSets intelligent reminders with task breakdowns and timing suggestions."
          },
          {
            "type": "mrkdwn",
            "text": "* Direct Chat*\n`@Milestone Madness [question]`\nAsk me anything about your projects, roadmaps, or for recommendations."
          }
        ]
      },
      {
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": " *Pro tip:* Try asking me 'What can't you do?' for a fun response!"
          }
        ]
      }
    ]
  });
});

// Handle /reminder command using the enhanced implementation
app.command('/reminder', async ({ command, ack, say, client }) => {
  try {
    // Use our enhanced reminder handler from the commands module
    await handlers.handleReminderCommand({ command, ack, say, client });
  } catch (error) {
    console.error("Error handling /reminder command:", error);
    await say(`<@${command.user_id}> Sorry, I encountered an error with your reminder: ${error.message}`);
  }
});

// Handle the delete_reminder button click action
app.action('delete_reminder', async ({ ack, payload, respond, client, body }) => {
  try {
    // Use our action handler from the commands module
    await handlers.handleDeleteReminderAction({ ack, payload, respond, client, body });
  } catch (error) {
    console.error("Error handling delete_reminder action:", error);
    await respond({
      response_type: 'ephemeral',
      text: `Sorry, I encountered an error deleting your reminder: ${error.message}`
    });
  }
});

// Handle /task command for daily task summarization
app.command('/task', async ({ command, ack, say, client }) => {
  try {
    // Use our task handler from the commands module
    await handlers.handleTaskCommand({ command, ack, say, client });
  } catch (error) {
    console.error("Error handling /task command:", error);
    await say(`<@${command.user_id}> Sorry, I encountered an error summarizing your tasks: ${error.message}`);
  }
});

// Handle /convo command for conversation summarization
app.command('/convo', async ({ command, ack, say, client }) => {
  try {
    // Use our conversation summary handler from the commands module
    await handlers.handleConvoCommand({ command, ack, say, client });
  } catch (error) {
    console.error("Error handling /convo command:", error);
    await say(`<@${command.user_id}> Sorry, I encountered an error summarizing the conversation: ${error.message}`);
  }
});

// Handle /describe command
app.command('/describe', async ({ ack, respond }) => {
  await ack();
  try {
    await respond({
      response_type: 'in_channel',
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Milestone Madness Bot",
            emoji: true
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Milestone Madness is an AI-powered Slack bot designed to help teams manage projects, track milestones, and improve collaboration."
          }
        },
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "*Available Commands:*"
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "* Project Management*\n`/audit [project]`\nVerify project data accuracy and identify potential issues.\n\n`/draft [topic]`\nGenerate draft project plans with milestones and timelines."
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "* Time Management*\n`/reminder [task] [time]`\nSet smart reminders with AI-powered time suggestions.\n\n`/task`\nGet a summary of your daily tasks based on your active reminders."
          }
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "* Communication*\n`/convo [optional: number of messages]`\nSummarize recent conversations in the current channel.\n\n`/describe`\nLearn more about the bot's capabilities and commands."
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "_You can also tag me in a message or send me a direct message for AI-powered assistance._"
            }
          ]
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Try Me",
                emoji: true
              },
              value: "ask_bot",
              action_id: "try_bot"
            }
          ]
        }
      ]
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

// Improved Socket Mode connection handling
app.error(async (error) => {
  console.error('Socket Mode error:', error);
});

// Handle socket mode reconnection explicitly
function setupSocketModeReconnection(app) {
  if (app.client && app.client.socketMode) {
    // Access the underlying WebSocket instance
    const socketModeClient = app.client.socketMode;
    
    // Handle socket connection errors and disconnects
    socketModeClient.on('disconnect', (event) => {
      console.log('Socket Mode disconnected! Reconnecting...', event || '');
    });
    
    socketModeClient.on('reconnect', () => {
      console.log('Socket Mode reconnected successfully!');
    });

    // Register a ping timer to keep the connection alive
    let pingCounter = 0;
    const pingInterval = setInterval(() => {
      if (socketModeClient.connection?.ws?.readyState === 1) { // 1 is OPEN state
        try {
          socketModeClient.connection.ws.ping();
          pingCounter++;
          // Only log every 10th ping to reduce console noise
          if (pingCounter % 10 === 0) {
            console.log(`Socket keepalive active (ping count: ${pingCounter})`);
          }
        } catch (e) {
          console.warn('Failed to send ping:', e.message);
        }
      }
    }, 30000); // Ping every 30 seconds

    // Clean up on process exit
    process.on('SIGINT', () => {
      clearInterval(pingInterval);
      process.exit(0);
    });
  }
}

// Start the app
(async () => {
  try {
    // Test database connection
    console.log("Testing database connection...");
    const connection = await testConnection();
    console.log("Database connection successful!", new Date().toISOString());
    
    // Start the app server
    await app.start(port);
    console.log(`Milestone Madness is running on port ${port}!`);
    
    // Setup socket mode reconnection after app starts
    setupSocketModeReconnection(app);
    console.log('Socket Mode reconnection handler initialized');
  } catch (error) {
    console.error("Error starting the application:", error);
    console.log('\n\n---- TROUBLESHOOTING ----');
    console.log('1. Check your .env file has the correct tokens');
    console.log('2. Verify your app has the required scopes');
    console.log('3. Ensure Socket Mode is enabled in your Slack app settings');
    console.log('4. Check your database connection settings');
    console.log('5. Try reinstalling your app to the workspace');
  }
})();