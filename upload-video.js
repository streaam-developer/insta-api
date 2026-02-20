const fs = require("fs");
const path = require("path");
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require("@aws-sdk/client-s3");
const { IgApiClient } = require("instagram-private-api");
const { loadConfig, getSessionFilePath, loginSingleAccount } = require("./login");

const ROOT_DIR = __dirname;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getUploadStateFilePath(config, username) {
  const stateDir = path.join(ROOT_DIR, config.upload.state_dir || "state");
  ensureDir(stateDir);
  return path.join(stateDir, `uploaded-${username}.json`);
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function isVideoObject(item) {
  const key = item.Key || "";
  const lowered = key.toLowerCase();
  return (
    lowered.endsWith(".mp4") ||
    lowered.endsWith(".mov") ||
    lowered.endsWith(".m4v") ||
    lowered.endsWith(".webm")
  );
}

async function listAllVideosFromR2(s3, bucket, prefix) {
  const items = [];
  let continuationToken;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix || "",
        ContinuationToken: continuationToken,
      })
    );

    const contents = response.Contents || [];
    for (const item of contents) {
      if (isVideoObject(item)) {
        items.push(item);
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  items.sort((a, b) => {
    const aTime = a.LastModified ? new Date(a.LastModified).getTime() : 0;
    const bTime = b.LastModified ? new Date(b.LastModified).getTime() : 0;
    return aTime - bTime;
  });

  return items;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function downloadR2ObjectToBuffer(s3, bucket, key) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`Empty body returned for object: ${key}`);
  }

  return streamToBuffer(response.Body);
}

async function createIgFromSession(config, username) {
  const sessionFilePath = getSessionFilePath(config, username);
  if (!fs.existsSync(sessionFilePath)) {
    await loginSingleAccount({
      username,
      password: config.instagram.password,
      config,
    });
  }

  const ig = new IgApiClient();
  ig.state.generateDevice(username);
  try {
    const session = JSON.parse(fs.readFileSync(sessionFilePath, "utf8"));
    await ig.state.deserialize(session);
    await ig.account.currentUser();
  } catch (error) {
    await loginSingleAccount({
      username,
      password: config.instagram.password,
      config,
    });
    const session = JSON.parse(fs.readFileSync(sessionFilePath, "utf8"));
    await ig.state.deserialize(session);
    await ig.account.currentUser();
  }

  return ig;
}

function getCoverJpegBuffer() {
  // 1x1 JPEG
  return Buffer.from(
    "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCABkAGQDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAVEQEBAAAAAAAAAAAAAAAAAAAAAv/aAAwDAQACEAMQAAAB4AAf/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAwEBPwFH/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAgEBPwFH/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9k=",
    "base64"
  );
}

async function publishAsReel(ig, videoBuffer, caption) {
  const coverImage = getCoverJpegBuffer();

  const attempts = [
    { video: videoBuffer, coverImage, caption, isClip: true },
    { video: videoBuffer, coverImage, caption, post: "reel" },
    { video: videoBuffer, coverImage, caption },
  ];

  let lastError;
  for (const payload of attempts) {
    try {
      const result = await ig.publish.video(payload);
      return result;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unknown publish error.");
}

function pickNextUnpostedVideo(videoItems, uploadedSet) {
  for (const item of videoItems) {
    if (!uploadedSet.has(item.Key)) {
      return item;
    }
  }
  return null;
}

async function run() {
  const config = loadConfig();
  const usernameArg = process.argv[2];
  const username = usernameArg || config.instagram.usernames[0];

  if (!username) {
    throw new Error("No username provided. Add instagram.usernames in config.json.");
  }

  const r2 = config.r2_config || {};
  if (!r2.endpoint_url || !r2.aws_access_key_id || !r2.aws_secret_access_key || !r2.bucket_name) {
    throw new Error("config.json: r2_config is incomplete.");
  }

  const statePath = getUploadStateFilePath(config, username);
  const state = readJsonIfExists(statePath, { username, uploaded_keys: [] });
  const uploadedSet = new Set(state.uploaded_keys || []);

  const s3 = new S3Client({
    region: "auto",
    endpoint: r2.endpoint_url,
    forcePathStyle: true,
    credentials: {
      accessKeyId: r2.aws_access_key_id,
      secretAccessKey: r2.aws_secret_access_key,
    },
  });

  const videos = await listAllVideosFromR2(s3, r2.bucket_name, r2.prefix || "");
  if (videos.length === 0) {
    console.log("No video files found in R2 bucket.");
    return;
  }

  const nextVideo = pickNextUnpostedVideo(videos, uploadedSet);
  if (!nextVideo) {
    console.log("All detected R2 videos are already uploaded for this account.");
    return;
  }

  console.log(`[${username}] Next video: ${nextVideo.Key}`);
  const ig = await createIgFromSession(config, username);
  const videoBuffer = await downloadR2ObjectToBuffer(s3, r2.bucket_name, nextVideo.Key);
  const caption =
    config.upload.caption ||
    config.upload.default_caption ||
    `Reel: ${path.basename(nextVideo.Key)}`;

  const result = await publishAsReel(ig, videoBuffer, caption);
  uploadedSet.add(nextVideo.Key);

  const newState = {
    username,
    uploaded_keys: Array.from(uploadedSet),
    last_uploaded: {
      key: nextVideo.Key,
      at: new Date().toISOString(),
      media_id: result?.media?.id || null,
      code: result?.media?.code || null,
    },
  };
  saveJson(statePath, newState);

  console.log("Upload complete.");
  if (result?.media?.code) {
    console.log(`Instagram URL: https://www.instagram.com/reel/${result.media.code}/`);
  }
}

if (require.main === module) {
  run().catch((error) => {
    const text = `${error?.message || ""} ${error?.response?.body?.message || ""}`.toLowerCase();
    if (text.includes("checkpoint_required") || text.includes("two_factor_required")) {
      const usernameArg = process.argv[2] ? ` ${process.argv[2]}` : "";
      console.error(
        `Upload blocked by Instagram security check. Run "node login.js${usernameArg}" and complete verification, then rerun upload.`
      );
    } else {
      console.error(`Upload failed: ${error.message}`);
    }
    process.exit(1);
  });
}

module.exports = {
  run,
  listAllVideosFromR2,
  pickNextUnpostedVideo,
  publishAsReel,
};
