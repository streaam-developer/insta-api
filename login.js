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
 * Handle Instagram checkpoint/challenge using the correct API
 */
async function handleCheckpoint(ig) {
    console.log('\n=== Instagram Checkpoint Required ===');
    console.log('Instagram is asking for verification. This happens when:');
    console.log('  - You login from a new device');
    console.log('  - Suspicious activity detected');
    
    try {
        // Get challenge state - this is available after login fails with checkpoint
        const challenge = ig.state.challenge;
        
        if (!challenge) {
            console.log('Challenge info not found. Let me try another method...');
            
            // Try to get challenge directly
            const challengeApi = await ig.account.sendChallengeCode('0'); // 0 = email, 1 = SMS
            console.log('Challenge API response:', challengeApi);
            return false;
        }
        
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
                    // Send challenge code
                    const method = choice === '1' ? '0' : '1';
                    await ig.account.sendChallengeCode(method);
                    console.log(`Code sent via ${choice === '1' ? 'email' : 'SMS'}`);
                    
                    const rl2 = require('readline').createInterface({
                        input: process.stdin,
                        output: process.stdout
                    });
                    
                    rl2.question('Enter the code: ', async (code) => {
                        rl2.close();
                        
                        try {
                            // Verify the code
                            const result = await ig.account.verifyChallengeCode(code);
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
    } catch (e) {
        console.error('Error in checkpoint handling:', e.message);
        return false;
    }
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
            const errorMsg = error.response?.body?.message || error.message;
            console.error(`\nLogin attempt ${attempts}/${maxAttempts} failed:`, errorMsg);
            
            // Check for checkpoint challenge
            if (errorMsg.includes('checkpoint') || errorMsg.includes('challenge')) {
                console.log('\nInstagram requires verification (checkpoint)');
                
                // Try to handle checkpoint
                const handled = await handleCheckpoint(ig);
                if (handled) {
                    console.log('\nRetrying login after verification...');
                    continue;
                } else {
                    console.log('\nCould not handle checkpoint automatically.');
                }
            }
            
            // Handle 2FA
            if (errorMsg.includes('two-factor')) {
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
                console.log('\n=== Manual Verification Required ===');
                console.log('Instagram has blocked automated login. You need to verify manually.');
                console.log('\nPlease do the following:');
                console.log('  1. Login to Instagram on your phone');
                console.log('  2. Check for a security notification/email');
                console.log('  3. Approve the new device login');
                console.log('  4. Wait 30 minutes, then try again');
                console.log('\nOr try deleting session.json and running login.js again.');
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
