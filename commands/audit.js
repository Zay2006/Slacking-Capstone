// audit.js - Handler for /audit slash command
const { getAIResponse } = require('../utils/ai');
const { getRoadmapData, listRoadmapProjects } = require('../utils/database');
const { OpenAI } = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Handle the /audit slash command
 * Provides audit analysis for roadmap data stored in the database
 */
async function handleAuditCommand({ command, ack, respond, say }) {
  // Acknowledge the command request
  await ack();
  
  try {
    // Extract project ID from command text or use a default
    let projectId = command.text.trim();
    
    // If no project ID provided, list available projects
    if (!projectId) {
      const projects = await listRoadmapProjects();
      
      // Make sure list of projects is visible to everyone in the channel
      
      if (projects.length === 0) {
        await respond({
          response_type: 'in_channel',
          text: 'No roadmap projects found in the database.'
        });
        return;
      }
      
      // Format project list
      const projectList = projects.map(p => `• *${p.project_id}*: ${p.name}`).join('\n');
      
      await respond({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Available roadmap projects:*\n' + projectList
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'To audit a project, use `/audit [project-id]`'
            }
          }
        ]
      });
      return;
    }
    
    // Show typing indicator
    await respond({
      response_type: 'ephemeral', 
      text: `🔍 Analyzing roadmap data for *${projectId}*...`
    });
    
    // Get roadmap data from database
    const roadmapData = await getRoadmapData(projectId);
    
    if (!roadmapData) {
      await respond({
        response_type: 'ephemeral',
        text: `❌ No roadmap data found for project: *${projectId}*\nAvailable project IDs: mobile-app, website-redesign, data-platform`
      });
      return;
    }
    
    // Use OpenAI to analyze the roadmap data
    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a project management expert specializing in roadmap assessment. Analyze the provided project roadmap and provide actionable insights. Be specific, concise, and practical.'
        },
        {
          role: 'user',
          content: `Analyze this project roadmap and provide a detailed audit:\n\n${JSON.stringify(roadmapData.data, null, 2)}`
        }
      ],
      temperature: 0.7,
    });

    // Get AI response
    const auditResult = completion.choices[0].message.content;
    
    // Format project name
    const projectName = roadmapData.data.name || projectId;
    
    // Send the analysis back to Slack
    await say({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `📊 Roadmap Audit: ${projectName}`,
            emoji: true
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `*Requested by:* <@${command.user_id}> | *Status:* ${roadmapData.data.status || 'Unknown'} | *Completion:* ${roadmapData.data.completion_percentage || 0}%`
            }
          ]
        },
        {
          type: 'divider'
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: auditResult
          }
        }
      ]
    });
  } catch (error) {
    console.error('Error handling /audit command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error processing the audit: ${error.message}\nPlease try again later.`
    });
  }
}

module.exports = { handleAuditCommand };
