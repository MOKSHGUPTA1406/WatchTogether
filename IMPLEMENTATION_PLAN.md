# WatchTogether — Implementation Plan

A synchronized watch-party platform for small friend groups (2–5 people).
Supports: direct-embed links (YouTube-style), host file streaming, tab-capture
of arbitrary websites, synchronized playback, text chat, and voice chat.

This document is written for a coding agent to execute step by step. Each
phase is self-contained, produces a working checkpoint, and lists explicit
file paths, dependencies, and acceptance criteria.

---

## 0. High-level architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                            Client (React)                          │
│  RoomPage                                                          │
│   ├─ PlayerPanel   (YouTube iframe OR hls.js <video>)               │
│   ├─ ChatPanel     (text messages)                                 │
│   ├─ VoicePanel    (WebRTC mesh, mute/deafen controls)             │
│   └─ HostControls  (source picker: link / upload / tab-capture)     │
└──────────────┬───────────────────────────────────┬─────────────────┘
               │ Socket.io (sync + chat + signaling)│ HLS over HTTP
               ▼                                    ▼
┌───────────────────────────────┐   ┌───────────────────────────────┐
│         Sync Server           │   │        Media Server           │
│  Node.js + Express + Socket.io│   │  Node.js + ffmpeg              │
│  - room state (leader clock)  │   │  - ingest: file upload /       │
│  - chat relay                 │   │    tab-capture stream          │
│  - WebRTC signaling relay     │   │  - transcode → HLS segments    │
│  - persists state to SQLite   │   │  - serves HLS via static route │
└───────────────────────────────┘   └───────────────────────────────┘
```

Two logical servers, can run as one Node process with two route groups for
v1 (no need to split into microservices at this scale).

### Repo structure

```
watchtogether/
├── server/
│   ├── src/
│   │   ├── index.js              # entrypoint, http server + socket.io attach
│   │   ├── rooms/
│   │   │   ├── roomStore.js      # in-memory + SQLite-backed room state
│   │   │   └── roomEvents.js     # socket.io event handlers for sync
│   │   ├── chat/
│   │   │   └── chatEvents.js     # socket.io event handlers for chat
│   │   ├── voice/
│   │   │   └── signalingEvents.js# WebRTC offer/answer/ice relay
│   │   ├── media/
│   │   │   ├── uploadRoutes.js   # chunked upload endpoint
│   │   │   ├── captureRoutes.js  # tab-capture ingest endpoint (RTMP/WHIP or ws binary)
│   │   │   ├── transcoder.js     # ffmpeg wrapper, spawns per-room process
│   │   │   └── hlsRoutes.js      # static serve of HLS segments per room
│   │   └── db/
│   │       └── schema.sql
│   ├── package.json
│   └── .env.example
├── client/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── pages/
│   │   │   ├── HomePage.jsx      # create/join room
│   │   │   └── RoomPage.jsx      # main watch-party view
│   │   ├── components/
│   │   │   ├── PlayerPanel/
│   │   │   │   ├── YouTubePlayer.jsx
│   │   │   │   └── HlsPlayer.jsx
│   │   │   ├── ChatPanel.jsx
│   │   │   ├── VoicePanel.jsx
│   │   │   └── HostControls.jsx
│   │   ├── hooks/
│   │   │   ├── useRoomSocket.js
│   │   │   ├── useSyncClock.js
│   │   │   └── useWebRTCVoice.js
│   │   └── lib/
│   │       └── socket.js
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## 1. Phase 1 — Sync server + room state + text chat

**Goal:** Two browser tabs can join the same room code, see each other in a
user list, and exchange chat messages. No video yet.

### Backend

- `server/src/index.js`: Express app + `http.createServer` + `socket.io`
  attached to it. CORS open to client origin (env var `CLIENT_ORIGIN`).
- `server/src/rooms/roomStore.js`:
  - In-memory `Map<roomId, RoomState>` where
    ```ts
    RoomState = {
      roomId: string,
      hostSocketId: string,
      sourceType: 'none' | 'youtube' | 'file' | 'capture',
      sourceUrl: string | null,
      currentTime: number,       // seconds
      isPlaying: boolean,
      updatedAt: number,         // server timestamp, ms epoch
      members: Map<socketId, { displayName: string }>
    }
    ```
  - `getOrCreateRoom(roomId)`, `updateRoomSource(...)`, `updatePlayback(...)`,
    `addMember(...)`, `removeMember(...)`.
  - On every state mutation, persist a snapshot to SQLite (`rooms` table,
    upsert by `roomId`) so a server restart doesn't lose the current
    room state. Use `better-sqlite3` — synchronous, no async ceremony
    needed at this scale.
