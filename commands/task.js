// task.js - Handler for /task slash command
const { getAIResponse } = require('../utils/ai');
const { getConnection } = require('../utils/database');

/**
 * Summarize user's tasks from reminders
 * @param {Object} params - Parameters from Slack
 */
async function handleTaskCommand({ command, respond, client }) {
  try {
    const userId = command.user_id;
    
    // Initial response
    await respond({
      response_type: 'ephemeral',
      text: `Gathering task summary for <@${userId}>...`
    });
    
    // Get user's reminders from our database
    let activeReminders = [];
    try {
      const db = await getConnection();
      const result = await db.query(`
        SELECT task_name, reminder_time, completed 
        FROM reminders 
        WHERE user_id = $1 AND completed = false 
        ORDER BY reminder_time ASC
      `, [userId]);
      
      activeReminders = result.rows || [];
    } catch (dbError) {
      console.log('Database connection error:', dbError);
      // Fall back to empty array if database isn't available
    }

    // Format reminders for display
    let reminderText;
    if (activeReminders.length > 0) {
      reminderText = "Your current reminders:\n";
      activeReminders.forEach((reminder, index) => {
        const reminderTime = new Date(reminder.reminder_time);
        reminderText += `${index + 1}. ${reminder.task_name} (${reminderTime.toLocaleString()})\n`;
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
