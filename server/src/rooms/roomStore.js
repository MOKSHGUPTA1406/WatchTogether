const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'watchtogether.db');
const db = new Database(dbPath);

// Execute schema
const schemaPath = path.join(__dirname, '../db/schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

// Prepared statements for fast upsert and fetch
const upsertRoomStmt = db.prepare(`
  INSERT INTO rooms (room_id, source_type, source_url, current_time, is_playing, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(room_id) DO UPDATE SET
    source_type = excluded.source_type,
    source_url = excluded.source_url,
    current_time = excluded.current_time,
    is_playing = excluded.is_playing,
    updated_at = excluded.updated_at
`);

const getRoomStmt = db.prepare(`
  SELECT room_id, source_type, source_url, current_time, is_playing, updated_at
  FROM rooms
  WHERE room_id = ?
`);

// In-memory Map of active rooms
// key: roomId (string), value: RoomState
const activeRooms = new Map();

/**
 * Persist snapshot of room to SQLite database.
 */
function persistRoom(roomState) {
  try {
    upsertRoomStmt.run(
      roomState.roomId,
      roomState.sourceType,
      roomState.sourceUrl,
      roomState.currentTime,
      roomState.isPlaying ? 1 : 0,
      roomState.updatedAt
    );
  } catch (err) {
    console.error(`[DB Error] Failed to persist room ${roomState.roomId}:`, err);
  }
}

/**
 * Serialize room state to send over socket.
 */
function serializeRoomState(room) {
  if (!room) return null;
  const membersObj = {};
  for (const [sId, member] of room.members.entries()) {
    membersObj[sId] = { displayName: member.displayName };
  }
  return {
    roomId: room.roomId,
    hostSocketId: room.hostSocketId,
    sourceType: room.sourceType,
    sourceUrl: room.sourceUrl,
    currentTime: room.currentTime,
    isPlaying: room.isPlaying,
    updatedAt: room.updatedAt,
    members: membersObj
  };
}

/**
 * Get existing room or create a new one. Restores from DB if exists.
 */
function getOrCreateRoom(roomId, initialHostSocketId = null) {
  const normalizedId = roomId.toUpperCase();
  if (activeRooms.has(normalizedId)) {
    const room = activeRooms.get(normalizedId);
    if (!room.hostSocketId && initialHostSocketId) {
      room.hostSocketId = initialHostSocketId;
    }
    return room;
  }

  // Check DB backup
  const dbRow = getRoomStmt.get(normalizedId);
  const room = {
    roomId: normalizedId,
    hostSocketId: initialHostSocketId,
    sourceType: dbRow ? dbRow.source_type : 'none',
    sourceUrl: dbRow ? dbRow.source_url : null,
    currentTime: dbRow ? dbRow.current_time : 0,
    isPlaying: dbRow ? Boolean(dbRow.is_playing) : false,
    updatedAt: dbRow ? dbRow.updated_at : Date.now(),
    members: new Map() // socketId -> { displayName }
  };

  activeRooms.set(normalizedId, room);
  if (!dbRow) {
    persistRoom(room);
  }

  return room;
}

function getRoom(roomId) {
  return activeRooms.get(roomId.toUpperCase()) || null;
}

function addMember(roomId, socketId, displayName) {
  const room = getOrCreateRoom(roomId, socketId);
  room.members.set(socketId, { displayName });
  if (!room.hostSocketId) {
    room.hostSocketId = socketId;
  }
  return room;
}

function removeMember(roomId, socketId) {
  const room = getRoom(roomId);
  if (!room) return null;

  room.members.delete(socketId);

  // If host left and members remain, promote the next member to host
  if (room.hostSocketId === socketId) {
    const nextHostSocketId = room.members.keys().next().value || null;
    room.hostSocketId = nextHostSocketId;
  }

  // If empty, we still keep in memory for a while / persistent in DB
  return room;
}

function updateRoomSource(roomId, sourceType, sourceUrl) {
  const room = getRoom(roomId);
  if (!room) return null;
  room.sourceType = sourceType;
  room.sourceUrl = sourceUrl;
  room.currentTime = 0;
  room.isPlaying = false;
  room.updatedAt = Date.now();
  persistRoom(room);
  return room;
}

function updatePlayback(roomId, currentTime, isPlaying) {
  const room = getRoom(roomId);
  if (!room) return null;
  room.currentTime = currentTime;
  room.isPlaying = isPlaying;
  room.updatedAt = Date.now();
  persistRoom(room);
  return room;
}

module.exports = {
  getOrCreateRoom,
  getRoom,
  addMember,
  removeMember,
  updateRoomSource,
  updatePlayback,
  serializeRoomState,
  activeRooms
};
