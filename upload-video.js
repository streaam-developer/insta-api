const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');
const { loadSession, login } = require('./login');

// Configuration - set these via environment variables or update directly
const USERNAME = process.env.INSTAGRAM_USERNAME || 'your_username';
const PASSWORD = process.env.INSTAGRAM_PASSWORD || 'your_password';

// Video path - update this to your video file path
const VIDEO_PATH = process.env.VIDEO_PATH || './video.mp4';

// Caption for the post
const CAPTION = process.env.CAPTION || 'Uploaded via Instagram Private API';

// Session directory
const SESSION_DIR = path.join(__dirname, 'sessions');

/**
 * Get session file path for a username
 */
function getSessionPath(username) {
  return path.join(SESSION_DIR, `${username}.json`);
}

/**
 * Load session from file and restore IG client
 */
async function getIgClient(username) {
  const ig = new IgApiClient();
  ig.state.generateDevice(username);
  
  const sessionPath = getSessionPath(username);
  
  if (!fs.existsSync(sessionPath)) {
    console.log('No session found. Please run login.js first!');
    return null;
  }
  
  const savedSession = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  
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
    console.log('Session expired, please login again...');
    return await login(USERNAME, PASSWORD);
  }
}

/**
 * Upload video to Instagram
 */
async function uploadVideo(ig, videoPath, caption) {
  // Check if video file exists
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }
  
  console.log(`Reading video file: ${videoPath}`);
  const videoBuffer = fs.readFileSync(videoPath);
  
  // Get video duration (using file stats as estimate)
  const stats = fs.statSync(videoPath);
  console.log(`Video size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  
  // Upload video
  console.log('Uploading video...');
  
  const publishProcess = ig.publish.video({
    video: videoBuffer,
    caption: caption,
    coverImage: await getVideoThumbnail(videoPath)
  });
  
  return new Promise((resolve, reject) => {
    // The video upload process in instagram-private-api
    // returns a stream-like process
    publishProcess.on('progress', (progress) => {
      console.log(`Upload progress: ${progress}%`);
    });
    
    publishProcess.then((result) => {
      console.log('Upload successful!');
      resolve(result);
    }).catch((error) => {
      console.error('Upload failed:', error.message);
      reject(error);
    });
  });
}

/**
 * Create a simple thumbnail from video
 * Note: In production, you'd want to extract a real thumbnail
 * For now, we'll use a placeholder approach
 */
async function getVideoThumbnail(videoPath) {
  // Read first frame as thumbnail (placeholder)
  // In a real implementation, you'd use ffmpeg to extract a frame
  try {
    // Create a simple placeholder thumbnail (1x1 transparent pixel PNG)
    // This is a minimal valid PNG file
    const placeholderThumbnail = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, // IHDR length
      0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x00, 0x01, // width: 1
      0x00, 0x00, 0x00, 0x01, // height: 1
      0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
      0x1F, 0x15, 0xC4, 0x89, // CRC
      0x00, 0x00, 0x00, 0x0A, // IDAT length
      0x49, 0x44, 0x41, 0x54, // IDAT
      0x78, 0x9C, 0x62, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, // compressed data
      0x0D, 0x0A, 0x2D, 0xB4, // CRC
      0x00, 0x00, 0x00, 0x00, // IEND length
      0x49, 0x45, 0x4E, 0x44, // IEND
      0xAE, 0x42, 0x60, 0x82  // CRC
    ]);
    
    return placeholderThumbnail;
  } catch (error) {
    console.error('Error creating thumbnail:', error.message);
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('=== Instagram Video Upload Script ===\n');
  
  // Check username
  if (USERNAME === 'your_username') {
    console.log('Please set your Instagram username:');
    console.log('  - Edit the USERNAME variable in this file');
    console.log('  - Or set environment variable: INSTAGRAM_USERNAME');
    process.exit(1);
  }
  
  // Check video path
  if (!fs.existsSync(VIDEO_PATH)) {
    console.log(`Video file not found: ${VIDEO_PATH}`);
    console.log('\nPlease set your video path:');
    console.log('  - Edit the VIDEO_PATH variable in this file');
    console.log('  - Or set environment variable: VIDEO_PATH');
    console.log('\nExample: VIDEO_PATH=./my-video.mp4 node upload-video.js');
    process.exit(1);
  }
  
  try {
    // Get or restore IG client
    console.log('Initializing Instagram client...');
    const ig = await getIgClient(USERNAME);
    
    if (!ig) {
      console.error('Failed to initialize Instagram client');
      process.exit(1);
    }
    
    // Upload video
    console.log(`\nUploading video: ${path.basename(VIDEO_PATH)}`);
    console.log(`Caption: "${CAPTION}"\n`);
    
    const result = await uploadVideo(ig, VIDEO_PATH, CAPTION);
    
    console.log('\n=== Upload Complete ===');
    console.log(`Media ID: ${result.media.id}`);
    console.log(`Code: ${result.media.code}`);
    console.log(`Link: https://www.instagram.com/p/${result.media.code}/`);
    
  } catch (error) {
    console.error('\nUpload failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { uploadVideo, getIgClient };
