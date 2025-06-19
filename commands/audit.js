// audit.js - Handler for /audit slash command
const { getAIResponse } = require('../utils/ai');

// Global pool is set up in slack-events.js
// Use try/catch to handle cases where global pool is not available
function getPool() {
  try {
    if (global.vercelPool) {
      console.log('Using global vercelPool in audit command');
      return global.vercelPool;
    } else {
      console.error('Global vercelPool not available');
      throw new Error('Database connection not available');
    }
  } catch (error) {
    console.error('Error accessing global pool:', error);
    throw new Error('Database connection not available');
  }
}

/**
 * Handle the /audit slash command
 * Provides audit analysis for roadmap data stored in the database
 */
async function handleAuditCommand({ command, ack, respond, client }) {
  // Acknowledge the command request already happened in the caller
  
  // Show typing indicator
  await respond({
    text: "Analyzing roadmap data...",
    response_type: 'ephemeral'
  });
  
  try {
    // Check for environment variables
    if (!process.env.DATABASE_URL) {
      console.error('DATABASE_URL environment variable is not set');
      await respond({
        text: ":x: Error processing the audit: Database URL not configured\nPlease ask an administrator to set up the DATABASE_URL environment variable.",
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Get database pool safely
    let pool;
    try {
      pool = getPool();
    } catch (poolError) {
      console.error('Failed to get database pool:', poolError);
      await respond({
        text: ":x: Error processing the audit: Database connection not available\nPlease try again later.",
        response_type: 'ephemeral'
      });
      return;
    }
    
    // Get all issues with missing data using direct PostgreSQL query
    const query = `
      SELECT 
        i.id,
        i.issue_code,
        i.issue_name,
        i.public_description,
        i.description_missing,
        i.theme_missing,
        p.name AS pillar_name,
        t.name AS theme_name,
        w.name AS workspace_name
      FROM 
        public.issues i
      LEFT JOIN 
        public.pillars p ON i.pillar_id = p.id
      LEFT JOIN 
        public.themes t ON i.theme_id = t.id
      LEFT JOIN 
        public.workspaces w ON i.workspace_id = w.id
      WHERE 
        i.description_missing = true OR i.theme_missing = true
    `;
    
    // Execute the query
    const result = await pool.query(query);
    const data = result.rows;
    
    if (data.length === 0) {
      await respond({
        response_type: 'in_channel',
        text: '✅ Great news! No issues with missing data were found in the database.'
      });
      return;
    }
    
    // Group the issues by what's missing
    const missingDesc = data.filter(issue => issue.description_missing).map(i => i.issue_code);
    const missingTheme = data.filter(issue => issue.theme_missing).map(i => i.issue_code);
    
    // Format the data for OpenAI analysis
    const auditData = {
      total_issues: data.length,
      issues_with_missing_descriptions: missingDesc.length,
      issues_with_missing_themes: missingTheme.length,
      issue_details: data.map(issue => ({
        code: issue.issue_code,
        name: issue.issue_name,
        workspace: issue.workspace_name || 'Not assigned',
        pillar: issue.pillar_name || 'Not assigned',
        theme: issue.theme_name || 'Not assigned',
        missing: [
          issue.description_missing ? 'description' : null,
          issue.theme_missing ? 'theme' : null
        ].filter(Boolean)
      }))
    };
    
    // Use OpenAI to analyze the issues data
    const completion = await getAIResponse({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a project management expert specializing in data completeness assessment. Analyze the provided issue tracking data and provide actionable insights about missing data. Be specific, concise, and practical.'
        },
        {
          role: 'user',
          content: `Analyze these issues with missing data and provide recommendations for improving data quality:\n\n${JSON.stringify(auditData, null, 2)}`
        }
      ],
      temperature: 0.7,
    });

    // Get AI response
    const auditResult = completion.choices[0].message.content;
    
    // Send the analysis back to Slack
    await say({
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '📊 Data Completeness Audit',
            emoji: true
          }
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `*Requested by:* <@${command.user_id}> | *Total issues with gaps:* ${data.length} | *Missing descriptions:* ${missingDesc.length} | *Missing themes:* ${missingTheme.length}`
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
    
    // Also send a detailed breakdown in a thread
    const missingDetails = data.map(issue => {
      return `• *${issue.issue_code} ${issue.issue_name}*: Missing ${issue.description_missing && issue.theme_missing ? 'description and theme' : issue.description_missing ? 'description' : 'theme'}`;
    }).join('\n');
    
    await say({
      text: `*Detailed Issues Report*\n${missingDetails}`
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
