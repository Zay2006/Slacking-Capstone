const { App } = require('@slack/bolt');
require('dotenv').config();
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

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
console.log(`Bot Token (first chars): ${botToken.substring(0, 10)}...`);
console.log(`App Token (first chars): ${appToken.substring(0, 10)}...`);

// Helper function to get AI response
async function getAIResponse(prompt) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
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

// Set up a simple health check endpoint
app.receiver.app.get('/', (req, res) => {
  res.send('Milestone Madness Bot is running!');
});
console.log(`Health check on http://localhost:${process.env.PORT || 4000}`);

// Listen for mentions of the app
app.event('app_mention', async ({ event, say }) => {
  try {
    await say(`I'm thinking about how to respond to <@${event.user}>...`);
    const aiResponse = await getAIResponse(event.text);
    await say(aiResponse);
  } catch (error) {
    console.error(`Error responding to app_mention: ${error}`);
    await say("Sorry, I encountered an error while processing your request.");
  }
});

// Listen for direct messages
app.message(async ({ message, say }) => {
  // Only respond to messages in DMs
  if (message.channel_type !== 'im') return;
  
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
    console.error(`Error handling message: ${error}`);
    await say("Sorry, I encountered an error processing your message.");
  }
});

// Start the app
(async () => {
  try {
    await app.start(process.env.PORT || 4000);
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
