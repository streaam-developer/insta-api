/**
 * Instagram Login Script
 * This script logs into Instagram using the private API and saves the session
 * to a file for reuse across multiple executions.
 * 
 * Usage: node login.js
 * 
 * Before running:
 * 1. Copy .env.example to .env
 * 2. Fill in your Instagram credentials in .env
 */

const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const SESSION_FILE = path.join(__dirname, 'session.json');

async function login() {
    const ig = new IgApiClient();
    
    // Set device info
    ig.state.generateDevice(process.env.IG_USERNAME);
    
    // Check if session file exists and load it
    if (fs.existsSync(SESSION_FILE)) {
        console.log('Found existing session file. Loading session...');
        try {
            const sessionData = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
            await ig.state.deserialize(sessionData);
            console.log('Session loaded successfully!');
            
            // Test if session is still valid
            try {
                await ig.user.info();
                console.log('Session is valid! You are logged in.');
                return ig;
            } catch (e) {
                console.log('Session expired. Need to login again...');
            }
        } catch (e) {
            console.log('Could not load session. Will login fresh...');
        }
    }
    
    console.log('Logging in to Instagram...');
    
    // Perform login
    try {
        // If 2FA is enabled, you need to handle it manually
        await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
        console.log('Login successful!');
        
        // Save session to file
        const sessionData = await ig.state.serialize();
        fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData));
        console.log(`Session saved to ${SESSION_FILE}`);
        
        return ig;
    } catch (error) {
        console.error('Login failed:', error.message);
        
        if (error.message.includes('Two-factor code')) {
            console.log('\nTwo-factor authentication is required.');
            console.log('Please enable 2FA on your Instagram account or use an app that generates codes.');
        } else if (error.message.includes('challenge')) {
            console.log('\nInstagram is showing a challenge (verification) page.');
            console.log('This usually happens when:');
            console.log('  - You logged in from a new device');
            console.log('  - Instagram detected suspicious activity');
            console.log('  - Your account has been flagged');
            console.log('\nTry:');
            console.log('  1. Logout and login via Instagram app first');
            console.log('  2. Disable 2FA temporarily');
            console.log('  3. Wait a few hours and try again');
        }
        
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    login()
        .then(() => {
            console.log('\nLogin completed!');
            process.exit(0);
        })
        .catch(err => {
            console.error('\nLogin failed:', err.message);
            process.exit(1);
        });
}

module.exports = { login, SESSION_FILE };