- `server/src/db/schema.sql`:
  ```sql
  CREATE TABLE IF NOT EXISTS rooms (
    room_id TEXT PRIMARY KEY,
    source_type TEXT,
    source_url TEXT,
    current_time REAL,
    is_playing INTEGER,
    updated_at INTEGER
  );
  ```
- `server/src/rooms/roomEvents.js` — socket.io handlers namespaced under
  connection:
  - `room:join` `{ roomId, displayName }` → adds member, if room doesn't
    exist creates it with this socket as host, replies `room:state` with
    full RoomState + member list, broadcasts `room:memberJoined` to others.
  - `room:leave` / `disconnect` → removes member, reassigns `hostSocketId`
    to the next member if the host left, broadcasts `room:hostChanged` and
    `room:memberLeft`.
  - `room:setSource` `{ roomId, sourceType, sourceUrl }` → only accepted
    from `hostSocketId`; updates state, broadcasts `room:sourceChanged`.
  - `room:play` / `room:pause` `{ roomId, currentTime }` → only from host;
    updates state with `updatedAt = Date.now()`, broadcasts `room:playbackChanged`.
  - `room:seek` `{ roomId, currentTime }` → same as above, host-only.
  - `room:requestSync` `{ roomId }` → any client can ask; server replies
    `room:state` with current authoritative state. Used by clients to
    resolve drift (see Phase 3).

  **Host-authority rule:** server rejects playback-mutating events from
  non-host socket ids (silently ack-fail, log). This is the single source
  of truth principle — keeps sync logic simple.

- `server/src/chat/chatEvents.js`:
  - `chat:send` `{ roomId, displayName, text }` → broadcast `chat:message`
    `{ displayName, text, ts }` to room. No persistence needed for v1
    (ephemeral, in-memory broadcast only).

### Frontend

- `client/src/lib/socket.js`: singleton `socket.io-client` instance,
  connects to `VITE_SERVER_URL`.
- `client/src/hooks/useRoomSocket.js`: wraps join/leave, exposes
  `{ roomState, members, sendChat, chatLog, setSource, play, pause, seek }`.
- `client/src/pages/HomePage.jsx`: input for display name + room code
  (generate random 6-char code if creating new), navigates to `/room/:roomId`.
- `client/src/pages/RoomPage.jsx`: mounts `ChatPanel` and a placeholder
  `<div>Player goes here</div>` for now, plus member list.
- `client/src/components/ChatPanel.jsx`: message list + input, uses
  `useRoomSocket`.

### Acceptance criteria

- Open two browser tabs, both join room `ABCDE` with different display
  names.
- Both appear in each other's member list.
- Chat message sent from tab A appears in tab B within ~200ms.
- Kill tab A (host) → tab B becomes host (verify via a debug log or UI badge).
- Restart the server process → room state for still-open room B is
  recovered from SQLite on `room:requestSync`.

---

## 2. Phase 2 — Direct-embed link mode (YouTube) with synchronized playback

**Goal:** Host pastes a YouTube URL, everyone's player loads it and stays
in sync on play/pause/seek.

### Frontend

- `client/src/components/PlayerPanel/YouTubePlayer.jsx`:
  - Loads YouTube IFrame API script once (guard with a module-level flag).
  - Renders `<div id="yt-player">`, instantiates `YT.Player` on mount with
    `videoId` parsed from the source URL.
  - Exposes imperative handle (`useImperativeHandle` or a ref callback)
    with `getCurrentTime()`, `seekTo(t)`, `playVideo()`, `pauseVideo()`.
  - Listens to YT player `onStateChange`:
    - If **this client is host**, and the change was a genuine user
      action (not a programmatic seek we just issued), emit
      `room:play` / `room:pause` / `room:seek` accordingly.
    - Guard against feedback loops: track a `lastProgrammaticActionTs`
      and ignore state-change events within ~300ms of a sync-applied
      action.
