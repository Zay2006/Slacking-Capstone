// Socket Mode Controller API for Vercel
const { Worker } = require('worker_threads');
const path = require('path');
require('dotenv').config();

// Track worker status
let socketWorker = null;
let lastHeartbeat = null;
let workerRunning = false;

// Function to start the worker thread
function startWorker() {
  if (workerRunning) {
    console.log('Worker already running, not starting another');
    return;
  }

  console.log('Starting Socket Mode worker thread...');
  workerRunning = true;

  // Create a worker thread for the socket connection
  socketWorker = new Worker(path.resolve(__dirname, './socket-worker.js'));

  // Listen for messages from the worker
  socketWorker.on('message', (message) => {
    if (message.type === 'heartbeat') {
      lastHeartbeat = message.timestamp;
      console.log(`Received heartbeat from worker at ${new Date(lastHeartbeat).toISOString()}`);
    }
  });

  // Handle worker errors
  socketWorker.on('error', (err) => {
    console.error('Socket worker error:', err);
    workerRunning = false;
    // Attempt restart after a delay
    setTimeout(() => {
      startWorker();
    }, 5000);
  });

  // Handle worker exit
  socketWorker.on('exit', (code) => {
    console.log(`Socket worker exited with code ${code}`);
    workerRunning = false;
    
    // Don't restart on normal exit (code 0)
    if (code !== 0) {
      setTimeout(() => {
        startWorker();
      }, 5000);
    }
  });
}

// Check worker health and restart if needed
function checkWorkerHealth() {
  if (!lastHeartbeat) {
    // No heartbeat received yet, give it time to start
    if (workerRunning) {
      return;
    }
    // Not running, so start it
    startWorker();
    return;
  }

  const now = Date.now();
  const heartbeatAge = now - lastHeartbeat;
  
  // If heartbeat is too old (2 minutes), restart the worker
  if (heartbeatAge > 120000) {
    console.log(`Worker heartbeat is too old (${heartbeatAge}ms), restarting...`);
    if (socketWorker) {
      try {
        socketWorker.terminate();
      } catch (err) {
        console.error('Error terminating worker:', err);
      }
    }
    workerRunning = false;
    startWorker();
  }
}

// Create the HTTP endpoint handler for Vercel
module.exports = async (req, res) => {
  // Handle health check requests
  if (req.method === 'GET') {
    // Check if worker is running or start it if needed
    checkWorkerHealth();

    return res.status(200).json({
      status: 'ok',
      workerRunning,
      lastHeartbeat: lastHeartbeat ? new Date(lastHeartbeat).toISOString() : null
    });
  }
  
  // Handle control requests
  if (req.method === 'POST') {
    const { action } = req.body || {};
    
    switch (action) {
      case 'start':
        if (!workerRunning) {
          startWorker();
          return res.status(200).json({ status: 'worker_started' });
        }
        return res.status(200).json({ status: 'worker_already_running' });
        
      case 'stop':
        if (workerRunning && socketWorker) {
          try {
            socketWorker.postMessage({ type: 'stop' });
            return res.status(200).json({ status: 'stop_signal_sent' });
          } catch (err) {
            console.error('Error stopping worker:', err);
            return res.status(500).json({ 
              status: 'error', 
              message: 'Failed to stop worker'
            });
          }
        }
        return res.status(200).json({ status: 'worker_not_running' });
        
      case 'restart':
        if (workerRunning && socketWorker) {
          try {
            socketWorker.terminate();
          } catch (err) {
            console.error('Error terminating worker:', err);
          }
        }
        workerRunning = false;
        startWorker();
        return res.status(200).json({ status: 'worker_restarted' });
        
      default:
        return res.status(400).json({ 
          status: 'error', 
          message: 'Invalid action. Supported actions: start, stop, restart' 
        });
    }
  }
  
  // Handle unsupported methods
  return res.status(405).json({ 
    status: 'error', 
    message: 'Method not allowed. Supported methods: GET, POST'
  });
};
