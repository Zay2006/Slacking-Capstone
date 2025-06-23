// reminder.js - Handler for /reminder slash command
const { getAIResponse } = require('../utils/ai');

// Global object to store active reminders - NOTE: this won't persist in serverless
// Consider moving this to a database
const activeReminders = {};

// Get database pool safely (for future database storage)
function getPool() {
  try {
    if (global.vercelPool) {
      console.log('Using global vercelPool in reminder command');
      return global.vercelPool;
    } else {
      console.error('Global vercelPool not available');
      throw new Error('Database connection not available');
    }
  } catch (error) {
    console.error('Error accessing global pool:', error);
    throw new Error('Database connection not available');
  }
}

/**
 * Extract date and time information from a reminder request using AI
 * @param {string} reminderText - The text of the reminder
 * @returns {Promise<{time: string, text: string}>}
 */
async function parseReminderDateTime(reminderText) {
  try {
    // Get current date and time details for smart parsing
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    
    const parseResult = await getAIResponse(
      `Parse the following reminder request: "${reminderText}".\n` +
      `Extract the date and time information and return ONLY a JSON object with the following format: ` +
      `{"time": "YYYY-MM-DD HH:MM", "text": "the reminder text without date/time info"}\n` +
      
      `IMPORTANT PARSING RULES:\n` +
      `1. For relative times like "tomorrow at 1pm", convert to absolute date/time.\n` +
      `2. Use 24-hour format for time (e.g., 13:00 not 1:00 PM).\n` +
      `3. Current date and time is: ${currentDate} ${currentHour}:${currentMinute.toString().padStart(2, '0')}.\n` +
      `4. If no specific time is mentioned, default to 9:00 AM.\n` +
      `5. For times specified for TODAY: If the time is still upcoming today (even by a few minutes), keep it for today. Only move to tomorrow if the time is significantly past (more than 1 hour ago).\n` +
      `6. If "next Monday" is mentioned and today is Monday, assume the user means NEXT week's Monday.\n` +
      
      `IMPORTANT: Return ONLY the JSON object without any other text.`, 
      'reminder'
    );
    
    // Extract the JSON object from the response
    const jsonMatch = parseResult.match(/\{.*\}/s);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        
        // Additional safeguard: If time is in the past, adjust to tomorrow
        if (parsed.time) {
          const reminderDate = new Date(parsed.time);
          const now = new Date();
          
          // Only adjust if the time is more than 1 hour in the past
          // This prevents same-day reminders from being moved to tomorrow
          const timeDiff = reminderDate.getTime() - now.getTime();
          if (timeDiff < -3600000) { // More than 1 hour in the past
            // Time is significantly in the past, move to tomorrow
            reminderDate.setDate(reminderDate.getDate() + 1);
            parsed.time = reminderDate.toISOString().split('.')[0].replace('T', ' ');
            console.log(`Adjusted past time to tomorrow: ${parsed.time}`);
          }
        }
        
        return parsed;
      } catch (e) {
        console.error('Failed to parse reminder JSON:', e);
        return { time: null, text: reminderText };
      }
    }
    return { time: null, text: reminderText };
  } catch (error) {
    console.error('Error parsing reminder date/time:', error);
    return { time: null, text: reminderText };
  }
}

/**
 * Format a date string for display in Slack
 * @param {string} dateTimeStr - ISO date string or YYYY-MM-DD HH:MM format
 * @returns {string} - Formatted date string
 */
function formatDateForDisplay(dateTimeStr) {
  if (!dateTimeStr) return 'unspecified time';
  
  try {
    const date = new Date(dateTimeStr);
    return date.toLocaleString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
  } catch (e) {
    return dateTimeStr;
  }
}

/**
 * Schedule a reminder using Slack's chat.scheduleMessage API (works with bot tokens)
 * @param {Object} reminderData - Reminder details
 * @param {Object} client - Slack client
 * @returns {Promise<Object>} - Scheduled message response
 */
