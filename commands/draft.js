// draft.js - Handler for /draft slash command
const { getAIResponse } = require('../utils/ai');

/**
 * Handle the /draft slash command
 * Generates content drafts with tailored AI
 */
async function handleDraftCommand({ command, ack, say, client }) {
  // Acknowledge command request right away
  await ack();

  try {
    const draftRequest = command.text;
    
    if (!draftRequest) {
      await say(`<@${command.user_id}> What would you like me to draft for you? I can help with emails, announcements, presentations, and more.`);
      return;
    }

    await say(`<@${command.user_id}> I'm working on your draft for: *${draftRequest}*. Please wait a moment...`);
    
    // First get context about the draft request
    const analysisPrompt = `Analyze this draft request: "${draftRequest}"\n` +
                          `1. What type of content is being requested?\n` +
                          `2. What tone would be most appropriate?\n` +
                          `3. What key elements should be included?\n` +
                          `Answer these questions briefly to help prepare for creating this draft.`;
    
    const analysisResponse = await getAIResponse(analysisPrompt, 'draft');
    
    // Wait a moment to simulate thinking/analysis
    setTimeout(async () => {
      await say(`*Analysis for "${draftRequest}" draft:*\n${analysisResponse}`);
      
      // Now create the actual draft based on the analysis
      const draftPrompt = `Create a professional draft for: "${draftRequest}"\n` +
                        `Make it engaging, clear, and well-structured.\n` +
                        `If relevant, include appropriate formatting, sections, and any necessary elements like greetings or calls to action.\n` +
                        `Length should be appropriate for the content type.`;
      
      const draftResponse = await getAIResponse(draftPrompt, 'draft');
      
      // Add a short delay before showing the draft
      setTimeout(async () => {
        await say(`*Draft for "${draftRequest}" (requested by <@${command.user_id}>):*\n\n${draftResponse}`);
      }, 2000);
    }, 2000);
  } catch (error) {
    console.error('Error handling /draft command:', error);
    await say(`<@${command.user_id}> Sorry, I encountered an error creating your draft. Please try again later.`);
  }
}

module.exports = { handleDraftCommand };
