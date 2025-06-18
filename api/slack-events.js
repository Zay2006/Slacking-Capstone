// Add startup logging for serverless function cold starts
console.log('Serverless function initializing', {
  timestamp: new Date().toISOString(),
  nodeVersion: process.version,
  environment: process.env.NODE_ENV || 'development'
});

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
  // Check if API key exists
  if (!process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY environment variable is missing!');
    // Create dummy version to prevent crashes
    openai = {
      chat: { completions: { create: async () => ({ choices: [{ message: { content: 'Error: OpenAI API key not configured' } }] }) } }
    };
  } else {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
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

// Create minimal global status object for backward compatibility
// This has been migrated from PlayLab to OpenAI
global.aiServiceStatus = {
  available: true,
  error: null,
  attempts: 0,
  lastAttempt: new Date()
};

// Only set global pool if database manager is available
try {
  console.log('Setting up global database pool...');
  if (dbManager && dbManager.pool) {
    // Store the pool globally so it can be reused across function invocations
    if (!global.vercelPool) {
      console.log('Creating new database connection pool for serverless environment');
      global.vercelPool = dbManager.pool;
    } else {
      console.log('Reusing existing database connection pool');
    }
    
    // Add connection health check
    if (typeof global.vercelPool.query === 'function') {
      console.log('Running database connection health check...');
      global.vercelPool.query('SELECT NOW() as current_time')
        .then(result => {
          console.log(`Database connection verified at ${result.rows?.[0]?.current_time || 'unknown time'}`);
        })
        .catch(dbError => {
          console.error('Database connection test failed:', dbError.message);
          // Don't throw, continue with potentially broken pool
          // The connection might recover on future invocations
        });
    }
  } else {
    console.warn('Database pool is not available');
  }
} catch (error) {
  console.error('Error setting up global database pool:', error.message);
}

// Initialize receiver for HTTP events with explicit endpoints
let expressReceiver;
try {
  console.log('Initializing express receiver for serverless environment...');
  
  // Check for required configuration
  if (!process.env.SLACK_SIGNING_SECRET) {
    console.warn('SLACK_SIGNING_SECRET environment variable is missing or empty!');
    console.warn('Using a dummy secret for development, but authentication will fail in production');
  }
  
  expressReceiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET || 'dummy-secret',
    processBeforeResponse: true, // Important for serverless - process and respond quickly
    endpoints: {
      events: '/slack/events',
      commands: '/slack/commands',
      actions: '/slack/interactive-endpoints'
    },
    // Add custom error handler for better diagnostics
    customErrorHandler: (error) => {
      console.error('Express receiver error:', error);
      return {
        status: 500,
        body: {
          error: 'An unexpected error occurred',
          ok: false
        }
      };
    }
  });
  
  // Add middleware to log requests in development
  if (process.env.NODE_ENV !== 'production') {
    expressReceiver.app.use((req, res, next) => {
      console.log(`${req.method} ${req.url}`);
      next();
    });
  }
} catch (error) {
  console.error('Error initializing express receiver:', error);
  throw error; // This is critical - must fail if we can't create the receiver
}

// Add URL verification route explicitly for better serverless handling
expressReceiver.app.post('/slack/events', (req, res) => {
  // Handle the Slack URL verification challenge
  if (req.body && req.body.type === 'url_verification') {
    console.log('Received Slack URL verification challenge');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(req.body.challenge);
    return;
  }
  
  // For all other requests, let the regular Bolt handler process them
  expressReceiver.app.emit('request', req, res);
});

// Initialize the Slack app with HTTP receiver
let app;
try {
  console.log('Initializing Slack app for serverless environment...');
  
  // Check for required configuration
  if (!process.env.SLACK_BOT_TOKEN) {
    console.warn('SLACK_BOT_TOKEN environment variable is missing or empty!');
    console.warn('App will not be able to post messages or interact with Slack API');
  }
  
  app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    receiver: expressReceiver,
    // Add custom error handler for better diagnostics
    customRoutes: [
      {
        path: '/health',
        method: ['GET'],
        handler: (req, res) => {
          res.writeHead(200);
          res.end(JSON.stringify({
            status: 'ok',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development'
          }));
        },
      }
    ],
    // These options are useful for serverless environments
    logLevel: process.env.NODE_ENV === 'production' ? 'error' : 'debug'
  });
  
  // Log any unhandled errors from the Bolt app
  app.error((error) => {
    console.error('Unhandled Slack app error:', error);
  });
  
} catch (error) {
  console.error('Error initializing Slack app:', error);
  throw error; // This is critical - must fail if we can't create the app
}

