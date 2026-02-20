# Instagram Video Upload Script

A Node.js script that uses Instagram's private API to login and upload videos to your Instagram account.

## Prerequisites

1. **Node.js** - Download and install from [nodejs.org](https://nodejs.org/)
2. **npm** - Comes with Node.js installation

## Installation

1. Open your terminal/command prompt
2. Navigate to this folder:
   ```bash
   cd "d:/git hub all repo/insta-api/New folder"
   ```

3. Install the required dependencies:
   ```bash
   npm install instagram-private-api
   ```

## Configuration

1. Open `index.js` in a text editor
2. Modify the `CONFIG` object at the top of the file:

```javascript
const CONFIG = {
  username: 'YOUR_USERNAME',        // Your Instagram username
  password: 'YOUR_PASSWORD',        // Your Instagram password
  videoPath: './video.mp4',        // Path to your video file (place video in same folder)
  caption: 'Your caption here',     // Caption for the video
  twoFactorCode: null               // Required if 2FA is enabled
};
```

## Usage

Run the script:
```bash
node index.js
```

## Important Notes

- **Two-Factor Authentication**: If your account has 2FA enabled, set the `twoFactorCode` in the CONFIG object with your current authentication code.
- **Video Requirements**: 
  - Instagram has specific video requirements (duration, size, format)
  - Recommended: MP4 format, max 30 seconds, under 650MB
- **API Rate Limits**: Instagram may limit requests if used too frequently
- **Session**: The script logs in each time. For production, consider saving the session

## Video File Placement

Place your video file in the same folder as `index.js` and update `videoPath` in the CONFIG:
- If video is named `myvideo.mp4`, set: `videoPath: './myvideo.mp4'`

## Troubleshooting

- **Login Failed**: Check your username/password and ensure Instagram allows less secure apps
- **Upload Failed**: Ensure video meets Instagram's requirements
- **2FA Issues**: Make sure to provide the current 2FA code from your authenticator app

## Warning

Using Instagram's private API may violate Instagram's Terms of Service. Use this script at your own risk. It's recommended for personal use and testing purposes only.
