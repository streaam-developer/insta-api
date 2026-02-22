const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');

const ig = new IgApiClient();

const SESSION_FILE = './session.json';

async function uploadReel() {

    if (!fs.existsSync(SESSION_FILE)) {
        throw new Error("Session file not found! Login first.");
    }

    // Load session
    const session = JSON.parse(fs.readFileSync(SESSION_FILE));
    await ig.state.deserialize(session);
    console.log("♻️ Session Loaded");

    await ig.simulate.postLoginFlow();

    // Reel video
    const video = fs.readFileSync('./reel.mp4');

    // Reel thumbnail (REQUIRED)
    const cover = fs.readFileSync('./cover.jpg');

    console.log("🚀 Uploading Reel...");

    const publishResult = await ig.publish.video({
        video,
        coverImage: cover,
        caption: "🔥 Uploaded via API #reel #automation",
        isReelMedia: true
    });

    console.log("✅ Reel Uploaded Successfully!");
}

uploadReel();