// index.js - Central export point for all command handlers

const { handleDraftCommand } = require('./draft');
const { handleAuditCommand } = require('./audit');
const { handleReminderCommand } = require('./reminder');
const { handleDescribeCommand } = require('./describe');
const { handleDirectMessage, handleAppMention } = require('./messages');

module.exports = {
  handleDraftCommand,
  handleAuditCommand,
  handleReminderCommand,
  handleDescribeCommand,
  handleDirectMessage,
  handleAppMention
};
