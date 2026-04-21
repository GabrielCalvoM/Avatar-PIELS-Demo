require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB_NAME || "PIELSPosesDB";
const userCollectionName = process.env.MONGODB_USER_POSES_COLLECTION || "user_poses";
const systemCollectionName = process.env.MONGODB_SYSTEM_POSES_COLLECTION || "system_poses";
const apiKey = process.env.API_KEY || "";

if (!mongoUri || mongoUri.includes("<username>") || mongoUri.includes("<password>")) {
  throw new Error("Invalid MONGODB_URI. Set a real MongoDB URI in Backend/.env");
}

const corsOrigins = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => value.length > 0);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || corsOrigins.includes("*") || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS"));
    },
  })
);

app.use(express.json({ limit: "2mb" }));

app.use((req, res, next) => {
  if (!apiKey) {
    next();
    return;
  }

  if (req.path === "/api/health") {
    next();
    return;
  }

  const providedKey = req.header("x-api-key");
  if (providedKey !== apiKey) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
});

const client = new MongoClient(mongoUri);

let db;
let userPosesCollection;
let systemPosesCollection;

function getCollection(isSystemPose) {
  return isSystemPose ? systemPosesCollection : userPosesCollection;
}

function parseSystemFlag(rawValue) {
  if (typeof rawValue !== "string") {
    return false;
  }

  const normalized = rawValue.toLowerCase();
  return normalized === "true" || normalized === "1";
}

function normalizePoseName(name) {
  return String(name || "").trim();
}

app.get("/api/health", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.get("/api/poses", async (req, res) => {
  try {
    const isSystemPose = parseSystemFlag(req.query.system);
    const collection = getCollection(isSystemPose);

    const docs = await collection
      .find({}, { projection: { _id: 0, poseName: 1 } })
      .sort({ poseName: 1 })
      .toArray();

    res.json({ poseNames: docs.map((doc) => doc.poseName) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/poses/:poseName", async (req, res) => {
  try {
    const isSystemPose = parseSystemFlag(req.query.system);
    const collection = getCollection(isSystemPose);
    const poseName = normalizePoseName(req.params.poseName);

    if (!poseName) {
      res.status(400).json({ error: "poseName is required" });
      return;
    }

    const doc = await collection.findOne({ poseName });
    if (!doc) {
      res.status(404).json({ error: "Pose not found" });
      return;
    }

    res.json({
      poseName: doc.poseName,
      pose: {
        bones: doc.bones || [],
        facialExpression: doc.facialExpression || {},
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/poses/:poseName", async (req, res) => {
  try {
    const isSystemPose = parseSystemFlag(req.query.system);
    const collection = getCollection(isSystemPose);

    const poseNameFromPath = normalizePoseName(req.params.poseName);
    const poseNameFromBody = normalizePoseName(req.body && req.body.poseName);
    const poseName = poseNameFromBody || poseNameFromPath;

    if (!poseName) {
      res.status(400).json({ error: "poseName is required" });
      return;
    }

    const pose = req.body && req.body.pose;
    if (!pose || !Array.isArray(pose.bones)) {
      res.status(400).json({ error: "pose with bones array is required" });
      return;
    }

    const now = new Date();

    const existing = await collection.findOne({ poseName });

    if (existing) {
      await collection.updateOne(
        { poseName },
        {
          $set: {
            bones: pose.bones,
            facialExpression: pose.facialExpression || {},
            updatedAt: now,
          },
        }
      );
    } else {
      await collection.insertOne({
        poseName,
        createdBy: isSystemPose ? "system" : "user",
        createdAt: now,
        updatedAt: now,
        bones: pose.bones,
        facialExpression: pose.facialExpression || {},
      });
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/poses/:poseName", async (req, res) => {
  try {
    const isSystemPose = parseSystemFlag(req.query.system);
    const collection = getCollection(isSystemPose);
    const poseName = normalizePoseName(req.params.poseName);

    if (!poseName) {
      res.status(400).json({ error: "poseName is required" });
      return;
    }

    const result = await collection.deleteOne({ poseName });
    if (result.deletedCount === 0) {
      res.status(404).json({ error: "Pose not found" });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function start() {
  await client.connect();
  db = client.db(dbName);
  userPosesCollection = db.collection(userCollectionName);
  systemPosesCollection = db.collection(systemCollectionName);

  await userPosesCollection.createIndex({ poseName: 1 }, { unique: true });
  await systemPosesCollection.createIndex({ poseName: 1 }, { unique: true });

  app.listen(port, () => {
    console.log(`Pose backend listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
