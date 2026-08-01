# 🎬 WatchTogether — Synchronized Watch-Party Platform

A synchronized watch-party platform designed for friend groups (2–5 people). Supports direct YouTube link embedding, local video file HLS streaming, live 60 FPS WebRTC tab capture (Animepahe, Netflix, arbitrary web players), real-time text chat, and WebRTC voice chat.

---

## 🚀 Deployed Public URLs

- **Client (Vercel SPA)**: [https://client-one-xi-99.vercel.app](https://client-one-xi-99.vercel.app)
- **Server (Fly.io Container with FFmpeg)**: `https://watchtogether-server-moksh.fly.dev`

---

## 🌟 Key Features

1. **YouTube Synchronized Playback**:
   - Direct-embed YouTube player using official IFrame API.
   - Leader clock sync with background drift correction (`useSyncClock` checks and corrects position drift >0.4s every 2 seconds).
   - Feedback loop prevention guards host seeks/pauses from re-triggering socket loops.

2. **Local Video File HLS Streaming**:
   - Host uploads local video files (`.mp4`, `.mkv`, `.avi`, `.mov`).
   - Server streams and transcodes the uploaded file in real time into HLS segments (`.m3u8` / `.ts`) using `ffmpeg`.
   - Client plays the HLS stream via `hls.js` with quality toggles (`720p Normal` / `480p Data Saver`).

3. **Live Tab Capture (0 Latency WebRTC)**:
   - Host shares any browser tab with audio (`navigator.mediaDevices.getDisplayMedia`).
   - Hardware-accelerated 60 FPS 1080p WebRTC Peer-to-Peer stream with **0 latency** and **0 buffering**.

4. **Real-Time Text & Voice Chat**:
   - Real-time text chat panel with user avatars, timestamps, and system notifications.
   - Full-duplex WebRTC voice mesh (`RTCPeerConnection` + STUN servers) with mic mute and deafen toggles.

5. **State Persistence & Server Reaper**:
   - SQLite (`better-sqlite3`) database backup (`watchtogether.db`) ensures room state survives server restarts.
   - Server Reaper job automatically cleans up `server/tmp/<roomId>/` temporary files and kills ffmpeg processes 5 minutes after a room becomes empty.

---

## 🏗️ Architecture & Deployment Overview

```
┌────────────────────────────────────────────────────────────────────┐
│                    Client (Vercel - Static SPA)                    │
│  https://client-one-xi-99.vercel.app                               │
│   ├─ vercel.json (SPA rewrite all routes to /index.html)          │
│   └─ VITE_SERVER_URL=https://watchtogether-server-moksh.fly.dev    │
└──────────────┬───────────────────────────────────┬─────────────────┘
               │ Socket.io / WebSockets (WSS)      │ HLS / HTTP API
               ▼                                   ▼
┌────────────────────────────────────────────────────────────────────┐
│             Server (Fly.io - Containerized VM)                     │
│  https://watchtogether-server-moksh.fly.dev                        │
│   ├─ Dockerfile (node:20-slim + ffmpeg binary)                     │
│   ├─ fly.toml (internal_port = 3001, force_https, WebSocket proxy) │
│   └─ CLIENT_ORIGIN=https://client-one-xi-99.vercel.app            │
└────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Deployment Instructions

### 1. Server Deployment (Fly.io)

The backend server requires a real Docker container running Node.js and FFmpeg with persistent WebSocket proxying.

1. Navigate to the server directory:
   ```bash
   cd server
   ```
2. Build & deploy to Fly.io:
   ```bash
   flyctl launch --copy-config --yes
   flyctl deploy
   ```
3. Set environment variables on Fly.io:
   ```bash
   flyctl secrets set CLIENT_ORIGIN=https://client-one-xi-99.vercel.app
   ```

### 2. Client Deployment (Vercel)

The frontend is deployed as a static React SPA on Vercel.

1. Navigate to the client directory:
   ```bash
   cd client
   ```
2. Deploy to Vercel production:
   ```bash
   vercel --prod
   ```
3. Set the environment variable in Vercel project settings:
   ```env
   VITE_SERVER_URL=https://watchtogether-server-moksh.fly.dev
   ```

---

## ⚠️ Architectural & Hosting Notes

1. **Fly.io VM vs. Function Cold-Starts**:
   - Fly.io free allowance is usage-based rather than sleeping after 15 minutes. This is critical for WatchTogether because active FFmpeg transcoding sessions and long-lived Socket.io connections will not get cold-start-killed mid-stream.

2. **WebRTC NAT / TURN Limitation**:
   - Voice chat and live screen sharing use public Google STUN servers (`stun:stun.l.google.com:19302`). No TURN relay server is configured. Users behind strict or symmetric NATs (e.g. strict corporate firewalls) may fail to establish peer-to-peer WebRTC connections. This is a known, acceptable infrastructure trade-off for free-tier hosting.

---

## 🛠️ Local Development Setup

```bash
# Start backend server
cd server
npm install
npm run dev

# Start frontend client
cd client
npm install
npm run dev
```

- Server running at: `http://localhost:3001`
- Client running at: `http://localhost:5173`

---

## ⚡ License

MIT License — Built for synchronized watch parties with friends.
