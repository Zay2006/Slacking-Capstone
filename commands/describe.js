// describe.js - Handler for /describe slash command

/**
 * Handle the /describe slash command
 * Provides information about what the Milestone Madness bot can do
 */
async function handleDescribeCommand({ command, ack, say }) {
  await ack();
  try {
    await say({
      text: "🚀 *Milestone Madness - Your AI-Powered Project Assistant* 🚀\n\n" +
            "I'm an intelligent Slack bot designed to help you track business milestones, audit data, create professional drafts, and manage your projects effectively.\n\n" +
            "*Key Capabilities:*\n" +
            "• *AI-Powered Conversations:* Ask me questions directly in channels or DMs\n" +
            "• */audit:* Get detailed analysis of your data, processes, or metrics\n" +
            "• */draft:* Generate tailored professional content with recommendations\n" +
            "• */reminder:* Set reminders with smart time recommendations and task breakdowns\n\n" +
            "Built with Bolt.js and integrated with OpenAI's powerful language model to provide you with intelligent, context-aware assistance.\n\n" +
            "Need help? Just mention me in a channel or send me a direct message!\n" +
            "Try asking 'Is there anything you can't do?' for a fun response! 😉"
    });
  } catch (error) {
    console.error('Error handling /describe command:', error);
    await say(`<@${command.user_id}> Sorry, I encountered an error displaying my capabilities. Please try again later.`);
  }
}

module.exports = { handleDescribeCommand };
