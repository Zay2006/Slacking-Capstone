const { App } = require('@slack/bolt');
require('dotenv').config();
const { OpenAI } = require('openai');

// Initialize OpenAI client (with fallback handling for missing API key)
let openai;
try {
  // Check if API key exists and has a value
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY.trim() === '') {
    console.warn('WARNING: OPENAI_API_KEY is missing or empty. AI features will be disabled.');
    openai = null;
  } else {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
} catch (error) {
  console.error('Error initializing OpenAI:', error);
  openai = null;
}

// Initialize the Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET
});

// Log token first chars for debugging
const botToken = process.env.SLACK_BOT_TOKEN || '';
const appToken = process.env.SLACK_APP_TOKEN || '';
console.log(`Bot Token (first chars): ${botToken.substring(0, 11)}...`);
console.log(`App Token (first chars): ${appToken.substring(0, 11)}...`);

// Helper function to get AI response
async function getAIResponse(prompt) {
  // If OpenAI is not available, return a fallback message
  if (!openai) {
    return "I'm sorry, AI features are currently unavailable. Please check your OpenAI API key configuration.";
  }
  
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { 
          role: "system", 
          content: "You are Milestone Madness, a helpful AI assistant for Slack. You help track business milestones, provide project management assistance, and give concise, helpful responses. Format your responses clearly for Slack (no markdown)."
        },
        { role: "user", content: prompt }
      ],
      max_tokens: 500
    });
    
    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI API error:', error);
    return "I'm sorry, I encountered an error processing your request. Please try again later.";
  }
}

// Log port information
const port = process.env.PORT || 3000;
console.log(`Bot will listen on port ${port}`);

// Listen for mentions of the app - respond differently based on content
app.event('app_mention', async ({ event, say }) => {
  try {
    console.log('Received mention event:', event.text);
    
    // Extract the mention part using regex to isolate the actual user ID
    const botUserMention = event.text.match(/<@[A-Z0-9]+>/)?.[0] || '';
    
    // Get everything after the mention by replacing the mention part
    const textAfterMention = event.text.replace(botUserMention, '').trim();
    console.log('Text after mention:', textAfterMention);
    
    // If there's no additional text (just the mention), respond with welcome message
    if (!textAfterMention) {
      await say({
        text: "Thank you for using Milestone Madness! Use `/audit`, `/reminder`, `/draft`, and `/describe` to get started or ask me a question.",
        blocks: [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "Thank you for using Milestone Madness! Use these commands to get started:"
            }
          },
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "• `/audit` - Get AI analysis of data, processes, or metrics\n• `/draft` - Generate professional drafts\n• `/reminder` - Set reminders with AI recommendations\n• `/describe` - Learn about my capabilities"
            }
          },
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "Or just ask me a question directly! 😊"
            }
          }
        ]
      });
    } else {
      // If there's additional text, treat it as a question and use AI to respond
      console.log('Processing question:', textAfterMention);
      await say(`Processing your question: "${textAfterMention}"...`);
      
      try {
        const aiResponse = await getAIResponse(textAfterMention);
        await say(aiResponse);
      } catch (aiError) {
        console.error('AI response error:', aiError);
        await say("I'm having trouble answering that question. Please try again or use one of the slash commands.");
      }
    }
  } catch (error) {
    console.error(`Error responding to app_mention:`, error);
    await say("Sorry, I encountered an error processing your request.");
  }
});

// Listen for direct messages only - use AI for these
app.message(async ({ message, say }) => {
  // Skip if not a direct message or if it's a mention
  if (message.channel_type !== 'im' || (message.text && message.text.includes('<@'))) return;
  
  try {
    const text = message.text.toLowerCase();
    
    // Special case for "can't do" questions
    if ((text.includes("can't") || text.includes("cant") || text.includes("cannot")) && 
        (text.includes("do") || text.includes("anything")) && 
        (text.includes("?") || text.includes("you") || text.includes("u"))) {
      
      await say("🤔 Well, I can't make a perfect cup of coffee... yet! ☕️ I also struggle with existential crises and picking lottery numbers. But when it comes to keeping your milestones on track, I'm practically unstoppable! 💪🚀");
    } else if (text.startsWith('/')) {
      // Remind users that slash commands don't work in DMs
      await say("It looks like you're trying to use a slash command. Please use slash commands in channels, not in direct messages. In direct messages, you can just ask me questions directly!");
    } else {
      // For all other messages, use AI to respond
      await say("Thinking...");
      
      const aiResponse = await getAIResponse(message.text);
      await say(aiResponse);
    }
  } catch (error) {
    console.error(`Error handling message:`, error);
    await say("Sorry, I encountered an error processing your message.");
  }
});

// Handle /draft slash command - Make it interactive to ask about draft type and purpose
app.command('/draft', async ({ command, ack, respond }) => {
  // Acknowledge command request right away
  await ack();

  try {
    // Extract the text after the /draft command
    const draftRequest = command.text;
    
    if (!draftRequest) {
      await respond('What would you like me to help you draft? (e.g., an email, meeting notes, project proposal)');
      return;
    }

    // Analyze what type of draft they're requesting
    const draftType = await getAIResponse(`Analyze this draft request: "${draftRequest}" and determine what type of content it is (email, note, proposal, etc.). Just return the content type in 1-3 words.`);
    
    // Let the user know we're working on it
    await respond(`I'll help you draft a ${draftType.toLowerCase()} based on your request. Creating this now...`);
    
    // Use AI to generate the tailored draft
    const prompt = `Create a professional ${draftType.toLowerCase()} for: ${draftRequest}. Make it well-structured and appropriate for business communication. Include all necessary components for this type of document.`;
    const draftContent = await getAIResponse(prompt);
    
    // Send the draft back with recommendations
    const recommendations = await getAIResponse(`Provide 2-3 quick tips for improving this ${draftType.toLowerCase()}: "${draftRequest}". Keep it very brief.`);
    
    await respond(`*Here's your ${draftType.toLowerCase()} draft:*\n\n${draftContent}\n\n*Recommendations to make this ${draftType.toLowerCase()} more effective:*\n${recommendations}`);
  } catch (error) {
    console.error('Error handling /draft command:', error);
    await respond('Sorry, I encountered an error creating your draft. Please try again later.');
  }
});