async function scheduleReminder(reminderData, client) {
  const { userId, text, time, channel } = reminderData;
  const reminderTime = new Date(time);
  const now = new Date();
  const timeUntilReminder = reminderTime.getTime() - now.getTime();
  
  if (timeUntilReminder <= 0) {
    throw new Error('Cannot set reminder for a time in the past');
  }

  // Convert time to Unix timestamp (seconds)
  const timestamp = Math.floor(reminderTime.getTime() / 1000);
  
  try {
    // Use chat.scheduleMessage which works with bot tokens
    const response = await client.chat.scheduleMessage({
      channel: channel, // Send to the channel where reminder was created
      text: `🔔 <@${userId}> Reminder: ${text}`,
      post_at: timestamp,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `🔔 <@${userId}> *Reminder:* ${text}`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Scheduled by <@${userId}> on ${new Date().toLocaleString()}`
            }
          ]
        }
      ]
    });

    // Store the scheduled message info
    const reminderId = response.scheduled_message_id;
    activeReminders[reminderId] = {
      id: reminderId,
      userId,
      text,
      time: reminderTime,
      channel,
      scheduled_message_id: reminderId
    };

    return {
      id: reminderId,
      text,
      time: timestamp
    };
  } catch (error) {
    console.error('Error scheduling reminder message:', error);
    throw new Error(`Failed to schedule reminder: ${error.message}`);
  }
}

/**
 * Handle the /reminder slash command
 */
async function handleReminderCommand({ command, client, respond }) {
  // Command structure: /reminder [task] [time]
  // or /reminder list
  // or /reminder delete [id]
  
  const { text } = command;
  const trimmedText = text?.trim() || '';
  
  // Display help for the reminder command if no text is provided
  if (!trimmedText) {
    await respond({
      text: "Here's how to use the reminder command:\n" +
            "Create a reminder:\n" +
            "/reminder [task] [time]\n" +
            "Example: /reminder Submit report tomorrow at 3pm\n\n" +
            "List your reminders:\n" +
            "/reminder list\n\n" +
            "Delete a reminder:\n" +
            "/reminder delete [reminder_id]",
      response_type: 'ephemeral'
    });
    return;
  }
  
  // Check if the command is to create a new reminder
  if (trimmedText && !trimmedText.startsWith('list') && !trimmedText.startsWith('delete')) {
    try {
      const userId = command.user_id;
      const reminderText = trimmedText;
      
      // Show a temporary message while we process
      const loadingMessage = await respond({
        response_type: 'ephemeral',
        text: `Setting up a reminder for <@${userId}>: *${reminderText}*\n\nProcessing...`
      });
    
    // Parse the date and time from the reminder text
    const { time, text: reminderContent } = await parseReminderDateTime(reminderText);
    
    // Format the time for display
    const displayTime = formatDateForDisplay(time);
    
    if (time) {
      try {
        // Schedule the reminder using Slack's reminders API
        const reminder = await scheduleReminder({
          userId: userId,
          text: reminderContent,
          time: time,
          channel: command.channel_id
        }, null);
        
        // Analyze the task and provide recommendations
        const timeAnalysis = await getAIResponse(
          `Analyze this task: "${text}". \n` +
          `1. How complex is this task on a scale of 1-5?\n` +
          `2. How much time would be reasonable to allocate to this task?\n` +
          `3. Should this be broken down into smaller sub-tasks?\n` +
          `Present this as helpful time management advice.`, 
          'reminder'
        );
        
        // Update the loading message with confirmation and task analysis
        await respond({
          response_type: 'ephemeral',
          replace_original: true,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `✅ *Reminder set for <@${userId}>*`
              }
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Task:*\n${text}`
                },
                {
                  type: "mrkdwn",
                  text: `*When:*\n${displayTime}`
                }
              ]
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Time Management Tips:*\n${timeAnalysis}`
              }
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `_Reminder ID: ${reminder.id}_`
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
                    text: "Delete Reminder",
                    emoji: true
                  },
                  value: reminder.id,
                  action_id: "delete_reminder"
                }
              ]
            }
          ]
        });
      } catch (reminderError) {
        console.error('Error setting reminder:', reminderError);
        
        await respond({
          response_type: 'ephemeral',
          replace_original: true,
          text: `⚠️ I couldn't set your reminder (${reminderError.message}).\n\n` +
                `*Task:* ${text}\n` +
                `*When:* ${displayTime}\n\n` +
                `Please try again with a future date and time.`
        });
      }
    } else {
      // If we couldn't parse a time, provide AI assistance without setting a reminder
      const timeAnalysis = await getAIResponse(
        `The user wants a reminder for: "${reminderText}".\n` +
        `I couldn't determine a specific date/time.\n` +
        `Suggest some reasonable timeframes for this task.\n` +
        `Also provide a brief task breakdown with 2-3 steps.`, 
        'reminder'
      );
      
      await respond({
        response_type: 'ephemeral',
        replace_original: true,
        text: `I couldn't determine when to remind you about "${reminderText}"\n\n` +
              `*Suggestions:*\n${timeAnalysis}\n\n` +
              `Please try again with a specific time, like "/reminder ${reminderText} tomorrow at 3pm".`
      });
    }
  } catch (error) {
    console.error('Error handling /reminder command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `<@${command.user_id}> Sorry, I encountered an error setting your reminder. Please try again later.`
    });
  }
  }
}

