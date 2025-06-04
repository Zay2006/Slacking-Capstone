// ai.js - AI-related utility functions
const { OpenAI } = require('openai');

// Access the OpenAI client instance from the main app
let openai;

// Initialize the AI module with the OpenAI client
function initAI(openaiClient) {
  openai = openaiClient;
}

/**
 * Get a fallback response when the AI API is unavailable
 * @param {string} userMessage - The user's message
 * @param {string} commandType - The type of command (audit, draft, reminder, message, etc.)
 * @returns {string} A fallback response
 */
function getFallbackResponse(userMessage, commandType = 'message') {
  // If no user message was provided, return a generic fallback
  if (!userMessage || userMessage.trim() === '') {
    return "I'm sorry, I didn't receive any content to process. How can I help you today?";
  }

  // Get the first few words of the user message for context
  const shortUserMessage = userMessage.split(' ').slice(0, 5).join(' ') + 
    (userMessage.split(' ').length > 5 ? '...' : '');

  // Create appropriate fallback responses based on command type
  switch (commandType.toLowerCase()) {
    case 'audit':
      return `I'd like to help you audit "${shortUserMessage}", but I'm having trouble connecting to my AI services right now. Please try again in a few minutes, or let me know if there's something else I can assist with.`;
    
    case 'draft':
      return `I'd be happy to help draft content related to "${shortUserMessage}", but I'm currently experiencing connection issues with my AI services. Please try again shortly, or let me know if there's another way I can help.`;
    
    case 'reminder':
      return `I'd like to help you set a reminder for "${shortUserMessage}", but I'm having trouble accessing my AI capabilities at the moment. Please try again soon, or feel free to ask for assistance with something else.`;
    
    case 'direct':
      return `Thanks for your message about "${shortUserMessage}". I'm currently having trouble connecting to my AI services. Please try again in a few minutes, or let me know if there's something else I can help with.`;
    
    case 'mention':
      return `I noticed you mentioned me regarding "${shortUserMessage}". I'm currently experiencing some technical difficulties with my AI capabilities. Please try again shortly, or let me know if there's another way I can assist you.`;
    
    default:
      return `I'd like to help with your request about "${shortUserMessage}", but I'm having trouble connecting to my AI services right now. Please try again in a few minutes, or let me know if there's something else I can assist with.`;
  }
}

/**
 * Get an AI response using OpenAI's API
 * @param {string} prompt - The prompt to send to the AI
 * @param {string} commandType - The type of command (audit, draft, reminder, message, etc.)
 * @returns {Promise<string>} The AI's response
 */
