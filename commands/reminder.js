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
 * Schedule a reminder to be sent at the specified time
 * @param {Object} reminderData - Reminder details
 * @param {Object} client - Slack client
 * @returns {string} - Reminder ID
 */
function scheduleReminder(reminderData, client) {
  const { userId, text, time, channel } = reminderData;
  const reminderTime = new Date(time);
  const now = new Date();
  const timeUntilReminder = reminderTime.getTime() - now.getTime();
  
  if (timeUntilReminder <= 0) {
    throw new Error('Cannot set reminder for a time in the past');
  }
  
  const reminderId = `reminder_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  // Schedule the reminder
  const timerId = setTimeout(async () => {
    try {
      // Send the reminder message
      await client.chat.postMessage({
        channel: channel,
        text: `🔔 *Reminder for <@${userId}>*: ${text}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `🔔 *Reminder for <@${userId}>*\n\n${text}`
            }
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `_This reminder was scheduled for ${formatDateForDisplay(time)}_`
              }
            ]
          }
        ]
      });
      
      // Remove from active reminders
      delete activeReminders[reminderId];
    } catch (error) {
      console.error('Error sending reminder:', error);
    }
  }, timeUntilReminder);
  
  // Store the reminder
  activeReminders[reminderId] = {
    id: reminderId,
    userId,
    text,
    time: reminderTime,
    timerId,
    channel
  };
  
  return reminderId;
}

/**
 * Handle the /reminder slash command
 * Sets reminders with smart time recommendations and task breakdowns
 */
async function handleReminderCommand({ command, ack, say, client }) {
  await ack();
  try {
    const reminderRequest = command.text;
    
    if (!reminderRequest) {
      await say(`<@${command.user_id}> What would you like me to remind you about? For example: "/reminder Submit quarterly report tomorrow at 3pm".`);
      return;
    }

    // Show a temporary message while we process
    const loadingMessage = await say(`Setting up a reminder for <@${command.user_id}>: *${reminderRequest}*\n\nProcessing...`);
    
    // Parse the date and time from the reminder text
    const { time, text } = await parseReminderDateTime(reminderRequest);
    
    // Format the time for display
    const displayTime = formatDateForDisplay(time);
    
    if (time) {
      try {
        // Schedule the reminder using our custom scheduler
        const reminderId = scheduleReminder({
          userId: command.user_id,
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
          text: `✅ *Reminder set for <@${command.user_id}>*\n\n` +
                `*Task:* ${text}\n` +
                `*When:* ${displayTime}\n\n` +
                `*Time Management Tips:*\n${timeAnalysis}\n\n` +
                `_You will be reminded at the scheduled time._`
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
        `The user wants a reminder for: "${reminderRequest}".\n` +
        `I couldn't determine a specific date/time.\n` +
        `Suggest some reasonable timeframes for this task.\n` +
        `Also provide a brief task breakdown with 2-3 steps.`, 
        'reminder'
      );
      
      await client.chat.update({
        channel: loadingMessage.channel,
        ts: loadingMessage.ts,
        text: `I couldn't determine when to remind you about "${reminderRequest}"\n\n` +
              `*Suggestions:*\n${timeAnalysis}\n\n` +
              `Please try again with a specific time, like "/reminder ${reminderRequest} tomorrow at 3pm".`
      });
    }
  } catch (error) {
    console.error('Error handling /reminder command:', error);
    await say(`<@${command.user_id}> Sorry, I encountered an error setting your reminder. Please try again later.`);
  }
}

// Export active reminders to make them accessible if needed
module.exports = { 
  handleReminderCommand,
  activeReminders
};