/**
 * List all reminders for a user
 * @param {string} userId - Slack user ID
 * @param {string} channelId - Channel ID
 * @param {Object} client - Slack client
 * @param {Function} say - Slack say function
 */
async function listUserReminders(userId, channelId, client, respond) {
  try {
    // Check if client is available
    if (!client || !client.chat || !client.chat.scheduledMessages) {
      console.error('Slack client not available for reminders');
      await respond({
        text: "Sorry, I can't access the Slack API in this environment.",
        response_type: 'ephemeral'
      });
      return [];
    }
    
    // Use Slack's scheduledMessages.list API (which works with bot tokens)
    const response = await client.chat.scheduledMessages.list({
      channel: channelId // Scheduled messages are channel-specific
    });
    
    // Filter out scheduled messages that aren't actually reminders for this user
    // You may need to adjust this logic based on how you identify your reminders
    const reminders = response.scheduled_messages.filter(msg => 
      // Look for messages that contain @[userId] and Reminder: as pattern
      msg.text.includes(`<@${userId}>`) && msg.text.includes('Reminder:')
    );
    
    if (!reminders || reminders.length === 0) {
      await respond({
        text: `<@${userId}> You don't have any active reminders.`,
        response_type: 'ephemeral'
      });
      return;
    }
    
    const reminderBlocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<@${userId}> Here are your current reminders:`
        }
      }
    ];
    
    // Sort by post_at time (closest first)
    const sortedReminders = [...reminders].sort((a, b) => a.post_at - b.post_at);
    
    sortedReminders.forEach(reminder => {
      // Extract the actual reminder text without the user mention and prefix
      const reminderText = reminder.text.replace(`🔔 <@${userId}> Reminder: `, '');
      const reminderTime = new Date(reminder.post_at * 1000); // Convert Unix timestamp to JS Date
      const displayTime = formatDateForDisplay(reminderTime.toISOString());
      
      reminderBlocks.push({
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Task:*\n${reminderText}`
          },
          {
            type: "mrkdwn",
            text: `*When:*\n${displayTime}`
          }
        ],
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Delete",
            emoji: true
          },
          value: reminder.id,
          action_id: "delete_reminder"
        }
      });
      
      // Add a divider between reminders
      reminderBlocks.push({
        type: "divider"
      });
    });
    
    // Remove the last divider
    if (reminderBlocks.length > 1) {
      reminderBlocks.pop();
    }
    
    await respond({
      text: `${userId} Here are your current reminders.`,
      blocks: reminderBlocks,
      response_type: 'ephemeral'
    });
  } catch (error) {
    console.error('Error listing reminders:', error);
    await respond({
      text: `<@${userId}> Sorry, I encountered an error retrieving your reminders: ${error.message}`,
      response_type: 'ephemeral'
    });
  }
}

