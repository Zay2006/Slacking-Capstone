// messages.js - Handlers for direct messages and mentions
const { getAIResponse } = require('../utils/ai');

// Note: In a serverless environment, this won't persist between function invocations
// This is just a temporary solution to prevent duplicate responses within a single function execution
const processingMessages = new Set();

/**
 * Handle direct messages to the bot
 */
async function handleDirectMessage({ message, client }) {
  try {
    // Skip if message is undefined/empty or already being processed
    if (!message || !message.ts || !message.text) {
      return;
    }
    
    const messageId = message.ts;
    if (processingMessages.has(messageId)) {
      return;
    }
    
    // Mark this message as being processed
    processingMessages.add(messageId);
    
    // Get message text and trim it
    const userText = message.text.trim() || '?';
    console.log(`Processing direct message: "${userText.substring(0, 20)}..."`);
    
    // Post thinking message
    let thinkingMsg;
    try {
      thinkingMsg = await client.chat.postMessage({
        channel: message.channel,
        text: '_Thinking..._'
      });
    } catch (postError) {
      console.error('Failed to post thinking message:', postError);
      // Continue without the thinking message
    }
    
    // Get AI response for the direct message with the 'direct' command type
    const response = await getAIResponse(userText, 'direct');
    
    // Update the thinking message with the actual response
    if (thinkingMsg && thinkingMsg.ts) {
      try {
        await client.chat.update({
          channel: message.channel,
          ts: thinkingMsg.ts,
          text: response
        });
      } catch (updateError) {
        // If update fails, just send a new message
        console.warn('Failed to update message, sending new one:', updateError.message);
        await client.chat.postMessage({
          channel: message.channel,
          text: response
        });
      }
    } else {
      // If no thinking message was successfully posted, send the response directly
      await client.chat.postMessage({
        channel: message.channel,
        text: response
      });
    }
    
    // Clean up
    processingMessages.delete(messageId);
  } catch (error) {
    console.error('Error handling direct message:', error);
    try {
      await client.chat.postMessage({
        channel: message.channel,
        text: "I'm having trouble processing your message right now. Please try again later."
      });
    } catch (finalError) {
      console.error('Failed to send error message:', finalError);
    }
  }
}

/**
 * Handle app mentions (@MilestoneMadness in channels)
 */
async function handleAppMention({ event, client }) {
  try {
    // Skip if we're already processing this message or it's undefined/empty
    if (!event || !event.ts || !event.text) {
      return;
    }
    
    const messageId = event.ts;
    if (processingMessages.has(messageId)) {
      return;
    }
    
    // Mark this event as being processed
    processingMessages.add(messageId);
    
    // Post thinking message
    let thinkingMsg;
    try {
      thinkingMsg = await client.chat.postMessage({
        channel: event.channel,
        text: '_Thinking..._'
      });
    } catch (postError) {
      console.error('Failed to post thinking message:', postError);
      // Continue without the thinking message
    }
    
    // Remove the mention from the message text
    const botUserId = event.authorizations?.[0]?.user_id || event.bot_id;
    const mentionPattern = new RegExp(`<@${botUserId}>`, 'g');
    const userText = (event.text || '').replace(mentionPattern, '').trim() || '?';
    
    console.log(`Processing mention: "${userText.substring(0, 20)}..."`);
    
    // Check if the message contains a fun "is there anything you can't do" question
    const canDoPattern = /is there anything you (can('t|not)|cannot) do/i;
    let response;
    
    if (canDoPattern.test(userText)) {
      const wittyResponses = [
        "I can't make a decent cup of coffee, but I can help you organize your project milestones! ☕️",
        "I can't solve the mysteries of the universe, but I can definitely help you draft that project proposal! 🌌",
        "I can't join your team happy hour, but I can help you schedule it! 🍻",
        "I can't beat you at ping pong, but I can help you track your tournament milestones! 🏓",
        "I can't write your code for you, but I can help you plan your development sprints! 💻"
      ];
      response = wittyResponses[Math.floor(Math.random() * wittyResponses.length)];
    } else {
      // Get AI response for the mention with the 'mention' command type
      response = await getAIResponse(userText, 'mention');
    }
    
    // Update the thinking message with the actual response or send a new message
    if (thinkingMsg && thinkingMsg.ts) {
      try {
        await client.chat.update({
          channel: event.channel,
          ts: thinkingMsg.ts,
          text: response
        });
      } catch (updateError) {
        console.warn('Failed to update message, sending new one:', updateError.message);
        await client.chat.postMessage({
          channel: event.channel,
          text: response
        });
      }
    } else {
      await client.chat.postMessage({
        channel: event.channel,
        text: response
      });
    }
    
    // Clean up
    processingMessages.delete(messageId);
  } catch (error) {
    console.error('Error handling app mention:', error);
    try {
      await client.chat.postMessage({
        channel: event.channel,
        text: "I'm having trouble processing your mention right now. Please try again later."
      });
    } catch (finalError) {
      console.error('Failed to send error message:', finalError);
    }
  }
}

module.exports = {
  handleDirectMessage,
  handleAppMention
};
