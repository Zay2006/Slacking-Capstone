// convo.js - Handler for /convo slash command
const { getAIResponse } = require('../utils/ai');

/**
 * Summarize recent conversations in a channel
 * @param {Object} params - Command parameters
 * @returns {Promise<void>}
 */
async function handleConvoCommand({ command, respond, client }) {
  try {
    const userId = command.user_id;
    const channelId = command.channel_id;
    
    // Initial response
    await respond({
      response_type: 'ephemeral',
      text: `Summarizing recent conversations in this channel...`
    });
    
    let limit = 50; // Default message limit
    
    // Check if user specified a custom limit
    if (command.text) {
      const parsedLimit = parseInt(command.text);
      if (!isNaN(parsedLimit) && parsedLimit > 0 && parsedLimit <= 100) {
        limit = parsedLimit;
      }
    }
    
    // Get recent messages from the channel
    let messages = [];
    try {
      if (client && client.conversations && client.conversations.history) {
        const historyResponse = await client.conversations.history({
          channel: channelId,
          limit: limit
        });
        
        messages = historyResponse.messages || [];
      } else {
        throw new Error('Slack client not available in this environment');
      }
    } catch (slackError) {
      console.error('Error fetching conversation history:', slackError);
      await respond({
        response_type: 'ephemeral',
        text: `I couldn't access the channel history: ${slackError.message}`
      });
      return;
    }
    
    if (messages.length === 0) {
      await respond({
        response_type: 'ephemeral',
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
           msg.text.includes('Conversation Summary'))) {
        continue;
      }
      
      let sender = "Unknown User";
      try {
        // Try to get user info, but don't fail if we can't
        if (msg.user && client && client.users && client.users.info) {
          const userInfo = await client.users.info({ user: msg.user });
          sender = userInfo.user.real_name || userInfo.user.name || `<@${msg.user}>`;
        } else {
          sender = `<@${msg.user || 'unknown'}>`;
        }
      } catch (userError) {
        console.warn('Could not fetch user info:', userError.message);
        sender = `<@${msg.user || 'unknown'}>`;
      }
      
      // Add the message to our conversation text
      conversationText += `${sender}: ${msg.text || "[No text content]"}\n\n`;
    }
    
    // Get AI to summarize the conversation
    console.log('Getting AI summary of conversation...');
    const summaryPrompt = `
      Summarize the following Slack conversation in a clear, concise way:
      ${conversationText}
      
      Focus on:
      1. Main topics discussed
      2. Any decisions made
      3. Action items or follow-ups mentioned
      4. Key questions raised
      
      Format your response as a professional Slack message with sections.
    `;
    
    const summary = await getAIResponse(summaryPrompt, 'convo');
    
    // Post the summary to the channel
    await respond({
      response_type: 'in_channel',
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "💬 Conversation Summary",
            emoji: true
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `*Requested by:* <@${userId}> | *Messages analyzed:* ${messages.length}`
            }
          ]
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
        }
      ]
    });
  } catch (error) {
    console.error('Error handling /convo command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `Sorry, I encountered an error summarizing the conversation: ${error.message}`
    });
  }
}

module.exports = {
  handleConvoCommand
};