- `client/src/hooks/useSyncClock.js` (drift correction, used by every
  player type):
  - On `room:playbackChanged` / `room:sourceChanged` from server, compute
    expected current time: `expectedTime = serverState.currentTime + (serverState.isPlaying ? (Date.now() - serverState.updatedAt)/1000 : 0)`.
  - Compare to local player's actual time. If `abs(diff) > 0.4s`, call
    `seekTo(expectedTime)`.
  - Run this check every 2s via `setInterval` for all clients (not just
    on events) — catches slow drift from buffering/frame-rate differences.
- `client/src/components/HostControls.jsx`: text input for a URL; on
  submit, detect if it's a YouTube URL (regex) → `setSource('youtube', url)`.
  Non-YouTube links funnel toward Phase 4 (tab-capture) — show a note
  "non-YouTube links will open in tab-capture mode" for now (stub button,
  wire up in Phase 4).

### Acceptance criteria

- Host pastes a YouTube link, both clients' players load and start in
  sync.
- Host pauses → both clients pause within ~1s, positions match within
  0.5s.
- Host seeks → both clients jump to the same position.
- Non-host client manually scrubs their own player (simulating drift) →
  within 2s it snaps back to the host's position via `useSyncClock`.

---

## 3. Phase 3 — File-mode pipeline (chunked upload → ffmpeg → HLS → hls.js)

**Goal:** Host uploads a local video file (or points to a file mid-download,
VLC-style); server transcodes to HLS as bytes arrive; all clients play the
HLS stream in sync.

### Backend

- **Dependencies:** `ffmpeg` binary must be on PATH (document install
  instructions in README — `apt install ffmpeg` / brew / choco).
  `fluent-ffmpeg` npm package as the JS wrapper. `multer` for chunked
  upload handling, or a raw `busboy` stream pipe for lower overhead.
- `server/src/media/uploadRoutes.js`:
  - `POST /api/rooms/:roomId/upload` — accepts a streamed file body
    (not buffered fully in memory — pipe directly to disk at
    `server/tmp/<roomId>/source.<ext>`).
  - As soon as the write stream has flushed the first ~2MB (enough for
    ffmpeg to find a moov atom / start reading), kick off
    `transcoder.startTranscode(roomId, sourcePath)`.
  - This gives you the "VLC-style, plays while still downloading"
    behavior for free — ffmpeg with `-re`-less input reading from a
    growing file works as long as the container format allows it
    (recommend clients pre-remux to fragmented mp4 or just accept
    regular mp4/mkv — ffmpeg handles growing files fine for most
    common containers when not doing `-c copy` on a file with a
    trailing moov; transcoding path avoids that issue entirely).
- `server/src/media/transcoder.js`:
  - `startTranscode(roomId, inputPath)`:
    ```js
    ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-preset veryfast',
        '-g 48',                 // keyframe interval for clean HLS segments
        '-sc_threshold 0',
        '-hls_time 4',
        '-hls_list_size 10',
        '-hls_flags delete_segments+append_list',
        '-vf scale=-2:480',      // data-saver default; make configurable
        '-b:v 800k',
        '-b:a 128k',
      ])
      .output(`server/tmp/${roomId}/stream.m3u8`)
      .on('error', err => { /* log, emit room:transcodeError */ })
      .run();
    ```
  - Track running ffmpeg processes in a `Map<roomId, ChildProcess>` so
    you can `.kill()` on room close / new source set.
  - Expose a `stopTranscode(roomId)` to clean up when host changes
    source or leaves.
  - **Quality toggle:** accept a `quality` param (`'data-saver' | 'normal'`)
    mapping to different `scale`/`b:v` presets. Store the room's chosen
    quality in RoomState.
- `server/src/media/hlsRoutes.js`:
  - `GET /media/:roomId/stream.m3u8` and `GET /media/:roomId/:segment.ts`
    — `express.static` pointed at `server/tmp/<roomId>/`, or explicit
    route handlers with correct `Content-Type` (`application/vnd.apple.mpegurl`
    for the manifest, `video/mp2t` for segments).
  - Poll/notify: once the first `.ts` segment exists, emit
    `room:mediaReady` `{ roomId }` via socket so clients know to attach
    the `<video>` element instead of showing "processing...".

### Frontend

