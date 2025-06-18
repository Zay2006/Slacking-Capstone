// describe.js - Handler for /describe slash command

/**
 * Handle the /describe slash command
 * Provides information about what the Milestone Madness bot can do
 */
async function handleDescribeCommand({ command, respond }) {
  try {
    // For slash commands in serverless, we use respond with response_type: 'in_channel'
    await respond({
      response_type: 'in_channel',
      blocks: [
        {
          "type": "header",
          "text": {
            "type": "plain_text",
            "text": "🚀 Milestone Madness Bot",
            "emoji": true
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": "*Your AI Project Assistant*\nBuilt with OpenAI & Slack API"
            },
            {
              "type": "mrkdwn",
              "text": "*Status:* 🟢 Ready to assist\n*Mood:* Slightly snarky"
            }
          ]
        },
        {
          "type": "image",
          "image_url": "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=2070&auto=format&fit=crop",
          "alt_text": "Project management visuals"
        },
        {
          "type": "divider"
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*🔥 SUPERCHARGED COMMANDS:*"
          }
        },
        {
          "type": "section",
          "fields": [
            {
              "type": "mrkdwn",
              "text": "*💬 Chat*\nTag me with <@Milestone Madness>\n_Ask anything, get smart answers_"
            },
            {
              "type": "mrkdwn",
              "text": "*🔍 /audit*\nAnalyze project data\n_Get actionable insights_"
            }
          ]
        },
        {
          "type": "section",
          "text": {
            "type": "mrkdwn",
            "text": "*Pro tip:* Try asking me '_Is there anything you can't do?_' for a surprise! 😏"
          },
          "accessory": {
            "type": "button",
            "text": {
              "type": "plain_text",
              "text": "Try Me",
              "emoji": true
            },
            "value": "try_me",
            "action_id": "try_bot"
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error handling /describe command:', error);
  }
}

module.exports = { handleDescribeCommand };
