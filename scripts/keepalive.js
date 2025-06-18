// Socket Mode Worker Keepalive Script
const axios = require('axios');
require('dotenv').config();

// Configuration
const VERCEL_URL = process.env.VERCEL_URL || 'https://your-app.vercel.app';
const PING_INTERVAL = 60000; // Ping every minute (60,000ms)
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds between retries

/**
 * Ping the Socket Mode controller endpoint to ensure worker stays alive
 */
async function pingSocketWorker() {
  console.log(`Pinging socket controller at ${new Date().toISOString()}`);
  
  let retries = 0;
  let success = false;
  
  while (!success && retries < MAX_RETRIES) {
    try {
      // Call the status endpoint which auto-starts the worker if needed
      const response = await axios.get(`${VERCEL_URL}/socket/status`);
      
      // Check worker status
      const { workerRunning, lastHeartbeat } = response.data;
      console.log(`Worker status: ${workerRunning ? 'RUNNING' : 'NOT RUNNING'}`);
      
      if (lastHeartbeat) {
        console.log(`Last heartbeat: ${new Date(lastHeartbeat).toISOString()}`);
      }
      
      // If worker not running, attempt to start it
      if (!workerRunning) {
        console.log('Worker not running, sending start command');
        await axios.post(`${VERCEL_URL}/socket/control`, { action: 'start' });
        console.log('Start command sent');
      }
      
      success = true;
    } catch (error) {
      retries++;
      console.error(`Error pinging socket controller (attempt ${retries}/${MAX_RETRIES}):`, error.message);
      
      if (retries < MAX_RETRIES) {
        console.log(`Retrying in ${RETRY_DELAY / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      }
    }
  }
  
  if (!success) {
    console.error('Failed to ping socket controller after maximum retries');
  }
}

// Initial ping
console.log('Starting keepalive service for Socket Mode worker');
pingSocketWorker();

// Set up regular pings
setInterval(pingSocketWorker, PING_INTERVAL);

// Handle process termination
process.on('SIGINT', () => {
  console.log('Keepalive service shutting down');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Keepalive service shutting down');
  process.exit(0);
});

console.log(`Keepalive service running, pinging every ${PING_INTERVAL / 1000} seconds`);
