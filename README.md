# Instagram Private API Scripts

Node.js scripts for Instagram login with session persistence and video upload functionality.

## ⚠️ Important Warnings

- **Use at your own risk**: These scripts use Instagram's private API which violates their Terms of Service
- Your account may be **banned** or **restricted** for using automated tools
- Instagram actively detects and blocks automated tools
- For production use, consider using the official [Instagram Graph API](https://developers.facebook.com/docs/instagram-api/)

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install
```

3. Create configuration file:
```bash
copy .env.example .env
```

4. Edit `.env` file and add your Instagram credentials:
```env
IG_USERNAME=your_username
IG_PASSWORD=your_password
DEFAULT_CAPTION=Your default caption
```

## Usage

### Step 1: Login

Run the login script to authenticate and save session:

```bash
node login.js
```

This will:
- Try to load existing session from `session.json`
- If no session exists or it's invalid, login with credentials
- Save session to `session.json` for future use
- Display confirmation when logged in

### Step 2: Upload Video

Upload a video using the saved session:

```bash
node upload.js <video_path> [caption]
```

Examples:
```bash
# Basic upload
node upload.js ./myvideo.mp4

# Upload with caption
node upload.js ./myvideo.mp4 "My awesome video! #instagram"

# Upload with default caption from .env
node upload.js ./myvideo.mp4
```

## Video Requirements

Your video must meet Instagram's requirements:
- **Format**: MP4 or MOV
- **Codec**: H.264
- **Duration**: 3 seconds to 60 seconds (up to 10 minutes for some accounts)
- **File size**: Maximum 650MB

## Troubleshooting

### Login Issues

**"Two-factor code required"**
- This script doesn't support 2FA automatically
- Disable 2FA temporarily on your Instagram account, or
- Use an authenticator app to get the code and modify login.js to handle it

**"Challenge required"**
- Instagram shows this when detecting new login
- Try logging in via the Instagram app first
- Wait a few hours before retrying
- The session might work after the first manual login

### Upload Issues

**"Upload failed"**
- Check video format and duration
- Ensure video meets Instagram requirements
- Try with a shorter video first

**"Session expired"**
- Run `node login.js` again to refresh session

### Session Not Working

- Delete `session.json` and run login again
- Instagram may have invalidated the session
- Your IP might be flagged - try using a different network

## Project Structure

```
insta-api/
├── login.js          # Login script with session persistence
├── upload.js         # Video upload script
├── package.json      # Project dependencies
├── .env.example      # Configuration template
├── session.json      # Saved session (created after login)
└── README.md         # This file
```

## Dependencies

- [instagram-private-api](https://github.com/dilame/instagram-private-api) - Instagram private API client
- [dotenv](https://github.com/motdotla/dotenv) - Environment variable management

## Disclaimer

This project is for educational purposes only. Using automated tools with Instagram's private API violates their Terms of Service and may result in account restrictions or bans. Use at your own risk.
