# AnimadorPIELS Backend

This backend exposes a small HTTP API that Unity can call from desktop or WebGL builds.
MongoDB access is done server-side so the client does not connect directly to Atlas.

## 1. Setup

1. Install Node.js 18+.
2. In this folder, install dependencies:

```bash
npm install
```

3. Copy environment file and edit `.env` with your MongoDB URI and optional API key.

## 2. Run

```bash
npm start
```

Backend starts on `http://localhost:3000` by default.

## 3. Unity configuration

In your `MongoDBConfig` asset set:

- `Api Base Url`: `http://localhost:3000/api` for local testing.
- `Api Key`: same value as `API_KEY` in backend `.env` (or leave both empty).
- `Request Timeout Ms`: request timeout in milliseconds.

## 4. Deploy for app connection

For desktop and WebGL builds, host this backend on a public server:

- Render, Railway, Fly.io, Azure App Service, AWS, etc.
- Use HTTPS in production.
- Set `CORS_ORIGINS` to your WebGL site URL (or list of URLs).
- Put your hosted URL in Unity `Api Base Url`, for example:
  - `https://your-domain.com/api`
- If the build is for a local envirnoment, point Unity’s API base URL at your running backend, usually http://localhost:3000/api

## 5. API endpoints

- `GET /api/health`
- `GET /api/poses?system=true|false`
- `GET /api/poses/:poseName?system=true|false`
- `PUT /api/poses/:poseName?system=true|false`
- `DELETE /api/poses/:poseName?system=true|false`

### PUT body example

```json
{
  "poseName": "poseA",
  "isSystemPose": false,
  "pose": {
    "bones": [],
    "facialExpression": {}
  }
}
```
