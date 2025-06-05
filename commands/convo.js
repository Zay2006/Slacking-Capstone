// convo.js - Handler for /convo slash command
const { getAIResponse } = require('../utils/ai');

/**
 * Summarize recent conversations in a channel
 * @param {Object} params - Command parameters
 * @returns {Promise<void>}
 */
async function handleConvoCommand({ command, ack, say, client }) {
  await ack();
  
  try {
    const userId = command.user_id;
    const channelId = command.channel_id;
    const loadingMessage = await say(`Summarizing recent conversations in this channel...`);
    
    let limit = 50; // Default message limit
    
    // Check if user specified a custom limit
    if (command.text) {
      const parsedLimit = parseInt(command.text);
      if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
        limit = parsedLimit;
      }
    }
    
    // Get recent messages from the channel
    const historyResponse = await client.conversations.history({
      channel: channelId,
      limit: limit
    });
    
    const messages = historyResponse.messages || [];
    
    if (messages.length === 0) {
      await client.chat.update({
        channel: loadingMessage.channel,
        ts: loadingMessage.ts,
        text: "There are no recent messages to summarize in this channel."
      });
      return;
    }
    
    // Format messages for the AI
    let conversationText = "Recent messages (newest first):\n\n";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      
      // Skip bot messages that are just status updates or our own summaries
      if (msg.subtype === 'bot_message' && 
          (msg.text.includes('Summarizing recent conversations') || 
           msg.text.includes('Daily Task Summary'))) {
        continue;
      }
      
      // Get user info if available
      let userName = 'Unknown User';
      if (msg.user) {
        try {
          const userInfo = await client.users.info({ user: msg.user });
          userName = userInfo.user.real_name || userInfo.user.name || msg.user;
        } catch (e) {
          userName = msg.user;
        }
      }
      
      conversationText += `${userName}: ${msg.text}\n\n`;
    }
    
    // Get summary from AI
    const summary = await getAIResponse(
      `Summarize the following conversation from a Slack channel:\n\n${conversationText}\n\n` + 
      `Please provide a concise summary that includes:\n` +
      `1. Main topics discussed\n` +
      `2. Any decisions made or action items\n` +
      `3. Key questions or unresolved issues\n` +
      `Format this clearly with bullet points and keep it brief and informative.`,
      'conversation'
    );
    
    // Update the loading message with the summary
    await client.chat.update({
      channel: loadingMessage.channel,
      ts: loadingMessage.ts,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Conversation Summary*`
          }
        },
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: summary
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `_Based on the last ${messages.length} messages in this channel_`
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error('Error handling /convo command:', error);
    await say(`<@${command.user_id}> Sorry, I encountered an error generating the conversation summary: ${error.message}`);
  }
}

module.exports = {
  handleConvoCommand
};
