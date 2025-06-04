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

// Create a connection pool
const pool = DATABASE_URL ? new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Supabase connections
}) : null;

// Test the database connection
async function testConnection() {
  if (!pool) {
    console.error('❌ No database connection pool available - DATABASE_URL not found or invalid');
    return false;
  }
  
  try {
    const client = await pool.connect();
    console.log('✅ Database connection successful!', new Date().toISOString());
    client.release();
    return true;
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
    return false;
  }
}

// Check if database is available
function checkDbAvailable() {
  if (!pool) {
    console.error('❌ Database not available - DATABASE_URL not found or invalid');
    return false;
  }
  return true;
}

// Get roadmap data by project ID
async function getRoadmapData(projectId) {
  if (!checkDbAvailable()) return null;
  
  try {
    const result = await pool.query(
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
    const result = await pool.query(
      'SELECT project_id, data->\'name\' as name FROM roadmaps ORDER BY data->\'name\''
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
    const existingRecord = await pool.query(
      'SELECT * FROM roadmaps WHERE project_id = $1',
      [projectId]
    );
    
    if (existingRecord.rowCount > 0) {
      // Update existing record
      const result = await pool.query(
        'UPDATE roadmaps SET data = $1, updated_at = NOW() WHERE project_id = $2 RETURNING *',
        [data, projectId]
      );
      return result.rows.length > 0 ? result.rows[0] : null;
    } else {
      // Insert new record
      const result = await pool.query(
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
