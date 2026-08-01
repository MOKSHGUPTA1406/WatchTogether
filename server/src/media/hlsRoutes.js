const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Serve HLS stream manifest & segments
router.get('/media/:roomId/:file', (req, res) => {
  const roomId = req.params.roomId.toUpperCase();
  const file = req.params.file;
  const filePath = path.join(__dirname, '../../tmp', roomId, file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  const ext = path.extname(file).toLowerCase();
  if (ext === '.m3u8') {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-cache');
  } else if (ext === '.ts') {
    res.setHeader('Content-Type', 'video/mp2t');
  }

  res.sendFile(filePath);
});

module.exports = router;
