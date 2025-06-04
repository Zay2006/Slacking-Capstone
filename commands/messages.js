// messages.js - Handlers for direct messages and mentions
const { getAIResponse } = require('../utils/ai');

// Track conversations to prevent duplicate responses
const messageTracker = new Map();

/**
 * Handle direct messages to the bot
 */
async function handleDirectMessage({ message, say, client }) {
  try {
    // Skip if we're already processing this message or it's undefined/empty
    if (!message || !message.ts || !message.text || messageTracker.has(message.ts)) {
      return;
    }
    
    // Mark this message as being processed
    messageTracker.set(message.ts, true);
    
    // Get message text and trim it
    const userText = message.text.trim() || '?';
    console.log(`Processing direct message: "${userText.substring(0, 20)}"`);
    
    // Show typing indicator
    const thinking = await say('_Thinking..._');
    
    // Get AI response for the direct message with the 'direct' command type
    const response = await getAIResponse(userText, 'direct');
    
    // Update the thinking message with the actual response
    try {
      await client.chat.update({
        channel: message.channel,
        ts: thinking.ts,
        text: response
      });
    } catch (updateError) {
      // If update fails, just send a new message
      console.warn('Failed to update message, sending new one:', updateError.message);
      await say(response);
    }
    
    // Remove from tracker after a short delay to prevent duplicate processing
    setTimeout(() => {
      messageTracker.delete(message.ts);
    }, 5000);
  } catch (error) {
    console.error('Error handling direct message:', error);
    await say("I'm having trouble processing your message right now. Please try again later.");
    // Remove from tracker on error
    if (message && message.ts) {
      messageTracker.delete(message.ts);
    }
  }
}

/**
 * Handle app mentions (@MilestoneMadness in channels)
 */
async function handleAppMention({ event, say, client }) {
  try {
    // Skip if we're already processing this message or it's undefined/empty
    if (!event || !event.ts || !event.text || messageTracker.has(event.ts)) {
      return;
    }
    
    // Mark this event as being processed
    messageTracker.set(event.ts, true);
    
    // Show typing indicator
    const thinking = await say('_Thinking..._');
    
    // Remove the mention from the message text
    const mentionPattern = new RegExp(`<@${event.bot_id}>`, 'g');
    const userText = (event.text || '').replace(mentionPattern, '').trim() || '?';
    
    console.log(`Processing mention: "${userText.substring(0, 20)}"`);
    
    // Check if the message contains a fun "is there anything you can't do" question
    const canDoPattern = /is there anything you (can('t|not)|cannot) do/i;
    if (canDoPattern.test(userText)) {
      const wittyResponses = [
        "I can't make a decent cup of coffee, but I can help you organize your project milestones! ☕️",
        "I can't solve the mysteries of the universe, but I can definitely help you draft that project proposal! 🌌",
        "I can't join your team happy hour, but I can help you schedule it! 🍻",
        "I can't beat you at ping pong, but I can help you track your tournament milestones! 🏓",
        "I can't write your code for you, but I can help you plan your development sprints! 💻"
      ];
      const randomResponse = wittyResponses[Math.floor(Math.random() * wittyResponses.length)];
      
      try {
        await client.chat.update({
          channel: event.channel,
          ts: thinking.ts,
          text: randomResponse
        });
      } catch (updateError) {
        await say(randomResponse);
      }
      
      // Remove from tracker after a short delay
      setTimeout(() => {
        messageTracker.delete(event.ts);
      }, 5000);
      
      return;
    }
    
    // Get AI response for the mention with the 'mention' command type
    const response = await getAIResponse(userText, 'mention');
    
    // Update the thinking message with the actual response
    try {
      await client.chat.update({
        channel: event.channel,
        ts: thinking.ts,
        text: response
      });
    } catch (updateError) {
      // If update fails, just send a new message
      console.warn('Failed to update message, sending new one:', updateError.message);
      await say(response);
    }
    
    // Remove from tracker after a short delay
    setTimeout(() => {
      messageTracker.delete(event.ts);
    }, 5000);
  } catch (error) {
    console.error('Error handling app mention:', error);
    await say("I'm having trouble processing your message right now. Please try again later.");
    
    // Remove from tracker on error
    if (event && event.ts) {
      messageTracker.delete(event.ts);
    }
  }
}

module.exports = {
  handleDirectMessage,
  handleAppMention
};