- `client/src/components/PlayerPanel/HlsPlayer.jsx`:
  - Uses `hls.js` (`npm i hls.js`) for non-Safari browsers; native
    `<video>` `src` for Safari (check `canPlayType('application/vnd.apple.mpegurl')`).
  - Same imperative interface as `YouTubePlayer` (`getCurrentTime`,
    `seekTo`, `play`, `pause`) so `useSyncClock` and host-control logic
    work identically regardless of player type — this is the key
    abstraction, keep the interface identical across both player
    components.
  - On `room:mediaReady`, set `hls.loadSource('/media/:roomId/stream.m3u8')`.
- `client/src/components/HostControls.jsx`: add a file `<input type=file>`;
  on selection, `fetch(PUT/POST)` to `/api/rooms/:roomId/upload` with the
  raw file as a stream body (use `fetch` with a `ReadableStream` body or
  simple `FormData` — simple XHR/fetch upload is fine at this file size
  range; don't over-engineer with resumable upload protocols for v1).
  Show upload progress bar. On `room:mediaReady`, call
  `setSource('file', null)` — the room's source is implicitly "this
  room's own HLS output," no URL needed.

### Acceptance criteria

- Host selects a local video file, upload begins, a progress bar shows.
- Within ~10-20s (depending on file size/encode speed), other clients'
  players auto-load and start playing.
- Pause/seek/play sync exactly as in Phase 2 — verify `useSyncClock`
  requires zero changes to work with `HlsPlayer`, since the interface
  is shared.
- Confirm CPU load is reasonable (single ffmpeg process, `veryfast`
  preset) — note actual transcode speed vs real-time in README as a
  known constraint (a slow CPU may cause the stream to lag behind
  real-time watching; document this rather than silently degrading).

---

## 4. Phase 4 — Tab-capture mode (arbitrary websites, e.g. Animepahe)

**Goal:** Host shares a browser tab; server ingests that as a live stream
and transcodes it the same way as file-mode, so any website's video can
be watched together without needing that site's embed API.

**Important scope note:** this only captures what's legitimately playing
in the host's own browser (screen-share style, same mechanism as Zoom/Discord
screen share) — it does not extract, scrape, or rehost the site's video
stream directly. Do not build direct `.m3u8`/source-URL extraction from
third-party sites; that's a different (and legally risky) approach and is
explicitly out of scope.

### Frontend

- `client/src/hooks/useTabCapture.js`:
  - `navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })`
    — prompt host to pick "this tab" (Chrome supports tab-level capture
    with audio; note Firefox/Safari support is weaker, document as
    Chrome-recommended in README).
  - Once granted, use `MediaRecorder` on the captured `MediaStream`
    (`video/webm; codecs=vp8,opus` for broad support) with a short
    `timeslice` (e.g. 1000ms) to get periodic `Blob` chunks via
    `ondataavailable`.
  - Stream each chunk over a WebSocket (separate namespace, e.g.
    `/capture-ingest`) to the server, tagged with `roomId`. Don't reuse
    the main sync socket for binary media — keep concerns separated.
- `client/src/components/HostControls.jsx`: add a "Share a tab" button
  that triggers `useTabCapture`, and once capture starts, calls
  `setSource('capture', null)`.

### Backend

- `server/src/media/captureRoutes.js`:
  - New socket.io namespace or raw `ws` server at `/capture-ingest`.
  - On connect with `{ roomId }`, open a writable stream/pipe into
    ffmpeg's stdin (`ffmpeg -i pipe:0 ...`) instead of a file path —
    same output options/HLS settings as `transcoder.js` Phase 3, just
    a different input source. Refactor `transcoder.js` to accept either
    a file path or a readable stream so both code paths share the HLS
    output logic.
  - As chunks arrive over the websocket, write them to ffmpeg's stdin.
  - Same `room:mediaReady` signal once first segment exists.
- Reuse `hlsRoutes.js` and `HlsPlayer.jsx` unchanged — this is why doing
  file-mode first paid off, tab-capture just becomes a second ingest
  path into the same transcode/serve pipeline.

### Acceptance criteria

- Host opens Animepahe (or any site) in a tab, clicks "Share a tab",
  selects that tab with audio.
- Other clients' `HlsPlayer` starts playing the captured feed within a
  reasonable delay (~10-15s is acceptable given encode overhead — set
  this expectation).
