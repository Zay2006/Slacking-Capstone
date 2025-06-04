// audit.js - Handler for /audit slash command
const { getAIResponse } = require('../utils/ai');

/**
 * Handle the /audit slash command
 * Provides audit analysis for data, processes, metrics, etc.
 */
async function handleAuditCommand({ command, ack, say }) {
  await ack();
  try {
    const auditRequest = command.text;
    
    if (!auditRequest) {
      await say(`<@${command.user_id}> What would you like me to audit? I can analyze data, processes, metrics, or other business elements.`);
      return;
    }

    // Ask for more specific details
    await say(`<@${command.user_id}> I'll help you audit ${auditRequest}. Please provide more details about what you'd like me to audit.`);
    
    // Simulate getting more context by having the AI make assumptions
    const detailedPrompt = `Provide a comprehensive audit for: ${auditRequest}. Include:\n` +
                          `1. An assessment of current status\n` +
                          `2. Identification of potential issues or risks\n` +
                          `3. Specific recommendations for improvement\n` +
                          `4. Questions that should be asked to get more information\n` +
                          `Make it professional but conversational.`;
    
    const auditResponse = await getAIResponse(detailedPrompt, 'audit');
    
    // Add a short delay to simulate thinking/analysis time
    setTimeout(async () => {
      await say(`*Audit Results for "${auditRequest}" (requested by <@${command.user_id}>):*\n\n${auditResponse}`);
    }, 3000);
  } catch (error) {
    console.error('Error handling /audit command:', error);
    await say(`<@${command.user_id}> Sorry, I encountered an error processing your audit request. Please try again later.`);
  }
}

module.exports = { handleAuditCommand };