/**
 * Delete a scheduled message reminder
 * @param {string} scheduledMessageId - Scheduled message ID
 * @param {string} userId - User ID
 * @param {string} channelId - Channel ID
 * @param {Object} client - Slack client
 * @param {Function} say - Slack say function
 */
async function deleteReminder(scheduledMessageId, userId, channelId, client, say) {
  try {
    // Use Slack's chat.deleteScheduledMessage API
    await client.chat.deleteScheduledMessage({
      channel: channelId,
      scheduled_message_id: scheduledMessageId
    });
    
    // Clean up our tracking object if it exists there
    if (activeReminders[scheduledMessageId]) {
      delete activeReminders[scheduledMessageId];
    }
    
    await say(`<@${userId}> Your reminder has been deleted.`);
  } catch (error) {
    console.error('Error deleting scheduled reminder:', error);
    await say(`<@${userId}> Sorry, I couldn't delete that reminder: ${error.message}`);
  }
}

/**
 * Handle delete reminder button action
 * @param {Object} payload - Button click payload
 * @param {Object} client - Slack client
 * @param {Function} ack - Acknowledge function
 * @param {Function} respond - Respond function
 * @param {Object} body - Body of the request
 */
async function handleDeleteReminderAction({ payload, client, ack, respond, body }) {
  await ack();
  
  console.log('Delete reminder action payload:', JSON.stringify(payload, null, 2));
  console.log('Delete reminder action body:', JSON.stringify(body, null, 2));
  
  // Get values from the action handler parameters
  const scheduledMessageId = payload?.value;
  const userId = body?.user?.id;
  const channel = body?.channel?.id;
  
  console.log('Extracted values:', { scheduledMessageId, userId, channel });
  
  // Validate required fields
  if (!scheduledMessageId || !userId || !channel) {
    console.error('Missing required fields in delete reminder payload:', { scheduledMessageId, userId, channel });
    await respond({
      response_type: 'ephemeral',
      text: 'Sorry, I couldn\'t delete the reminder due to missing information.'
    });
    return;
  }
  
  try {
    // Handle different payload structures
    if (body.actions && body.actions.length > 0) {
      scheduledMessageId = body.actions[0].value;
    } else if (body.value) {
      scheduledMessageId = body.value;
    } else {
      throw new Error('Could not find reminder ID in the action payload');
    }
    
    userId = body.user?.id || '';
    channel = body.channel?.id || '';
    
    if (!scheduledMessageId || !userId || !channel) {
      throw new Error('Missing required information to delete reminder');
    }

    console.log(`Attempting to delete reminder ${scheduledMessageId} for user ${userId} in channel ${channel}`);
    
    // Use Slack's chat.deleteScheduledMessage API
    await client.chat.deleteScheduledMessage({
      channel: channel,
      scheduled_message_id: scheduledMessageId
    });
    
    // Clean up our tracking object if it exists there 
    // Note: This won't work reliably in serverless environment
    if (activeReminders[scheduledMessageId]) {
      delete activeReminders[scheduledMessageId];
    }
    
    // Respond to the action
    await client.chat.postMessage({
      channel: channel,
      text: `<@${userId}> Your reminder has been deleted.`
    });
    
    return { success: true };
  } catch (error) {
    console.error('Error deleting scheduled reminder:', error);
    
    // Try to notify the user if possible
    if (client && channel) {
      try {
        await client.chat.postMessage({
          channel: channel,
          text: `<@${userId || 'user'}> Sorry, I couldn't delete that reminder: ${error.message}`
        });
      } catch (notifyError) {
        console.error('Failed to notify user about deletion error:', notifyError);
      }
    }
    
    return { 
      success: false,
      error: error.message
    };
  }
}

// Export active reminders to make them accessible if needed
module.exports = { 
  handleReminderCommand,
  handleDeleteReminderAction,
  activeReminders
};
