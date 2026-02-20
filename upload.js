/**
 * Instagram Reel Upload Script
 * This script uploads a video to Instagram as a Reel using a saved session.
 * 
 * Usage: node upload.js <video_path> [caption]
 * Example: node upload.js ./video.mp4 "My awesome reel #instagram #reels"
 * 
 * Requirements:
 * 1. Run login.js first to create session.json
 * 2. Video must meet Instagram Reels requirements:
 *    - Duration: 3 seconds to 90 seconds
 *    - Format: MP4 or MOV
 *    - Codec: H.264
 *    - Size: Max 650MB
 *    - Aspect ratio: 9:16 (vertical) works best for Reels
 */

const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { login, SESSION_FILE } = require('./login');

// Load environment variables
dotenv.config();

/**
 * Upload video as Instagram Reel
 * @param {IgApiClient} ig - Logged in Instagram client
 * @param {string} videoPath - Path to the video file
 * @param {string} caption - Caption for the reel
 */
async function uploadReel(ig, videoPath, caption = '') {
    console.log(`Preparing to upload reel: ${videoPath}`);
    
    // Check if video file exists
    if (!fs.existsSync(videoPath)) {
        throw new Error(`Video file not found: ${videoPath}`);
    }
    
    const videoBuffer = fs.readFileSync(videoPath);
    const videoDuration = await getVideoDuration(videoPath);
    
    console.log(`Video duration: ${videoDuration.toFixed(2)} seconds`);
    console.log(`Video size: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB`);
    
    // Create reel video publish service
    const publishService = ig.publish.reelVideo();
    
    // Configure video
    publishService.configureVideo({
        video: videoBuffer,
        duration: Math.round(videoDuration * 1000), // Convert to milliseconds
    });
    
    // Add caption if provided
    if (caption) {
        publishService.configureCaption({
            caption: caption,
        });
    }
    
    // Add additional options for Reels
    publishService.configureReelOptions({
        title: caption || '',
        // These options help with reach and discovery
        is_reel: true,
    });
    
    console.log('Uploading as Reel...');
    const result = await publishService.start();
    
    console.log('Reel upload successful!');
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
    
    const stats = fs.statSync(videoPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    
    console.log(`Video file size: ${fileSizeMB.toFixed(2)} MB`);
    
    // For accurate duration, install ffprobe and use:
    // const ffprobe = require('ffprobe');
    // const info = await ffprobe(videoPath);
    // return info.streams[0].duration;
    
    // Rough estimate: 1MB ≈ 1 second for typical video
    // Minimum 3 seconds for Reels
    return Math.max(3, Math.min(90, fileSizeMB));
}

/**
 * Main function to run the upload
 */
async function main() {
    // Get video path from command line argument
    const videoPath = process.argv[2];
    
    if (!videoPath) {
        console.log('Usage: node upload.js <video_path> [caption]');
        console.log('Example: node upload.js ./video.mp4 "My awesome reel #instagram"');
        console.log('\nNote: Video will be uploaded as Instagram Reel');
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
            await ig.user.info(ig.state.cookieUserId);
            console.log('Session is valid!');
        } catch (e) {
            console.error('Session expired. Please run login.js again!');
            process.exit(1);
        }
        
        // Upload the video as Reel
        const result = await uploadReel(ig, videoPath, caption);
        
        console.log('\n=== Reel Upload Complete ===');
        console.log(`View on Instagram: https://www.instagram.com/reel/${result.media.code}/`);
        
    } catch (error) {
        console.error('Upload failed:', error.message);
        
        if (error.message.includes('Upload failed')) {
            console.log('\nCommon issues:');
            console.log('  - Video format not supported');
            console.log('  - Video duration not valid (3-90 seconds for Reels)');
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

module.exports = { uploadReel };
