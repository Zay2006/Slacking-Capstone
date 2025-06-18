// API route for handling Slack events in Vercel
const { App, ExpressReceiver } = require('@slack/bolt');
const { OpenAI } = require('openai');
require('dotenv').config();

// Global error handler to prevent unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
  // Don't crash the serverless function
});

// Set up fallback utilities
let aiUtils = {
  initAI: () => {},
  getAIResponse: async () => "AI service temporarily unavailable"
};

let dbManager = {
  pool: null,
  query: async () => []
};

let commandHandlers = {
  handleDraftCommand: async () => ({ text: "Command handler temporarily unavailable" }),
  handleAuditCommand: async () => ({ text: "Command handler temporarily unavailable" }),
  handleDescribeCommand: async () => ({ text: "Command handler temporarily unavailable" }),
  handleReminderCommand: async () => ({ text: "Command handler temporarily unavailable" }),
  handleTaskCommand: async () => ({ text: "Command handler temporarily unavailable" }),
  handleConvoCommand: async () => ({ text: "Command handler temporarily unavailable" }),
  handleDeleteReminderAction: async () => ({ text: "Command handler temporarily unavailable" }),
  handleDirectMessage: async () => ({ text: "Command handler temporarily unavailable" }),
  handleAppMention: async () => ({ text: "Command handler temporarily unavailable" })
};

// Safely import modules with fallbacks
try {
  console.log('Loading AI utilities...');
  aiUtils = require('../utils/ai');
} catch (error) {
  console.error('Failed to load AI utilities:', error.message);
}

try {
  console.log('Loading database manager...');
  dbManager = require('../utils/database').dbManager;
} catch (error) {
  console.error('Failed to load database manager:', error.message);
}

try {
  console.log('Loading command handlers...');
  commandHandlers = require('../commands');
} catch (error) {
  console.error('Failed to load command handlers:', error.message);
}

// Destructure command handlers safely
const { 
  handleDraftCommand,
  handleAuditCommand,
  handleDescribeCommand,
  handleReminderCommand,
  handleTaskCommand, 
  handleConvoCommand,
  handleDeleteReminderAction,
  handleDirectMessage,
  handleAppMention
} = commandHandlers;

// Initialize OpenAI with environment variable - use try/catch to prevent crashes
let openai;
try {
  console.log('Initializing OpenAI...');
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
} catch (error) {
  console.error('Failed to initialize OpenAI:', error.message);
  // Create dummy version to prevent crashes
  openai = {
    chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Error: AI service unavailable' } }] }) } }
  };
}

// Initialize AI utility with OpenAI client - use try/catch
try {
  console.log('Initializing AI utilities...');
  aiUtils.initAI(openai);
} catch (error) {
  console.error('Failed to initialize AI utilities:', error.message);
}

// Create global API status tracking object (required by ai.js)
try {
  console.log('Setting up global status object...');
  global.playlabApiStatus = {
    available: true,
    error: null,
    attempts: 0,
    lastAttempt: new Date()
  };
} catch (error) {
  console.error('Error setting up global status object:', error.message);
}

// Only set global pool if database manager is available
try {
  console.log('Setting up global database pool...');
  if (dbManager && dbManager.pool) {
    global.vercelPool = dbManager.pool;
  }
} catch (error) {
  console.error('Error setting up global database pool:', error.message);
}

// Initialize receiver for HTTP events with explicit endpoints
let expressReceiver;
try {
  console.log('Initializing express receiver...');
  expressReceiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET || 'dummy-secret',
    processBeforeResponse: true,
    endpoints: {
      events: '/slack/events',
      commands: '/slack/commands',
      actions: '/slack/interactive-endpoints'
    }
  });
} catch (error) {
  console.error('Error initializing express receiver:', error.message);
  throw error; // This is critical - must fail if we can't create the receiver
}

// Initialize the Slack app with HTTP receiver
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver: expressReceiver
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

// REGISTER ALL COMMAND HANDLERS
// Handle /describe command
app.command('/describe', async ({ command, ack, respond }) => {
  await ack();
  console.log('Handling /describe command');
  try {
    await handleDescribeCommand({ command, ack: () => {}, respond });
  } catch (error) {
    console.error("Error in /describe command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error processing the /describe command."
    });
  }
});

// Handle /audit command
app.command('/audit', async ({ command, ack, respond }) => {
  await ack();
  console.log('Handling /audit command');
  try {
    await handleAuditCommand({ command, ack: () => {}, respond });
  } catch (error) {
    console.error("Error in /audit command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error processing the /audit command."
    });
  }
});

// Handle /draft command
app.command('/draft', async ({ command, ack, respond }) => {
  await ack();
  console.log('Handling /draft command');
  try {
    await handleDraftCommand({ command, ack: () => {}, respond });
  } catch (error) {
    console.error("Error in /draft command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error processing the /draft command."
    });
  }
});

// Handle /reminder command
app.command('/reminder', async ({ command, ack, respond }) => {
  await ack();
  console.log('Handling /reminder command');
  try {
    await handleReminderCommand({ command, ack: () => {}, respond });
  } catch (error) {
    console.error("Error in /reminder command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error processing the /reminder command."
    });
  }
});

// Handle /task command
app.command('/task', async ({ command, ack, respond }) => {
  await ack();
  console.log('Handling /task command');
  try {
    await handleTaskCommand({ command, ack: () => {}, respond });
  } catch (error) {
    console.error("Error in /task command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error processing the /task command."
    });
  }
});

// Handle /convo command
app.command('/convo', async ({ command, ack, respond }) => {
  await ack();
  console.log('Handling /convo command');
  try {
    await handleConvoCommand({ command, ack: () => {}, respond });
  } catch (error) {
    console.error("Error in /convo command:", error);
    await respond({
      response_type: 'ephemeral',
      text: "Sorry, I encountered an error processing the /convo command."
    });
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
      if (isBotMentioned) {
        await handleAppMention({ message, client, say });
      } else {
        await handleDirectMessage({ message, client, say });
      }
    } catch (error) {
      console.error("Error handling message:", error);
      await say("Sorry, I encountered an error processing your request.");
    }
  }
});

// Handle Try Me button action
app.action('try_bot', async ({ ack, body, client }) => {
  await ack();
  
  try {
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
    
    await client.chat.postMessage({
      channel: body.channel.id,
      text: `<@${body.user.id}> asked what I can't do... ${randomResponse}`
    });
  } catch (error) {
    console.error("Error handling try_bot action:", error);
    await client.chat.postMessage({
      channel: body.channel.id,
      text: "Sorry, I encountered an error while being snarky."
    });
  }
});

// Handle Help button action
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
      }
    ]
  });
});

// Handle Delete Reminder action
app.action('delete_reminder', async ({ ack, body, client }) => {
  await ack();
  try {
    await handleDeleteReminderAction({ ack: () => {}, body, client });
  } catch (error) {
    console.error("Error handling delete_reminder action:", error);
    await client.chat.postMessage({
      channel: body.channel.id,
      text: "Sorry, I encountered an error processing the reminder deletion."
    });
  }
});

// Export the Express app for Vercel
module.exports = expressReceiver.app;
