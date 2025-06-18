// task.js - Handler for /task slash command
const { getAIResponse } = require('../utils/ai');

/**
 * Summarize user's tasks from reminders
 * @param {Object} params - Command parameters
 * @returns {Promise<void>}
 */
async function handleTaskCommand({ command, respond, client }) {
  try {
    const userId = command.user_id;
    
    // Initial response
    await respond({
      response_type: 'ephemeral',
      text: `Gathering task summary for <@${userId}>...`
    });
    
    // Check if client is available
    if (!client || !client.reminders || !client.reminders.list) {
      await respond({
        response_type: 'ephemeral',
        text: `Sorry, I can't access the Slack Reminders API in this environment.`
      });
      return;
    }
    
    // Get user's reminders through the Slack API
    let reminders = [];
    try {
      const reminderResponse = await client.reminders.list({
        user: userId
      });
      
      reminders = reminderResponse.reminders || [];
    } catch (slackError) {
      console.error('Error fetching reminders:', slackError);
      await respond({
        response_type: 'ephemeral',
        text: `I couldn't retrieve your reminders: ${slackError.message}`
      });
      return;
    }
    
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
    console.log('Getting AI task summary...');
    const summaryPrompt = `
      Summarize the following tasks for the user and create a prioritized action plan for them:

      ${reminderText}

      Current time: ${new Date().toLocaleString()}
      
      Please provide a brief, encouraging summary of their day's tasks with:
      1. A short motivational message at the beginning
      2. A prioritized list of tasks
      3. Time management tips based on their current workload
      
      Be conversational but concise.
    `;
    
    const summary = await getAIResponse(summaryPrompt, 'task');
    
    // Send the summary to the user
    await respond({
      response_type: 'ephemeral',
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📋 Your Task Summary",
            emoji: true
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
              text: `_Based on ${activeReminders.length} active reminders_`
            }
          ]
        }
      ]
    });
  } catch (error) {
    console.error('Error handling /task command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `Sorry, I encountered an error generating your task summary: ${error.message}`
    });
  }
}

module.exports = {
  handleTaskCommand
};
