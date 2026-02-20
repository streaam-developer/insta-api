const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { IgApiClient } = require("instagram-private-api");

const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function askUser(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || "").trim());
    });
  });
}

function normalizeApiError(error) {
  const message = (error && error.message) || "";
  const bodyMessage = error?.response?.body?.message || "";
  const full = `${message} ${bodyMessage}`.toLowerCase();
  return {
    raw: error,
    message,
    full,
    isCheckpoint: full.includes("checkpoint_required"),
    isChallenge: full.includes("challenge_required"),
    isTwoFactor:
      full.includes("two_factor_required") ||
      full.includes("two-factor") ||
      full.includes("2fa"),
  };
}

function isRecoverablePreLoginError(error) {
  const parsed = normalizeApiError(error);
  return parsed.isCheckpoint || parsed.isChallenge || parsed.isTwoFactor;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      "Missing config.json. Copy config.example.json to config.json and fill values."
    );
  }

  const config = readJson(CONFIG_PATH);
  const usernames = config?.instagram?.usernames || [];
  const password = config?.instagram?.password;

  if (!Array.isArray(usernames) || usernames.length === 0) {
    throw new Error("config.json: instagram.usernames must be a non-empty array.");
  }
  if (!password || typeof password !== "string") {
    throw new Error("config.json: instagram.password is required.");
  }

  config.upload = config.upload || {};
  config.upload.sessions_dir = config.upload.sessions_dir || "sessions";
  config.upload.min_delay_between_account_logins_ms =
    Number(config.upload.min_delay_between_account_logins_ms) || 2500;

  return config;
}

function getSessionFilePath(config, username) {
  const sessionsDir = path.join(ROOT_DIR, config.upload.sessions_dir);
  ensureDir(sessionsDir);
  return path.join(sessionsDir, `${username}.json`);
}

async function saveSession(ig, sessionFilePath) {
  const serialized = await ig.state.serialize();
  delete serialized.constants;
  fs.writeFileSync(sessionFilePath, JSON.stringify(serialized, null, 2), "utf8");
}

async function tryRestoreSession(ig, sessionFilePath) {
  if (!fs.existsSync(sessionFilePath)) {
    return false;
  }

  const session = readJson(sessionFilePath);
  await ig.state.deserialize(session);
  await ig.account.currentUser();
  return true;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleTwoFactor({ ig, error, username }) {
  const twoFactorInfo = error?.response?.body?.two_factor_info;
  if (!twoFactorInfo) {
    throw new Error(
      `[${username}] Two-factor required, but API did not provide two_factor_info.`
    );
  }

  console.log(`[${username}] Two-factor authentication required.`);
  const code = await askUser(`[${username}] Enter 2FA code: `);
  if (!code) {
    throw new Error(`[${username}] 2FA code was empty.`);
  }

  await ig.account.twoFactorLogin({
    username,
    verificationCode: code,
    twoFactorIdentifier: twoFactorInfo.two_factor_identifier,
    trustThisDevice: "1",
    verificationMethod:
      String(twoFactorInfo.totp_two_factor_on ? "0" : twoFactorInfo.sms_two_factor_on ? "1" : "1"),
  });
}

async function handleCheckpoint({ ig, username }) {
  console.log(`[${username}] Checkpoint required by Instagram.`);
  console.log(
    `[${username}] Approve the login in Instagram app if prompted, then complete code verification here.`
  );

  try {
    await ig.challenge.auto(true);
  } catch (_) {
    // Continue with manual code submission.
  }

  const code = await askUser(`[${username}] Enter checkpoint security code: `);
  if (!code) {
    throw new Error(`[${username}] Checkpoint code was empty.`);
  }

  await ig.challenge.sendSecurityCode(code);
}

async function performLoginWithChallenges({ ig, username, password }) {
  try {
    await ig.account.login(username, password);
    return;
  } catch (error) {
    const parsed = normalizeApiError(error);

    if (parsed.isTwoFactor) {
      await handleTwoFactor({ ig, error, username });
      return;
    }

    if (parsed.isCheckpoint || parsed.isChallenge) {
      await handleCheckpoint({ ig, username });
      try {
        await ig.account.currentUser();
      } catch (_) {
        await ig.account.login(username, password);
      }
      return;
    }

    throw error;
  }
}

async function loginSingleAccount({ username, password, config }) {
  const ig = new IgApiClient();
  ig.state.generateDevice(username);

  const sessionFilePath = getSessionFilePath(config, username);
  try {
    const restored = await tryRestoreSession(ig, sessionFilePath);
    if (restored) {
      console.log(`[${username}] Session restored from ${sessionFilePath}`);
      return { username, ok: true, reusedSession: true, sessionFilePath };
    }
  } catch (_) {
    console.log(`[${username}] Saved session is invalid, re-login required.`);
  }

  try {
    await ig.simulate.preLoginFlow();
  } catch (error) {
    if (!isRecoverablePreLoginError(error)) {
      throw error;
    }
    console.log(
      `[${username}] Pre-login returned a security challenge. Continuing with direct login challenge handling.`
    );
  }
  await performLoginWithChallenges({ ig, username, password });
  process.nextTick(async () => {
    try {
      await ig.simulate.postLoginFlow();
    } catch (_) {
      // Non-fatal.
    }
  });

  await saveSession(ig, sessionFilePath);
  console.log(`[${username}] Logged in and session saved: ${sessionFilePath}`);
  return { username, ok: true, reusedSession: false, sessionFilePath };
}

function resolveTargetUsernames(config) {
  const cliArgs = process.argv.slice(2).map((x) => x.trim()).filter(Boolean);
  if (cliArgs.length > 0) {
    return cliArgs;
  }
  return config.instagram.usernames;
}

async function loginAllAccounts() {
  const config = loadConfig();
  const usernames = resolveTargetUsernames(config);
  const password = config.instagram.password;
  const delayMs = config.upload.min_delay_between_account_logins_ms;

  const results = [];
  for (let i = 0; i < usernames.length; i += 1) {
    const username = usernames[i];
    try {
      const result = await loginSingleAccount({ username, password, config });
      results.push(result);
    } catch (error) {
      results.push({
        username,
        ok: false,
        reusedSession: false,
        error: error.message,
      });
      console.error(`[${username}] Login failed: ${error.message}`);
    }

    if (i < usernames.length - 1) {
      await sleep(delayMs);
    }
  }

  const okCount = results.filter((x) => x.ok).length;
  const failCount = results.length - okCount;
  console.log("\nLogin summary");
  console.log(`Total: ${results.length}`);
  console.log(`Success: ${okCount}`);
  console.log(`Failed: ${failCount}`);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  loginAllAccounts().catch((error) => {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  loadConfig,
  getSessionFilePath,
  loginSingleAccount,
  loginAllAccounts,
};
