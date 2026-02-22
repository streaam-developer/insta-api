const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');

const ig = new IgApiClient();

const USERNAME = "bat.5916445";
const PASSWORD = "rMuD@e5HH5vuvJE";

(async () => {

    ig.state.generateDevice(USERNAME);

    ig.state.deviceString = "SM-G973F"; // Samsung S10
    ig.state.appUserAgent =
      "Instagram 275.0.0.27.98 Android (30/11; 420dpi; 1080x1920; samsung; SM-G973F; beyond1; exynos9820; en_US)";

    if (fs.existsSync('./session.json')) {

        const session = JSON.parse(fs.readFileSync('./session.json'));
        await ig.state.deserialize(session);
        console.log("♻️ Session loaded");

    } else {

        await ig.simulate.preLoginFlow();
        await new Promise(r => setTimeout(r, 7000));

        await ig.account.login(USERNAME, PASSWORD);

        await ig.simulate.postLoginFlow();

        const session = await ig.state.serialize();
        delete session.constants;

        fs.writeFileSync('./session.json', JSON.stringify(session));
        console.log("💾 Session saved");
    }

    console.log("✅ Logged in");

})();
