const { IgApiClient, IgClientLoginTwoFactorRequiredError } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');

const ig = new IgApiClient();

// Configuration - Change these values
const CONFIG = {
  username: 'YOUR_USERNAME',        // Your Instagram username
  password: 'YOUR_PASSWORD',        // Your Instagram password
  videoPath: './video.mp4',         // Path to your video file
  caption: 'Your caption here',     // Caption for the video
  twoFactorCode: null               // Required if 2FA is enabled
};

// Session file path
const getSessionPath = () => `./${CONFIG.username}_session.json`;

async function saveSession() {
  const sessionPath = getSessionPath();
  const sessionData = ig.state.export();
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData));
  console.log(`Session saved to: ${sessionPath}`);
}

async function loadSession() {
  const sessionPath = getSessionPath();
  if (fs.existsSync(sessionPath)) {
    try {
      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      ig.state.import(sessionData);
      console.log('Session loaded successfully!');
      return true;
    } catch (err) {
      console.log('Failed to load session, will login fresh:', err.message);
      return false;
    }
  }
  return false;
}

async function checkExistingSession() {
  const sessionPath = getSessionPath();
  if (fs.existsSync(sessionPath)) {
    console.log('Found existing session file.');
    const loaded = await loadSession();
    if (loaded) {
      try {
        // Verify session is still valid by getting account info
        const accountInfo = await ig.account.currentUser();
        console.log('Session is valid! User:', accountInfo.username);
        return true;
      } catch (err) {
        console.log('Session expired, need to login again');
        return false;
      }
    }
  }
  return false;
}

async function login() {
  // Generate device UUID based on username
  ig.state.generateDevice(CONFIG.username);

  // Check if we have a valid session
  const hasValidSession = await checkExistingSession();
  if (hasValidSession) {
    console.log('Already logged in via session!');
    return;
  }

  // No valid session, perform fresh login
  try {
    console.log('Attempting to login...');
    const loginResult = await ig.account.login(CONFIG.username, CONFIG.password);
    console.log('Login successful!');
    console.log('User ID:', loginResult.pk);
    console.log('Username:', loginResult.username);
    
    // Save session after successful login
    await saveSession();
    
    return loginResult;
  } catch (err) {
    if (err instanceof IgClientLoginTwoFactorRequiredError) {
      console.log('Two-factor authentication required!');
      if (!CONFIG.twoFactorCode) {
        console.log('Please set your two-factor code in the CONFIG object and run again.');
        process.exit(1);
      }
      // Submit the 2FA code
      const { username, password } = CONFIG;
      await ig.challenge.selectVerifyMethod(err.response.data, '0');
      const login = await ig.account.login(username, password, CONFIG.twoFactorCode);
      console.log('Login successful with 2FA!');
      
      // Save session after successful login
      await saveSession();
      
      return login;
    }
    console.error('Login failed:', err.message);
    throw err;
  }
}

async function uploadVideo() {
  console.log('Preparing to upload video...');
  
  // Check if video file exists
  if (!fs.existsSync(CONFIG.videoPath)) {
    throw new Error(`Video file not found: ${CONFIG.videoPath}`);
  }

  const videoBuffer = fs.readFileSync(CONFIG.videoPath);
  
  console.log('Video file size:', videoBuffer.length, 'bytes');

  // Generate upload ID
  const uploadId = Date.now();
  
  console.log('Starting video upload...');
  
  // Video upload using the correct API
  // First, we need to upload the video in chunks
  const videoInfo = await ig.video.uploadVideo({
    video: videoBuffer,
    uploadId: uploadId,
    caption: CONFIG.caption || '',
  });
  
  console.log('Video uploaded! Media ID:', videoInfo.media.id);
  
  // If there's a caption, update the media
  if (CONFIG.caption && CONFIG.caption !== '') {
    console.log('Adding caption...');
    await ig.media.edit({
      mediaId: videoInfo.media.id,
      caption: CONFIG.caption,
    });
    console.log('Caption added successfully!');
  }
  
  console.log('Video uploaded successfully!');
  console.log('Media URL:', `https://www.instagram.com/p/${videoInfo.media.code}/`);
}

async function main() {
  try {
    console.log('=== Instagram Video Upload Script ===\n');
    
    // Step 1: Login (or use saved session)
    await login();
    
    // Step 2: Upload Video
    await uploadVideo();
    
    console.log('\n=== Process completed successfully! ===');
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the main function
main();
