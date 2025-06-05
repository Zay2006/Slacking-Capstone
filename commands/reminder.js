// reminder.js - Handler for /reminder slash command
const { getAIResponse } = require('../utils/ai');

// Global object to store active reminders
const activeReminders = {};

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
      `5. If the time specified for TODAY has already passed, assume the user means TOMORROW at that time.\n` +
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
          if (reminderDate < now) {
            // Time is in the past, move to tomorrow
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
 * Schedule a reminder using Slack's reminders.add API
 * @param {Object} reminderData - Reminder details
 * @param {Object} client - Slack client
 * @returns {Promise<Object>} - Slack reminder response
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
    // Use Slack's reminders.add API
    const response = await client.reminders.add({
      text: text,
      time: timestamp,
      user: userId
    });

    // Store the reminder ID in our tracking object
    const reminderId = response.reminder.id;
    activeReminders[reminderId] = {
      id: reminderId,
      userId,
      text,
      time: reminderTime,
      channel,
      slackReminder: true
    };

    return response.reminder;
  } catch (error) {
    console.error('Error creating Slack reminder:', error);
    throw new Error(`Failed to create Slack reminder: ${error.message}`);
  }
}

/**
 * Handle the /reminder slash command
 * Sets reminders with smart time recommendations and task breakdowns
 * 
 * Command formats:
 * /reminder [text] [time] - Create a new reminder
 * /reminder list - List your current reminders
 * /reminder delete [reminder_id] - Delete a specific reminder
 */
async function handleReminderCommand({ command, ack, say, client }) {
  await ack();
  try {
    const reminderText = command.text.trim();
    const userId = command.user_id;
    
    // Handle subcommands
    if (reminderText === 'list' || reminderText === 'show' || reminderText === 'all') {
      await listUserReminders(userId, command.channel_id, client, say);
      return;
    }
    
    if (reminderText.startsWith('delete') || reminderText.startsWith('remove')) {
      const parts = reminderText.split(' ');
      if (parts.length >= 2) {
        const reminderId = parts[1].trim();
        await deleteReminder(reminderId, userId, command.channel_id, client, say);
        return;
      } else {
        await say(`<@${userId}> Please specify which reminder to delete, for example: "/reminder delete RmID".`);
        return;
      }
    }
    
    // If no recognized subcommand, create a new reminder
    if (!reminderText) {
      await say({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `<@${userId}> Here's how to use the reminder command:`
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*Create a reminder:*\n`/reminder [task] [time]`\nExample: `/reminder Submit report tomorrow at 3pm`"
            }
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "*List your reminders:*\n`/reminder list`\n\n*Delete a reminder:*\n`/reminder delete [reminder_id]`"
            }
          }
        ]
      });
      return;
    }

    // Show a temporary message while we process
    const loadingMessage = await say(`Setting up a reminder for <@${userId}>: *${reminderText}*\n\nProcessing...`);
    
    // Parse the date and time from the reminder text
    const { time, text } = await parseReminderDateTime(reminderText);
    
    // Format the time for display
    const displayTime = formatDateForDisplay(time);
    
    if (time) {
      try {
        // Schedule the reminder using Slack's reminders API
        const reminder = await scheduleReminder({
          userId: userId,
          text: text,
          time: time,
          channel: command.channel_id
        }, client);
        
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
        await client.chat.update({
          channel: loadingMessage.channel,
          ts: loadingMessage.ts,
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
        
        await client.chat.update({
          channel: loadingMessage.channel,
          ts: loadingMessage.ts,
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
      
      await client.chat.update({
        channel: loadingMessage.channel,
        ts: loadingMessage.ts,
        text: `I couldn't determine when to remind you about "${reminderText}"\n\n` +
              `*Suggestions:*\n${timeAnalysis}\n\n` +
              `Please try again with a specific time, like "/reminder ${reminderText} tomorrow at 3pm".`
      });
    }
  } catch (error) {
    console.error('Error handling /reminder command:', error);
    await say(`<@${command.user_id}> Sorry, I encountered an error setting your reminder. Please try again later.`);
  }
}

/**
 * List all reminders for a user
 * @param {string} userId - Slack user ID
 * @param {string} channelId - Channel ID
 * @param {Object} client - Slack client
 * @param {Function} say - Slack say function
 */
async function listUserReminders(userId, channelId, client, say) {
  try {
    // Use Slack's reminders.list API
    const response = await client.reminders.list({
      user: userId
    });
    
    const reminders = response.reminders;
    
    if (!reminders || reminders.length === 0) {
      await say(`<@${userId}> You don't have any active reminders.`);
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
    
    // Sort by time (closest first)
    const sortedReminders = [...reminders].filter(r => !r.complete).sort((a, b) => a.time - b.time);
    
    sortedReminders.forEach(reminder => {
      const reminderTime = new Date(reminder.time * 1000); // Convert Unix timestamp to JS Date
      const displayTime = formatDateForDisplay(reminderTime.toISOString());
      
      reminderBlocks.push({
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Task:*\n${reminder.text}`
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
    
    await say({
      blocks: reminderBlocks
    });
  } catch (error) {
    console.error('Error listing reminders:', error);
    await say(`<@${userId}> Sorry, I encountered an error retrieving your reminders: ${error.message}`);
  }
}

/**
 * Delete a reminder
 * @param {string} reminderId - Reminder ID
 * @param {string} userId - User ID
 * @param {string} channelId - Channel ID
 * @param {Object} client - Slack client
 * @param {Function} say - Slack say function
 */
async function deleteReminder(reminderId, userId, channelId, client, say) {
  try {
    // Use Slack's reminders.delete API
    await client.reminders.delete({
      reminder: reminderId
    });
    
    // Clean up our tracking object if it exists there
    if (activeReminders[reminderId]) {
      delete activeReminders[reminderId];
    }
    
    await say(`<@${userId}> Your reminder has been deleted.`);
  } catch (error) {
    console.error('Error deleting reminder:', error);
    await say(`<@${userId}> Sorry, I couldn't delete that reminder: ${error.message}`);
  }
}

/**
 * Handle delete reminder button action
 * @param {Object} payload - Button click payload
 * @param {Object} client - Slack client
 * @param {Function} ack - Acknowledge function
 * @param {Function} respond - Respond function
 */
async function handleDeleteReminderAction({ payload, client, ack, respond }) {
  await ack();
  
  const reminderId = payload.value;
  const userId = payload.user.id;
  
  try {
    // Use Slack's reminders.delete API
    await client.reminders.delete({
      reminder: reminderId
    });
    
    // Clean up our tracking object if it exists there
    if (activeReminders[reminderId]) {
      delete activeReminders[reminderId];
    }
    
    // Update the message to show the reminder was deleted
    await respond({
      replace_original: true,
      text: `✅ <@${userId}> Your reminder has been deleted.`
    });
  } catch (error) {
    console.error('Error handling delete reminder action:', error);
    await respond({
      replace_original: false,
      text: `⚠️ <@${userId}> Sorry, I couldn't delete that reminder: ${error.message}`
    });
  }
}

// Export active reminders to make them accessible if needed
module.exports = { 
  handleReminderCommand,
  handleDeleteReminderAction,
  activeReminders
};
