const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize OpenAI client with API key from environment variables
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function testOpenAI() {
  try {
    console.log('Testing OpenAI connection...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant."
        },
        {
          role: "user",
          content: "Hello, are you working?"
        }
      ],
      max_tokens: 50,
    });

    console.log('OpenAI Response:', completion.choices[0].message.content);
    console.log('Success! OpenAI integration is working properly.');
  } catch (error) {
    console.error('Error connecting to OpenAI:', error);
  }
}

// Run the test
testOpenAI();