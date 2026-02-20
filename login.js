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
 * Handle Instagram checkpoint/challenge (instagram-private-api v1.46+)
 * Uses the challenge helper to automatically pick a verification method (email/SMS),
 * sends the security code, and prompts the user to enter it.
 */
async function handleCheckpoint(ig) {
    console.log('\n=== Instagram Checkpoint Required ===');
    console.log('Instagram is asking for verification. This happens when:');
    console.log('  - You login from a new device');
    console.log('  - Suspicious activity detected');

    try {
        // auto(true) will select the default challenge method and send the code
        const autoResult = await ig.challenge.auto(true);
        console.log(`Verification code sent via: ${autoResult?.step_data?.contact_point || 'the default method'}`);

        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const code = await new Promise((resolve) => {
            readline.question('Enter the verification code you received: ', (input) => {
                readline.close();
                resolve(input.trim());
            });
        });

        const verifyResult = await ig.challenge.sendSecurityCode(code);
        if (verifyResult?.logged_in_user) {
            console.log('Verification successful!');
            return true;
        }

        console.error('Verification failed; Instagram did not accept the code.');
        return false;
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
            
            // Test if session is still valid by querying the current user
            try {
                await ig.user.info(ig.state.cookieUserId);
                console.log('Session is valid! You are logged in.');
                return ig;
            } catch (e) {
                console.log('Session expired or invalid. Need to login again...');
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