// Utility function to generate AI responses
async function generateAIResponse(prompt) {
  try {
    // Update status before making the API call
    global.aiServiceStatus.attempts += 1;
    global.aiServiceStatus.lastAttempt = new Date();
    
    console.log(`Generating AI response for prompt: "${prompt.substring(0, 50)}..."`);
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500,
      temperature: 0.7,
      // Add a reasonable timeout for serverless environment
      timeout: 15000 // 15 seconds
    });
    
    // Update status on success
    global.aiServiceStatus.available = true;
    global.aiServiceStatus.error = null;
    
    if (!completion.choices || !completion.choices[0] || !completion.choices[0].message) {
      console.error("Invalid response structure from OpenAI API:", completion);
      return "I received an unexpected response format. Please try again later.";
    }
    
    return completion.choices[0].message.content;
  } catch (error) {
    // Update status on error
    global.aiServiceStatus.available = false;
    global.aiServiceStatus.error = error.message || "Unknown error";
    
    console.error("Error generating AI response:", error);
    
    // Provide more specific error messages based on error type
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
      return "I'm having trouble connecting to my AI services right now. The service might be experiencing high traffic. Please try again in a few moments.";
    } else if (error.status === 429) {
      return "I've reached my limit with the AI service. Please try again in a few minutes.";
    } else if (error.status >= 500) {
      return "The AI service is currently experiencing issues. Please try again later.";
    }
    
    return "I'm having trouble connecting to my AI services right now. Please try again later.";
  }
}

// REGISTER ALL COMMAND HANDLERS
// Handle /describe command
app.command('/describe', async ({ command, ack, respond, client }) => {
  await ack();
  console.log('Handling /describe command');
  try {
    await handleDescribeCommand({ command, client, respond });
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
app.command('/reminder', async ({ command, ack, respond, client }) => {
  await ack();
  console.log('Handling /reminder command');
  try {
    await handleReminderCommand({ command, client, respond });
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
app.message(async ({ message, client }) => {
  // Skip messages from the bot itself
  if (message.subtype === 'bot_message') return;
  
  // Safely check if the bot is mentioned and message has text
  const isBotMentioned = message.text && message.text.includes(`<@${app.botId}>`);
  const isDirectMessage = message.channel_type === 'im';
  
  if (isDirectMessage || isBotMentioned) {
    try {
      console.log('Processing message event in serverless function');
      if (isBotMentioned) {
        // Convert message to event format expected by our handler
        const event = {
          ...message,
          bot_id: app.botId
        };
        await handleAppMention({ event, client });
      } else {
        await handleDirectMessage({ message, client });
      }
    } catch (error) {
      console.error("Error handling message:", error);
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

// Handle Try Me button action
app.action('try_bot', async ({ ack, body, client }) => {
  await ack();
  
  try {
    console.log('Processing try_bot action in serverless function');
    
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
    
    // Safely extract channel ID and user ID
    const channelId = body.channel?.id || body.container?.channel_id;
    const userId = body.user?.id;
    
    if (!channelId) {
      console.error("Could not determine channel ID from payload:", body);
      return;
    }
    
    await client.chat.postMessage({
      channel: channelId,
      text: userId ? `<@${userId}> asked what I can't do... ${randomResponse}` : `Someone asked what I can't do... ${randomResponse}`
    });
  } catch (error) {
    console.error("Error handling try_bot action:", error);
    try {
      // Get channel ID with fallbacks
      const channelId = body.channel?.id || body.container?.channel_id;
      if (channelId) {
        await client.chat.postMessage({
          channel: channelId,
          text: "Sorry, I encountered an error while being snarky."
        });
      }
    } catch (postError) {
      console.error("Failed to send error message:", postError);
    }
  }
});

// Handle Help button action
app.action('help_button', async ({ ack, body, client }) => {
  await ack();
  
  try {
    console.log('Processing help_button action in serverless function');
    
    // Safely extract channel ID
    const channelId = body.channel?.id || body.container?.channel_id;
    
    if (!channelId) {
      console.error("Could not determine channel ID from payload:", body);
      return;
    }
    
    await client.chat.postMessage({
      channel: channelId,
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
  } catch (error) {
    console.error("Error handling help_button action:", error);
    try {
      // Get channel ID with fallbacks
      const channelId = body.channel?.id || body.container?.channel_id;
      if (channelId) {
        await client.chat.postMessage({
          channel: channelId,
          text: "Sorry, I encountered an error displaying the help information."
        });
      }
    } catch (postError) {
      console.error("Failed to send error message:", postError);
    }
  }
});

// Handle Delete Reminder action
app.action('delete_reminder', async ({ ack, body, client }) => {
  await ack();
  console.log('Processing delete_reminder action in serverless function');
  
  try {
    // Call the improved handleDeleteReminderAction function
    const result = await handleDeleteReminderAction({ body, client });
    
    if (!result.success) {
      console.warn('Delete reminder action completed with error:', result.error);
    } else {
      console.log('Successfully deleted reminder');
    }
  } catch (error) {
    console.error("Error handling delete_reminder action:", error);
    
    // Try to get the channel ID with fallbacks
    const channelId = body.channel?.id || body.container?.channel_id;
    const userId = body.user?.id;
    
    if (channelId) {
      try {
        await client.chat.postMessage({
          channel: channelId,
          text: userId ? 
            `<@${userId}> Sorry, I encountered an error processing the reminder deletion: ${error.message}` : 
            "Sorry, I encountered an error processing the reminder deletion."
        });
      } catch (postError) {
        console.error('Failed to send error message:', postError);
      }
    }
  }
});

// Export the Express app for Vercel
module.exports = expressReceiver.app;
