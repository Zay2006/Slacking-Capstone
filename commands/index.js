// index.js - Central export point for all command handlers

const { handleDraftCommand } = require('./draft');
const { handleAuditCommand } = require('./audit');
const { handleReminderCommand, handleDeleteReminderAction } = require('./reminder');
const { handleDescribeCommand } = require('./describe');
const { handleTaskCommand } = require('./task');
const { handleConvoCommand } = require('./convo');
const { handleDirectMessage, handleAppMention } = require('./messages');

module.exports = {
  handleDraftCommand,
  handleAuditCommand,
  handleReminderCommand,
  handleDeleteReminderAction,
  handleDescribeCommand,
  handleTaskCommand,
  handleConvoCommand,
  handleDirectMessage,
  handleAppMention
};
