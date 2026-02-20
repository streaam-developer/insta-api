const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');

// Configuration - set these via environment variables or update directly
const USERNAME = process.env.INSTAGRAM_USERNAME || 'priya3574503';
const PASSWORD = process.env.INSTAGRAM_PASSWORD || 'rMuD@e5HH5vuvJE';

// Session directory
const SESSION_DIR = path.join(__dirname, 'sessions');

/**
 * Ensure session directory exists
 */
function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

/**
 * Get session file path for a username
 */
function getSessionPath(username) {
  return path.join(SESSION_DIR, `${username}.json`);
}

/**
 * Save session to file
 */
async function saveSession(ig, username) {
  ensureSessionDir();
  const sessionPath = getSessionPath(username);
  
  // Get the session data from the IG client
  const sessionData = {
    username: username,
    deviceString: ig.state.deviceString,
    deviceId: ig.state.deviceId,
    uuid: ig.state.uuid,
    phoneId: ig.state.phoneId,
    advertisingId: ig.state.advertisingId,
    session: ig.state.session,
    cookies: ig.state.cookies
  };
  
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
  console.log(`Session saved to: ${sessionPath}`);
  
  return sessionPath;
}

/**
 * Load session from file
 */
function loadSession(username) {
  const sessionPath = getSessionPath(username);
  
  if (fs.existsSync(sessionPath)) {
    const sessionData = fs.readFileSync(sessionPath, 'utf-8');
    return JSON.parse(sessionData);
  }
  
  return null;
}

/**
 * Login to Instagram
 */
async function login(username, password) {
  const ig = new IgApiClient();
  
  // Set username
  ig.state.generateDevice(username);
  
  try {
    // Try to load existing session first
    const savedSession = loadSession(username);
    
    if (savedSession) {
      console.log('Found existing session, trying to restore...');
      
      // Restore session state
      ig.state.deviceString = savedSession.deviceString;
      ig.state.deviceId = savedSession.deviceId;
      ig.state.uuid = savedSession.uuid;
      ig.state.phoneId = savedSession.phoneId;
      ig.state.advertisingId = savedSession.advertisingId;
      
      try {
        // Try to use the session
        await ig.user.session.get();
        console.log('Session restored successfully!');
        return ig;
      } catch (e) {
        console.log('Session expired, logging in again...');
      }
    }
    
    // Login with credentials
    console.log(`Logging in as ${username}...`);
    await ig.account.login(username, password);
    console.log('Login successful!');
    
    // Save session
    await saveSession(ig, username);
    
    return ig;
  } catch (error) {
    console.error('Login failed:', error.message);
    
    if (error.message.includes('checkpoint')) {
      console.log('Checkpoint required! You need to verify your account.');
    } else if (error.message.includes('invalid credentials')) {
      console.log('Invalid username or password!');
    } else if (error.message.includes('two-factor')) {
      console.log('Two-factor authentication required!');
    }
    
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('=== Instagram Login Script ===\n');
  
  if (USERNAME === 'your_username' || PASSWORD === 'your_password') {
    console.log('Please set your Instagram credentials:');
    console.log('  - Edit the USERNAME and PASSWORD variables in this file');
    console.log('  - Or set environment variables: INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD');
    console.log('\nExample:');
    console.log('  INSTAGRAM_USERNAME=my_user INSTAGRAM_PASSWORD=my_pass node login.js');
    process.exit(1);
  }
  
  try {
    const ig = await login(USERNAME, PASSWORD);
    console.log('\nLogin completed successfully!');
    console.log(`Session file saved as: ${USERNAME}.json`);
    console.log('\nYou can now run the upload script to upload videos.');
    
    // Keep the process running briefly to ensure session is saved
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (error) {
    console.error('\nFailed to login:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { login, saveSession, loadSession, ig: null };
