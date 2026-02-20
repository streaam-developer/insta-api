/**
 * Instagram Video Upload Script
 * This script uploads a video to Instagram using a saved session.
 * 
 * Usage: node upload.js <video_path> [caption]
 * Example: node upload.js ./video.mp4 "My awesome video #instagram"
 * 
 * Requirements:
 * 1. Run login.js first to create session.json
 * 2. Video must meet Instagram requirements:
 *    - Duration: 3 seconds to 60 seconds (or up to 10 minutes for some accounts)
 *    - Format: MP4 or MOV
 *    - Codec: H.264
 *    - Size: Max 650MB
 */

const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { login, SESSION_FILE } = require('./login');

// Load environment variables
dotenv.config();

/**
 * Upload video to Instagram
 * @param {IgApiClient} ig - Logged in Instagram client
 * @param {string} videoPath - Path to the video file
 * @param {string} caption - Caption for the post
 */
async function uploadVideo(ig, videoPath, caption = '') {
    console.log(`Preparing to upload video: ${videoPath}`);
    
    // Check if video file exists
    if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
    }
    
    const videoBuffer = fs.readFileSync(videoPath);
    const videoDuration = await getVideoDuration(videoPath);
    
    console.log(`Video duration: ${videoDuration.toFixed(2)} seconds`);
    
    // Create publish service
    const publishService = ig.publish.video();
    
    // Configure video upload
    publishService.configureVideo({
        video: videoBuffer,
        duration: videoDuration * 1000, // Convert to milliseconds
    });
    
    // Configure cover image (first frame)
    // Note: For production, you might want to extract a proper cover frame
    // Using a simple approach here - in production, use ffmpeg to extract frame
    publishService.configureCoverFrame({
        // Placeholder - in production extract actual frame
        coverFrame: Buffer.alloc(1),
    });
    
    // Add caption if provided
    if (caption) {
        publishService.configureCaption({
            caption: caption,
        });
    }
    
    console.log('Uploading video...');
    const result = await publishService.start();
    
    console.log('Upload successful!');
    console.log('Media ID:', result.media.id);
    console.log('Code:', result.media.code);
    
    return result;
}

/**
 * Get video duration in seconds (using file size as estimation)
 * Note: For accurate duration, install ffprobe or use a library
 * @param {string} videoPath - Path to video file
 * @returns {Promise<number>} Duration in seconds
 */
async function getVideoDuration(videoPath) {
    // Simple estimation based on file size
    // For accurate duration, you should use ffprobe or similar
    // This is a rough estimate - mp4 files typically have ~1MB per second at 720p
    
    const stats = fs.statSync(videoPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    // Rough estimate: 1MB ≈ 1 second for typical Instagram video
    // This is not accurate - for production, use ffprobe
    console.log(`Video file size: ${fileSizeMB.toFixed(2)} MB`);
    console.log('Note: Using estimated duration. For accurate duration, install ffprobe.');
    
    // Return a reasonable default for Instagram
    // Instagram requires minimum 3 seconds
    return Math.max(3, fileSizeMB);
}

/**
 * Main function to run the upload
 */
async function main() {
    // Get video path from command line argument
    const videoPath = process.argv[2];
    
    if (!videoPath) {
        console.log('Usage: node upload.js <video_path> [caption]');
        console.log('Example: node upload.js ./video.mp4 "My awesome video #instagram"');
        process.exit(1);
    }
    
    // Get caption from command line or use default
    const caption = process.argv[3] || process.env.DEFAULT_CAPTION || '';
    
    // Load session
    const ig = new IgApiClient();
    ig.state.generateDevice(process.env.IG_USERNAME);
    
    if (!fs.existsSync(SESSION_FILE)) {
        console.error('No session file found. Please run login.js first!');
        console.error('Usage: node login.js');
        process.exit(1);
    }
    
    try {
        console.log('Loading session...');
        const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        await ig.state.deserialize(sessionData);
        
        // Verify session is valid
        try {
            await ig.user.info();
            console.log('Session is valid!');
        } catch (e) {
            console.error('Session expired. Please run login.js again!');
            process.exit(1);
        }
        
        // Upload the video
        const result = await uploadVideo(ig, videoPath, caption);
        
        console.log('\n=== Upload Complete ===');
        console.log(`View on Instagram: https://www.instagram.com/p/${result.media.code}/`);
        
    } catch (error) {
        console.error('Upload failed:', error.message);
        
        if (error.message.includes('Upload failed')) {
            console.log('\nCommon issues:');
            console.log('  - Video format not supported');
            console.log('  - Video too long or too short');
            console.log('  - Video file too large');
            console.log('  - Network connection problems');
        }
        
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main();
}

module.exports = { uploadVideo };