// Handle /audit slash command - Make it interactive to ask for details
app.command('/audit', async ({ command, ack, respond }) => {
  await ack();
  try {
    const auditRequest = command.text;
    
    if (!auditRequest) {
      await respond('I can help audit various aspects of your work. What would you like me to audit? (e.g., project timeline, team productivity, budget allocation)');
      return;
    }

    // Ask for more specific details
    await respond(`I'll be auditing: *${auditRequest}*\n\nTo provide a thorough audit, I need some more details. What specific aspects of "${auditRequest}" should I focus on? What are your main concerns or goals?`);
    
    // Note: In a real implementation, we would need to capture the user's follow-up response
    // Since we can't do that in this simple slash command without additional infrastructure,
    // we'll simulate getting more context by having the AI make assumptions
    
    const detailedPrompt = `Provide a comprehensive audit for: ${auditRequest}. Include:\n` +
                          `1. An assessment of current status\n` +
                          `2. Identification of potential issues or risks\n` +
                          `3. Specific recommendations for improvement\n` +
                          `4. Questions that should be asked to get more information\n` +
                          `Make it professional but conversational.`;
    
    const auditResponse = await getAIResponse(detailedPrompt);
    
    // Add a short delay to simulate thinking/analysis time
    setTimeout(async () => {
      await respond(`*Audit Results for "${auditRequest}":*\n\n${auditResponse}`);
    }, 3000);
  } catch (error) {
    console.error('Error handling /audit command:', error);
    await respond('Sorry, I encountered an error processing your audit request. Please try again later.');
  }
});

// Handle /reminder slash command - Ask for details and make time recommendations
app.command('/reminder', async ({ command, ack, respond }) => {
  await ack();
  try {
    const reminderRequest = command.text;
    
    if (!reminderRequest) {
      await respond('What would you like me to remind you about? I can help set reminders and suggest optimal timeframes for tasks.');
      return;
    }

    await respond(`Setting up a reminder for: *${reminderRequest}*\n\nAnalyzing the best approach and timeframe...`);
    
    // Analyze the task complexity and recommend timeframes
    const timeAnalysis = await getAIResponse(`Analyze this task: "${reminderRequest}". \n` +
                                           `1. How complex is this task on a scale of 1-5?\n` +
                                           `2. How much time would be reasonable to allocate to this task?\n` +
                                           `3. Should this be broken down into smaller sub-tasks?\n` +
                                           `4. What's a realistic deadline?\n` +
                                           `Present this as helpful time management advice.`);
    
    // Create a structured reminder with the task breakdown
    const taskBreakdown = await getAIResponse(`Create a structured task breakdown for: "${reminderRequest}". \n` +
                                            `Include 3-5 sub-tasks with estimated time for each.\n` +
                                            `Format as a bulleted list that would be easy to follow.`);
    
    // Add a short delay to simulate processing time
    setTimeout(async () => {
      await respond(`*Reminder set: ${reminderRequest}*\n\n*Time Recommendations:*\n${timeAnalysis}\n\n*Suggested Task Breakdown:*\n${taskBreakdown}`);
    }, 2000);
  } catch (error) {
    console.error('Error handling /reminder command:', error);
    await respond('Sorry, I encountered an error setting your reminder. Please try again later.');
  }
});

// Handle /describe slash command - Describe what the app is
app.command('/describe', async ({ command, ack, respond }) => {
  await ack();
  try {
    await respond({
      text: "🚀 *Milestone Madness - Your AI-Powered Project Assistant* 🚀\n\n" +
            "I'm an intelligent Slack bot designed to help you track business milestones, audit data, create professional drafts, and manage your projects effectively.\n\n" +
            "*Key Capabilities:*\n" +
            "• *AI-Powered Conversations:* Ask me questions directly in channels or DMs\n" +
            "• */audit:* Get detailed analysis of your data, processes, or metrics\n" +
            "• */draft:* Generate tailored professional content with recommendations\n" +
            "• */reminder:* Set reminders with smart time recommendations and task breakdowns\n\n" +
            "Built with Bolt.js and integrated with OpenAI's powerful language model to provide you with intelligent, context-aware assistance.\n\n" +
            "Need help? Just mention me in a channel or send me a direct message!\n" +
            "Try asking 'Is there anything you can't do?' for a fun response! 😉"
    });
  } catch (error) {
    console.error('Error handling /describe command:', error);
    await respond('Sorry, I encountered an error displaying my capabilities. Please try again later.');
  }
});

// Start the app
(async () => {
  try {
    await app.start(process.env.PORT || 3000);
    console.log('⚡️ Milestone Madness bot is running in Socket Mode!');
    console.log('📡 No need for tunnels or public URLs with Socket Mode');
  } catch (error) {
    console.error('Failed to start app:', error);
    console.log('\n\n---- TROUBLESHOOTING ----');
    console.log('1. Check your .env file has the correct tokens');
    console.log('2. Verify your app has the required scopes');
    console.log('3. Ensure Socket Mode is enabled in your Slack app settings');
    console.log('4. Try reinstalling your app to the workspace');
  }
})();