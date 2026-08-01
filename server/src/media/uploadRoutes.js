const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const transcoder = require('./transcoder');
const roomStore = require('../rooms/roomStore');

const router = express.Router();

// Multer storage config: saves to server/tmp/<roomId>/source.<ext>
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const roomId = (req.params.roomId || 'default').toUpperCase();
    const roomTmpDir = path.join(__dirname, '../../tmp', roomId);
    if (!fs.existsSync(roomTmpDir)) {
      fs.mkdirSync(roomTmpDir, { recursive: true });
    }
    cb(null, roomTmpDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `source${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2000 * 1024 * 1024 } // 2GB limit
});

// Upload endpoint
router.post('/api/rooms/:roomId/upload', upload.single('video'), (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const room = roomStore.getRoom(roomId);

  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const quality = req.body.quality || 'normal';
  const filePath = req.file.path;
  const io = req.app.get('io');

  console.log(`[Upload] Received file ${req.file.originalname} for room ${roomId}`);

  // Kick off HLS transcode as file streams to disk
  transcoder.startTranscode(roomId, filePath, quality, io);

  // Set transient processing state
  roomStore.updateRoomSource(roomId, 'file', null);

  if (io) {
    io.to(roomId).emit('room:sourceChanged', {
      sourceType: 'file',
      sourceUrl: null,
      currentTime: 0,
      isPlaying: false,
      updatedAt: Date.now()
    });
  }

  res.json({
    success: true,
    roomId,
    sourceType: 'file',
    status: 'transcoding'
  });
});

module.exports = router;

