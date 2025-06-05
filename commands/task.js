// task.js - Handler for /task slash command
const { getAIResponse } = require('../utils/ai');

/**
 * Summarize user's tasks from reminders
 * @param {Object} params - Command parameters
 * @returns {Promise<void>}
 */
async function handleTaskCommand({ command, ack, say, client }) {
  await ack();
  
  try {
    const userId = command.user_id;
    const loadingMessage = await say(`Gathering task summary for <@${userId}>...`);
    
    // Get user's reminders through the Slack API
    const reminderResponse = await client.reminders.list({
      user: userId
    });
    
    const reminders = reminderResponse.reminders || [];
    const activeReminders = reminders.filter(r => !r.complete);
    
    // Format reminders for the AI
    let reminderText = "";
    if (activeReminders.length > 0) {
      reminderText = "Your current reminders:\n";
      activeReminders.forEach((reminder, index) => {
        const reminderTime = new Date(reminder.time * 1000);
        reminderText += `${index + 1}. ${reminder.text} (${reminderTime.toLocaleString()})\n`;
      });
    } else {
      reminderText = "You currently have no active reminders.";
    }
    
    // Get summary from AI
    const summary = await getAIResponse(
      `Summarize the following tasks for the user and create a prioritized action plan for them:\n\n${reminderText}\n\n` + 
      `Current time: ${new Date().toLocaleString()}\n` +
      `Please provide a brief, encouraging summary of their day's tasks with:\n` +
      `1. A short motivational message at the beginning\n` +
      `2. A prioritized list of tasks\n` +
      `3. Time management tips based on their current workload\n` +
      `Be conversational but concise.`,
      'task'
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
            text: `*Daily Task Summary for <@${userId}>*`
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
              text: `_Based on ${activeReminders.length} active reminder${activeReminders.length === 1 ? '' : 's'}_`
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error('Error handling /task command:', error);
    await say(`<@${command.user_id}> Sorry, I encountered an error generating your task summary: ${error.message}`);
  }
}

module.exports = {
  handleTaskCommand
};
