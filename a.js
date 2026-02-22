const { IgApiClient } = require('instagram-private-api');

async function createAccount() {

    const ig = new IgApiClient();

    ig.state.generateDevice("gullu" + Math.floor(Math.random()*9999));

    const email = `test${Math.floor(Math.random()*99999)}@gmail.com`;
    const username = `user${Math.floor(Math.random()*99999)}`;
    const password = "Pass@12345";

    console.log("Creating:", username);

    await ig.simulate.preLoginFlow();

    const account = await ig.account.create({
        email: email,
        username: username,
        password: password,
        first_name: "John"
    });

    console.log("✅ Account Created!");
    console.log(account);

}

createAccount();