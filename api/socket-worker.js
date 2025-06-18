// WebSocket worker for Socket Mode
const { App } = require('@slack/bolt');
const { Worker, parentPort } = require('worker_threads');
require('dotenv').config();

// Import handlers and AI utilities
const handlers = require('../commands');
const { initAI } = require('../utils/ai');
const { OpenAI } = require('openai');
const { Pool } = require('pg');

// Environment variables
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN;
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;

// Keep-alive ping interval (milliseconds)
const KEEP_ALIVE_INTERVAL = 30000;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

// Initialize AI module
initAI(openai);

// Initialize database connection
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
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

// Function to start the Socket Mode connection
async function startSocketModeApp() {
  try {
    console.log('Starting Socket Mode worker...');
    
    // Initialize the Slack app with Socket Mode
    const app = new App({
      token: SLACK_BOT_TOKEN,
      socketMode: true,
      appToken: SLACK_APP_TOKEN,
      signingSecret: SLACK_SIGNING_SECRET,
      customAgent: {
        keepAlive: true,
        keepAliveMsecs: 3000,
      },
      clientOptions: {
        timeout: 10000
      }
    });
    
    // Handle direct messages to the bot
    app.message(async ({ message, client, say }) => {
      // Skip messages from the bot itself
      if (message.subtype === 'bot_message') return;
      
      // Safely check if the bot is mentioned and message has text
      const isBotMentioned = message.text && message.text.includes(`<@${app.botId}>`);
      const isDirectMessage = message.channel_type === 'im';
      
      if (isDirectMessage || isBotMentioned) {
        try {
          const userMessage = message.text ? message.text.replace(/<@[A-Z0-9]+>/g, '').trim().toLowerCase() : '';
          
          // Handle snarky responses
          if (/what.*can't.*do|what.*cant.*do|what.*not.*able.*do|what.*limitations|is.*anything.*can't.*do/.test(userMessage)) {
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
            
            const randomResponse = snarkyResponses[Math.floor(Math.random() * snarkyResponses.length)];
            
            await client.chat.postMessage({
              channel: message.channel,
              text: `<@${message.user}> asked what I can't do... ${randomResponse}`
            });
            return;
          }
          
          // Generate response using OpenAI
          const response = await generateAIResponse(userMessage);
          
          // Send the response
          await client.chat.postMessage({
            channel: message.channel,
            text: response
          });
        } catch (error) {
          console.error("Error handling message:", error);
          await client.chat.postMessage({
            channel: message.channel,
            text: "Sorry, I encountered an error processing your request."
          });
        }
      }
    });
    
    // Register command handlers
    app.command('/audit', handlers.handleAuditCommand);
    app.command('/draft', async ({ command, ack, respond }) => {
      await ack();
      try {
        await respond({
          response_type: 'in_channel',
          text: "Creating draft..."
        });
        
        const prompt = `Create a project draft for "${command.text}"`;
        const response = await generateAIResponse(prompt);
        
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
    app.command('/reminder', handlers.handleReminderCommand);
    app.command('/task', handlers.handleTaskCommand);
    app.command('/convo', handlers.handleConvoCommand);
    
    // Handle button actions
    app.action('try_bot', async ({ ack, body, client }) => {
      await ack();
      
      try {
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
        
        const randomResponse = snarkyResponses[Math.floor(Math.random() * snarkyResponses.length)];
        
        await client.chat.postMessage({
          channel: body.channel.id,
          text: `<@${body.user.id}> asked what I can't do... ${randomResponse}`,
        });
      } catch (error) {
        console.error("Error handling try_bot action:", error);
        await client.chat.postMessage({
          channel: body.channel.id,
          text: "Sorry, I encountered an error while being snarky."
        });
      }
    });
    
    app.action('help_button', async ({ ack, body, client }) => {
      await ack();
      
      await client.chat.postMessage({
        channel: body.channel.id,
        blocks: [
          {
            "type": "header",
            "text": {
              "type": "plain_text",
              "text": "🛟 Milestone Madness Help",
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
                "text": "*🔍 Project Audit*\n`/audit [project-id]`\nProvides detailed analysis of project data with insights on progress, risks, and timelines."
              },
              {
                "type": "mrkdwn",
                "text": "*📝 Content Creation*\n`/draft [request]`\nGenerates professional drafts for project docs, announcements, or reports."
              }
            ]
          },
          {
            "type": "section",
            "fields": [
              {
                "type": "mrkdwn",
                "text": "*⏰ Smart Reminders*\n`/reminder [task] [date]`\nSets intelligent reminders with task breakdowns and timing suggestions."
              },
              {
                "type": "mrkdwn",
                "text": "*💬 Direct Chat*\n`@Milestone Madness [question]`\nAsk me anything about your projects, roadmaps, or for recommendations."
              }
            ]
          },
          {
            "type": "context",
            "elements": [
              {
                "type": "mrkdwn",
                "text": "💡 *Pro tip:* Try asking me 'What can't you do?' for a fun response!"
              }
            ]
          }
        ]
      });
    });
    
    app.action('delete_reminder', handlers.handleDeleteReminderAction);
    
    // Start the app
    await app.start();
    console.log('⚡️ Bolt app is running in Socket Mode!');
    
    // Set up a heartbeat/keep-alive mechanism
    setInterval(() => {
      console.log('Socket Mode worker heartbeat');
      // Send a ping to parent if we're in a worker thread
      if (parentPort) {
        parentPort.postMessage({ type: 'heartbeat', timestamp: Date.now() });
      }
    }, KEEP_ALIVE_INTERVAL);
    
    // Listen for signals to stop
    if (parentPort) {
      parentPort.on('message', (message) => {
        if (message.type === 'stop') {
          console.log('Received stop signal, shutting down Socket Mode worker');
          app.stop();
          process.exit(0);
        }
      });
    }
    
    // Handle errors and prevent crashes
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception in Socket Mode worker:', error);
      // Try to reconnect
      setTimeout(startSocketModeApp, 5000);
    });
    
    process.on('unhandledRejection', (error) => {
      console.error('Unhandled promise rejection in Socket Mode worker:', error);
      // Try to reconnect
      setTimeout(startSocketModeApp, 5000);
    });
    
  } catch (error) {
    console.error('Error starting Socket Mode worker:', error);
    // Try to restart after a delay
    setTimeout(startSocketModeApp, 5000);
  }
}

// Start the worker
startSocketModeApp();
