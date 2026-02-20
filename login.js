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

/**
 * Handle Instagram checkpoint/challenge
 */
async function handleCheckpoint(ig, challengeUrl) {
    console.log('\n=== Instagram Checkpoint Required ===');
    console.log('Instagram is asking for verification. This happens when:');
    console.log('  - You login from a new device');
    console.log('  - Suspicious activity detected');
    console.log('\nChoose verification method:');
    console.log('  1. Email - Code sent to your email');
    console.log('  2. Phone - Code sent to your phone number');
    
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise((resolve) => {
        readline.question('Enter choice (1/2): ', async (choice) => {
            readline.close();
            
            try {
                const challenge = await ig.challenge.selectVerifyMethod(choice === '1' ? 1 : 0);
                console.log(`Code sent via ${choice === '1' ? 'email' : 'SMS'}`);
                
                const rl2 = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                rl2.question('Enter the code: ', async (code) => {
                    rl2.close();
                    
                    try {
                        await challenge.code(code);
                        console.log('Verification successful!');
                        resolve(true);
                    } catch (e) {
                        console.error('Invalid code. Please try again.');
                        resolve(false);
                    }
                });
            } catch (e) {
                console.error('Failed to send verification code:', e.message);
                resolve(false);
            }
        });
    });
}

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
    
    // Perform login with retry logic
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
        try {
            const loginResult = await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
            console.log('Login successful!');
            console.log('User ID:', loginResult.pk);
            console.log('Username:', loginResult.username);
            
            // Save session to file
            const sessionData = await ig.state.serialize();
            fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData));
            console.log(`Session saved to ${SESSION_FILE}`);
            
            return ig;
            
        } catch (error) {
            attempts++;
            console.error(`\nLogin attempt ${attempts}/${maxAttempts} failed:`, error.message);
            
            // Check for checkpoint challenge
            if (error.message.includes('checkpoint') || error.message.includes('challenge')) {
                console.log('\nInstagram requires verification (checkpoint)');
                
                try {
                    // Get challenge info
                    const challenge = await ig.challenge.getChallenge();
                    console.log('Challenge type:', challenge.type);
                    console.log('Challenge URL:', challenge.url);
                    
                    // Try to handle checkpoint
                    const handled = await handleCheckpoint(ig, challenge.url);
                    if (handled) {
                        // After verification, try to login again
                        console.log('\nRetrying login after verification...');
                        continue;
                    }
                } catch (e) {
                    console.error('Failed to handle checkpoint:', e.message);
                }
            }
            
            // Handle 2FA
            if (error.message.includes('two-factor')) {
                console.log('\n=== Two-Factor Authentication Required ===');
                
                const readline = require('readline').createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                const code = await new Promise((resolve) => {
                    readline.question('Enter 2FA code from your authenticator app: ', resolve);
                });
                readline.close();
                
                // Try login with 2FA code
                try {
                    const loginResult = await ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD, {
                        verificationCode: code,
                        trustThisDevice: '1',
                    });
                    console.log('Login successful with 2FA!');
                    
                    const sessionData = await ig.state.serialize();
                    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData));
                    console.log(`Session saved to ${SESSION_FILE}`);
                    
                    return ig;
                } catch (e) {
                    console.error('2FA login failed:', e.message);
                }
            }
            
            if (attempts >= maxAttempts) {
                console.log('\nMax login attempts reached.');
                console.log('\nPossible solutions:');
                console.log('  1. Login via Instagram app on your phone first');
                console.log('  2. Wait 24-48 hours before retrying');
                console.log('  3. Use a different IP address');
                console.log('  4. Disable 2FA temporarily');
                throw error;
            }
            
            // Wait before retry
            console.log('Waiting 5 seconds before retry...');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
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