- Sync (play/pause/seek) is host-driven manually in this mode (host
  controls playback on the source site itself; there's no programmatic
  seek into someone else's tab) — clients just watch the relayed feed.
  Note: **remove seek/pause controls for non-host clients in capture
  mode**, since there's nothing to seek — the stream is live. Document
  this UX difference clearly in the UI (e.g. "Live relay — playback
  controlled by host's screen").

---

## 5. Phase 5 — Voice chat (WebRTC mesh)

**Goal:** All room members can talk to each other over voice, independent
of video sync state.

### Backend

- `server/src/voice/signalingEvents.js` — pure relay, no media touches
  the server:
  - `voice:join` `{ roomId }` → track which sockets are voice-enabled.
  - `voice:offer` `{ roomId, targetSocketId, sdp }` → relay to target.
  - `voice:answer` `{ roomId, targetSocketId, sdp }` → relay to target.
  - `voice:ice` `{ roomId, targetSocketId, candidate }` → relay to target.
  - `voice:leave` → notify others to tear down their peer connection to
    this socket.

### Frontend

- `client/src/hooks/useWebRTCVoice.js`:
  - On "join voice" click: `getUserMedia({ audio: true })`.
  - For each existing member in the room, create an `RTCPeerConnection`
    (use a public STUN server, e.g. `stun:stun.l.google.com:19302`, no
    TURN needed at this friend-group scale — document that voice may
    fail across some restrictive NATs without TURN, acceptable known
    limitation for v1).
  - Full mesh: with ≤5 participants this is at most 10 peer connections
    total — fine. Do not build an SFU for this scale.
  - Standard offer/answer/ICE dance via the signaling events above.
  - Attach remote audio tracks to hidden `<audio autoplay>` elements per
    peer.
  - Expose mute/unmute (toggle `track.enabled`) and a per-peer volume
    slider (optional nice-to-have).
- `client/src/components/VoicePanel.jsx`: "Join Voice" button, list of
  who's in voice, mute toggle, speaking indicator (optional: use
  `AudioContext` `AnalyserNode` on local stream to show a speaking dot).

### Acceptance criteria

- 3 clients join voice, all can hear each other.
- Muting one client stops their audio for others without disconnecting.
- Voice continues working uninterrupted while video is paused, switched,
  or a transcode restarts (proves decoupling from Phase 1-4 systems).

---

## 6. Phase 6 — Polish / integration pass

- **Host reassignment mid-transcode:** if host leaves during file/capture
  mode, either transfer upload/capture responsibility to new host (complex)
  or simply stop the stream and show "host left, ask the new host to
  restart the source" (simpler — do this for v1).
- **Error surfaces:** ffmpeg crash → `room:transcodeError` → toast in UI.
  Upload failure → inline error near the upload button.
- **Data-saver toggle:** expose the `quality` param from Phase 3 as a
  UI toggle for host (`480p data saver` / `720p normal`), re-runs
  transcode with new settings if source is already streaming.
- **Cleanup job:** on `room:leave` for the last member, after a grace
  period (e.g. 5 min), delete `server/tmp/<roomId>/` and kill any
  lingering ffmpeg process. Simple `setTimeout`-based reaper is enough.
- **README:** document required binaries (`ffmpeg`), env vars, how to
  run `server` and `client` locally, and the known limitations called
  out above (transcode speed vs CPU, no TURN server, Chrome recommended
  for tab-capture, capture-mode has no client-side seek).

---

## Suggested execution order for the coding agent

1. Phase 1 fully working and tested (sync + chat) before touching video.
2. Phase 2 (YouTube) — cheapest way to prove the sync abstraction end to end.
3. Phase 3 (file mode) — establishes the transcode/HLS pipeline and the
   shared player interface.
4. Phase 4 (tab-capture) — should be a small diff on top of Phase 3 if the
   transcoder was written to accept either a file path or a stream.
5. Phase 5 (voice) — fully independent, can technically be built in
   parallel with 2-4 if working with multiple agents/branches.
6. Phase 6 (polish) last, once the core paths are proven.

Each phase should end with a manual smoke test against the acceptance
criteria listed before moving to the next phase — don't let ffmpeg/HLS
bugs compound with sync bugs by skipping ahead.
