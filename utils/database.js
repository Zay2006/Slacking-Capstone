// utils/database.js
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Start with process.env to prioritize environment variables
let DATABASE_URL = process.env.DATABASE_URL;

// Read from .env file if not available in process.env
if (!DATABASE_URL) {
  try {
    console.log('Reading .env file for DATABASE_URL');
    const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const match = envContent.match(/DATABASE_URL=([^\r\n]+)/);
    if (match && match[1]) {
      DATABASE_URL = match[1];
      console.log('Found DATABASE_URL in .env file');
    } else {
      console.log('DATABASE_URL not found in .env file');
    }
  } catch (error) {
    console.error('Error reading .env file:', error.message);
  }
}

// Check if we have a valid DATABASE_URL
if (!DATABASE_URL) {
  console.error('⚠️ DATABASE_URL not found in environment variables or .env file');
}

// Set up pooling configuration
let poolConfig = null;
if (DATABASE_URL) {
  poolConfig = {
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Required for Supabase connections
    // Add connection pool settings for better stability
    max: 10, // Reduced max clients - Supabase might have connection limits
    idleTimeoutMillis: 10000, // Close idle clients after 10 seconds
    connectionTimeoutMillis: 5000 // Return an error after 5 seconds if connection could not be established
  };
}

// Implement a connection management class for improved stability
class DatabaseManager {
  constructor(config) {
    this.config = config;
    this.pool = config ? new Pool(config) : null;
    this.setupPool();
    this.lastPingTime = Date.now();
    this.connectionStatus = 'initializing';
    
    // Don't use setInterval in serverless environment
    // Instead we'll ping on-demand before queries
  }
  
  setupPool() {
    if (!this.pool) return;
    
    this.pool.on('error', (err, client) => {
      console.log(`Database pool error detected: ${err.message}`);
      this.connectionStatus = 'error';
      
      // Don't crash the application, just log the error
      // The connection will be re-established on next query
    });
    
    this.pool.on('connect', (client) => {
      console.log('New database connection established');
      this.connectionStatus = 'connected';
    });
    
    this.pool.on('remove', (client) => {
      // A client has been removed from the pool
    });
  }
  
  async pingDatabase() {
    try {
      // Only ping if we're not in an error state
      if (this.connectionStatus !== 'error') {
        // Use a simple query to keep the connection alive
        await this.query('SELECT NOW()');
        this.lastPingTime = Date.now();
        // No need to log every ping - it would flood the logs
      }
    } catch (err) {
      console.log('Ping failed, connection may be down:', err.message);
      this.connectionStatus = 'error';
      // The next actual query will trigger a reconnect attempt
    }
  }
  
  async query(text, params) {
    if (!this.pool) {
      console.error('Database pool not available');
      throw new Error('Database connection not available');
    }
    
    // Check connection before query in serverless environment
    if (Date.now() - this.lastPingTime > 60000) { // 1 minute
      try {
        await this.pingDatabase();
      } catch (pingError) {
        console.log('Pre-query ping failed', pingError.message);
        // Continue anyway, the actual query will error if needed
      }
    }
    
    try {
      const result = await this.pool.query(text, params);
      this.connectionStatus = 'connected'; // Query succeeded, connection is good
      return result;
    } catch (err) {
      console.error('Database query error:', err.message);
      
      // Check if this is a connection error
      if (err.code === 'ECONNREFUSED' || 
          err.code === 'ETIMEDOUT' || 
          err.code === 'PROTOCOL_CONNECTION_LOST' ||
          err.message.includes('termination')) {
        
        console.log('Connection error detected, will attempt reconnect on next query');
        this.connectionStatus = 'error';
        
        // Let the error bubble up so the caller can handle it
      }
      
      throw err;
    }
  }
  
  async getClient() {
    if (!this.pool) return null;
    
    const client = await this.pool.connect();
    const release = client.release;
    
    // Override the release method to keep track of the client
    client.release = () => {
      release.call(client);
    };
    
    return client;
  }
  
  async end() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    if (this.pool) {
      await this.pool.end();
      console.log('Database pool has ended');
    }
  }
}

// Create a single instance of the database manager
const dbManager = poolConfig ? new DatabaseManager(poolConfig) : null;

// Test the database connection
async function testConnection() {
  if (!dbManager || !dbManager.pool) {
    console.error('❌ No database connection pool available - DATABASE_URL not found or invalid');
    return false;
  }
  
  try {
    // Use the query method of our DatabaseManager to test the connection
    const result = await dbManager.query('SELECT NOW() as time');
    console.log('✅ Database connection successful!', new Date().toISOString());
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
}

// Check if database is available
function checkDbAvailable() {
  if (!dbManager || !dbManager.pool) {
    console.error('❌ Database not available - DATABASE_URL not found or invalid');
    return false;
  }
  return true;
}

// Get roadmap data by project ID
async function getRoadmapData(projectId) {
  if (!checkDbAvailable()) return null;
  
  try {
    const result = await dbManager.query(
      'SELECT * FROM roadmaps WHERE project_id = $1',
      [projectId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (err) {
    console.error('Error fetching roadmap data:', err.message);
    return null;
  }
}

// List all available roadmap projects
async function listRoadmapProjects() {
  if (!checkDbAvailable()) return [];
  
  try {
    const result = await dbManager.query(
      'SELECT project_id, data->"name" as name FROM roadmaps ORDER BY data->"name"'
    );
    return result.rows;
  } catch (err) {
    console.error('Error listing roadmap projects:', err.message);
    return [];
  }
}

// Update roadmap data
async function updateRoadmapData(projectId, data) {
  if (!checkDbAvailable()) return null;
  
  try {
    // Check if record exists
    const existingRecord = await dbManager.query(
      'SELECT * FROM roadmaps WHERE project_id = $1',
      [projectId]
    );
    
    if (existingRecord.rowCount > 0) {
      // Update existing record
      const result = await dbManager.query(
        'UPDATE roadmaps SET data = $1, updated_at = NOW() WHERE project_id = $2 RETURNING *',
        [data, projectId]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } else {
      // Insert new record
      const result = await dbManager.query(
        'INSERT INTO roadmaps (project_id, data, created_at, updated_at) VALUES ($1, $2, NOW(), NOW()) RETURNING *',
        [projectId, data]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    }
  } catch (err) {
    console.error('Error updating roadmap data:', err.message);
    return null;
  }
}

// Export functions
module.exports = {
  testConnection,
  getRoadmapData,
  listRoadmapProjects,
  updateRoadmapData
};
