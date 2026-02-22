const { IgApiClient } = require('instagram-private-api');

async function createAccount() {

    const ig = new IgApiClient();

    // Use a consistent device for testing
    ig.state.generateDevice("testuser12345");

    // Generate unique but valid credentials
    const randomNum = Math.floor(Math.random() * 999999);
    const username = `user${randomNum}`;
    const email = `user${randomNum}@gmail.com`;
    const password = "TestPass@12345";

    console.log("Creating account with:");
    console.log("  Username:", username);
    console.log("  Email:", email);

    try {
        // First check if username is available
        console.log("Checking username availability...");
        const usernameCheck = await ig.user.checkUsername(username);
        console.log("Username available:", usernameCheck.available);
        
        if (!usernameCheck.available) {
            console.log("Username not available, trying another...");
            return;
        }

        await ig.simulate.preLoginFlow();
        
        console.log("Attempting account creation...");
        
        const account = await ig.account.create({
            email: email,
            username: username,
            password: password,
            first_name: "Test",
            // Additional parameters now required by Instagram
            phone_number: "",  // Can be empty string
            gender: 0,  // 0 = unknown, 1 = male, 2 = female
        });

        console.log("✅ Account Created!");
        console.log(account);

    } catch (err) {
        console.error("Error creating account:");
        console.error("Status:", err.status);
        console.error("Message:", err.message);
        console.error("Response:", err.response ? err.response.body : "No response body");
        
        // Instagram often requires more params or is rate limiting
        if (err.response && err.response.body) {
            console.error("Full error details:", JSON.stringify(err.response.body, null, 2));
        }
    }
}

createAccount();