async function getAIResponse(prompt, commandType = 'message') {
  // If no prompt was provided, return fallback
  if (!prompt || prompt.trim() === '') return getFallbackResponse(prompt, commandType);

  try {
    // Track API attempt
    global.playlabApiStatus.attempts++;
    global.playlabApiStatus.lastAttempt = new Date();

    // Create appropriate system message based on command type
    let systemMessage = '';
    switch (commandType.toLowerCase()) {
      case 'audit':
        systemMessage = `You are an expert data analyst and business consultant helping perform an audit. 
          Provide detailed, thoughtful analysis with clear recommendations. 
          Format your response with clear sections and bullet points where appropriate.`;
        break;
      
      case 'draft':
        systemMessage = `You are a professional content creator with expertise in business communications.
          Create well-structured, engaging content tailored to the specific request.
          Use appropriate tone, formatting, and structure for the content type.`;
        break;
      
      case 'reminder':
        systemMessage = `You are a productivity and time management expert.
          Provide thoughtful analysis of tasks with realistic time estimates and breakdowns.
          Your advice should be practical, specific, and actionable.`;
        break;
        
      case 'direct':
      case 'mention':
        systemMessage = `You are Milestone Madness, an AI assistant focused on helping with project management.
          Respond conversationally and be helpful, clear, and concise.
          If asked something you don't know, be honest about your limitations.
          If asked about capabilities, mention you can help with audits, drafts, reminders, and general questions.`;
        break;
      
      default:
        systemMessage = `You are Milestone Madness, an AI assistant for project management.
          Be helpful, clear, and concise in your responses.`;
    }

    // Try streaming approach first
    try {
      console.log(`Sending OpenAI API request (${commandType}): "${prompt.substring(0, 50)}..."`);
      
      // Create messages array with system message and user prompt
      const messages = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ];
      
      // Create a streaming completion request
      const stream = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        stream: true,
        max_tokens: 1000
      });
      
      // Process the stream
      let fullResponse = '';
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        fullResponse += content;
      }
      
      // Update API status
      global.playlabApiStatus.available = true;
      global.playlabApiStatus.error = null;
      
      // Clean up markdown formatting before returning
      return cleanupMarkdown(fullResponse.trim()) || getFallbackResponse(prompt, commandType);
      
    } catch (streamError) {
      // If streaming fails, try non-streaming approach
      console.log('Streaming approach failed, trying non-streaming:', streamError.message);
      
      // Create messages array with system message and user prompt
      const messages = [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt }
      ];
      
      // Create a non-streaming completion request
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: messages,
        stream: false,
        max_tokens: 1000
      });
      
      // Update API status
      global.playlabApiStatus.available = true;
      global.playlabApiStatus.error = null;
      
      // Clean up markdown formatting before returning
      return cleanupMarkdown(completion.choices[0].message.content.trim());
    }
  } catch (error) {
    // Log error and update API status
    console.error('Error getting AI response:', error.message);
    global.playlabApiStatus.available = false;
    global.playlabApiStatus.error = error.message;
    
    // Return fallback response (no need to clean up as these are manually formatted)
    return getFallbackResponse(prompt, commandType);
  }
}

/**
 * Clean up markdown formatting from AI responses
 * @param {string} text - The text to clean up
 * @returns {string} The cleaned text
 */
function cleanupMarkdown(text) {
  if (!text) return text;
  
  // Fix for vertical text issue - if every character is on its own line, join them
  if (text.split('\n').length > text.length / 2) {
    // This suggests most characters are on their own line
    text = text.replace(/\n/g, '');
  }
  
  // Remove any ||PARAGRAPH|| markers that might have leaked into the response
  text = text.replace(/\|\|PARAGRAPH\|\|/g, '\n\n');
  
  // Properly format paragraph breaks
  text = text.replace(/\n{3,}/g, '\n\n'); // Replace multiple newlines with just two
  text = text.replace(/\n\s*\n/g, '\n\n'); // Standardize paragraph breaks
  
  // Replace bold markdown
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  
  // Replace italic markdown
  text = text.replace(/\*(.*?)\*/g, '$1');
  
  // Replace horizontal lines
  text = text.replace(/---+/g, '');
  
  // Replace markdown headers (e.g., # Title)
  text = text.replace(/^#+\s+(.*)$/gm, '$1');
  
  // Replace bullet points with plain text bullets
  text = text.replace(/^\s*-\s+/gm, '• ');
  
  // Replace numbered lists with plain text numbers
  text = text.replace(/^\s*\d+\.\s+/gm, (match) => {
    // Keep the number but replace markdown formatting
    return match;
  });
  
  // Restore structure for common document elements
  const structuredElements = [
    'Dear ',
    'Subject:',
    'To Whom It May Concern',
    'Best regards,',
    'Sincerely,',
    'Thank you,',
    'Regards,',
    'Yours truly,',
    'Warm regards,'
  ];
  
  structuredElements.forEach(element => {
    // Add a newline before these elements if they're not already at the start of a line
    const pattern = new RegExp(`([^\n])${element}`, 'g');
    text = text.replace(pattern, `$1\n\n${element}`);
  });
  
  // Trim extra whitespace and ensure consistent spacing
  return text.trim();
}

module.exports = { 
  initAI,
  getAIResponse,
  getFallbackResponse,
  cleanupMarkdown
};
