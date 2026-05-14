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
const userHandCollectionName = process.env.MONGODB_USER_HAND_POSES_COLLECTION || "user_hand_poses";
const systemHandCollectionName = process.env.MONGODB_SYSTEM_HAND_POSES_COLLECTION || "system_hand_poses";
const systemFaceCollectionName = process.env.MONGODB_SYSTEM_FACE_POSES_COLLECTION || "system_face_poses";
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
let userHandPosesCollection;
let systemHandPosesCollection;
let systemFacePosesCollection;

function getCollection(collections, isSystemPose) {
  return isSystemPose ? collections.system : collections.user;
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

function buildPoseResponse(doc) {
  return {
    poseName: doc.poseName,
    pose: {
      bones: doc.bones || [],
      facialExpression: doc.facialExpression || {},
    },
  };
}

function registerPoseRoutes(routeBase, collections, entityLabel) {
  app.get(routeBase, async (req, res) => {
    try {
      const isSystemPose = parseSystemFlag(req.query.system);
      const collection = getCollection(collections, isSystemPose);

      const docs = await collection
        .find({}, { projection: { _id: 0, poseName: 1 } })
        .sort({ poseName: 1 })
        .toArray();

      res.json({ poseNames: docs.map((doc) => doc.poseName) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get(`${routeBase}/:poseName`, async (req, res) => {
    try {
      const isSystemPose = parseSystemFlag(req.query.system);
      const collection = getCollection(collections, isSystemPose);
      const poseName = normalizePoseName(req.params.poseName);

      if (!poseName) {
        res.status(400).json({ error: "poseName is required" });
        return;
      }

      const doc = await collection.findOne({ poseName });
      if (!doc) {
        res.status(404).json({ error: `${entityLabel} not found` });
        return;
      }

      res.json(buildPoseResponse(doc));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put(`${routeBase}/:poseName`, async (req, res) => {
    try {
      const isSystemPose = parseSystemFlag(req.query.system);
      const collection = getCollection(collections, isSystemPose);

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

  app.delete(`${routeBase}/:poseName`, async (req, res) => {
    try {
      const isSystemPose = parseSystemFlag(req.query.system);
      const collection = getCollection(collections, isSystemPose);
      const poseName = normalizePoseName(req.params.poseName);

      if (!poseName) {
        res.status(400).json({ error: "poseName is required" });
        return;
      }

      const result = await collection.deleteOne({ poseName });
      if (result.deletedCount === 0) {
        res.status(404).json({ error: `${entityLabel} not found` });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

function registerSystemPoseRoutes(routeBase, collection, entityLabel) {
  app.get(routeBase, async (req, res) => {
    try {
      const docs = await collection
        .find({}, { projection: { _id: 0, poseName: 1 } })
        .sort({ poseName: 1 })
        .toArray();

      res.json({ poseNames: docs.map((doc) => doc.poseName) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get(`${routeBase}/:poseName`, async (req, res) => {
    try {
      const poseName = normalizePoseName(req.params.poseName);

      if (!poseName) {
        res.status(400).json({ error: "poseName is required" });
        return;
      }

      const doc = await collection.findOne({ poseName });
      if (!doc) {
        res.status(404).json({ error: `${entityLabel} not found` });
        return;
      }

      res.json(buildPoseResponse(doc));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put(`${routeBase}/:poseName`, async (req, res) => {
    try {
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
          createdBy: "system",
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

  app.delete(`${routeBase}/:poseName`, async (req, res) => {
    try {
      const poseName = normalizePoseName(req.params.poseName);

      if (!poseName) {
        res.status(400).json({ error: "poseName is required" });
        return;
      }

      const result = await collection.deleteOne({ poseName });
      if (result.deletedCount === 0) {
        res.status(404).json({ error: `${entityLabel} not found` });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });
}

app.get("/api/health", async (req, res) => {
  try {
    await db.command({ ping: 1 });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

async function start() {
  await client.connect();
  db = client.db(dbName);
  userPosesCollection = db.collection(userCollectionName);
  systemPosesCollection = db.collection(systemCollectionName);
  userHandPosesCollection = db.collection(userHandCollectionName);
  systemHandPosesCollection = db.collection(systemHandCollectionName);
  systemFacePosesCollection = db.collection(systemFaceCollectionName);

  await userPosesCollection.createIndex({ poseName: 1 }, { unique: true });
  await systemPosesCollection.createIndex({ poseName: 1 }, { unique: true });
  await userHandPosesCollection.createIndex({ poseName: 1 }, { unique: true });
  await systemHandPosesCollection.createIndex({ poseName: 1 }, { unique: true });
  await systemFacePosesCollection.createIndex({ poseName: 1 }, { unique: true });

  registerPoseRoutes("/api/poses", {
    user: userPosesCollection,
    system: systemPosesCollection,
  }, "Pose");

  registerPoseRoutes("/api/hand-poses", {
    user: userHandPosesCollection,
    system: systemHandPosesCollection,
  }, "Hand pose");

  registerSystemPoseRoutes("/api/face-poses", systemFacePosesCollection, "Face pose");

  app.listen(port, () => {
    console.log(`Pose backend listening on http://localhost:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start backend:", error);
  process.exit(1);
});
