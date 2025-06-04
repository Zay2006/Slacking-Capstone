# Milestone Madness - AI-Powered Slack Bot

## Overview
Milestone Madness is an intelligent Slack bot that combines structured commands with AI-powered responses to help track business milestones, audit data, create drafts, and provide project management assistance. Built with Bolt.js and integrated with OpenAI's GPT-4 mini model.

## Features

### AI-Powered Interactions
- **Real-time conversations**: Ask questions directly or mention the bot in channels
- **Smart responses**: Get AI-generated answers tailored to your business context
- **Markdown-free formatting**: Clean, readable responses without formatting artifacts

### Enhanced Slash Commands
- **/audit**: Get AI analysis of your data, processes, or metrics
- **/draft**: Generate professional drafts for emails, notes, proposals, etc.
- **/reminder**: Set reminders with AI-recommended timeframes and task breakdowns
- **/describe**: Learn about Milestone Madness capabilities

### Specialized Responses
- **Witty comebacks**: Try asking "Is there anything you can't do?"
- **Direct message support**: Works in both channels and private messages

## Prerequisites
- Node.js installed
- A Slack workspace with bot permissions
- OpenAI API key

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Create a `.env` file with your credentials:
   ```
   SLACK_BOT_TOKEN=xoxb-your-bot-token
   SLACK_APP_TOKEN=xapp-your-app-token
   SLACK_SIGNING_SECRET=your-signing-secret
   OPENAI_API_KEY=your-openai-api-key
   PORT=3001
   ```

## Running the Bot

1. Start the application:
   ```
   npm start
   ```

2. The bot will automatically start localtunnel to create a secure tunnel.
   - The tunnel URL will be displayed in the console.
   - Use this URL in your Slack app configuration under Request URLs.

## Project Structure

The codebase is organized with a modular architecture for better maintainability:

```
├── app.js             # Main application entry point
├── commands/          # Slash command handlers
│   ├── audit.js       # /audit command handler
│   ├── describe.js    # /describe command handler
│   ├── draft.js       # /draft command handler
│   ├── index.js       # Command exports
│   ├── messages.js    # Message handlers (mentions/DMs)
│   └── reminder.js    # /reminder command handler
├── utils/             # Utility functions
│   └── ai.js          # AI functionality (OpenAI integration)
├── package.json       # Project dependencies
└── .env               # Environment variables
```

## How It Works

- The application starts a local server on the specified port.
- The bot runs in Socket Mode, which connects directly to Slack's WebSocket API.
- When someone mentions the bot or uses a slash command, the appropriate handler is invoked.
- The handler uses the AI utilities to generate a response via OpenAI.
- All command logic is modularized for easier maintenance and extensions.

## Using localtunnel Directly

If you prefer, you can also run localtunnel separately using npx:

```
npx localtunnel --port 3000
```

This will create a tunnel to your local server running on port 3000 and provide you with a public URL that you can use in your Slack app configuration.

## Troubleshooting

- If you encounter issues with the tunnel, try restarting the application.
- Check your Slack app configuration to ensure the event subscriptions are properly set up with the correct tunnel URL.
- Verify your Slack bot token and signing secret are correct in the `.env` file.
