const { PassThrough } = require('stream');
const transcoder = require('./transcoder');
const roomStore = require('../rooms/roomStore');

const activeCaptureStreams = new Map();

function registerCaptureEvents(io, socket) {
  // Start tab capture stream
  socket.on('capture:start', ({ roomId, quality = 'normal' }, ack) => {
    const normalizedId = (roomId || socket.data.roomId || '').toUpperCase();
    const room = roomStore.getRoom(normalizedId);

    if (!room || room.hostSocketId !== socket.id) {
      if (typeof ack === 'function') ack({ error: 'Only the host can start tab capture' });
      return;
    }

    console.log(`[Capture] Starting live tab ingest for room ${normalizedId}`);

    // End any existing stream
    if (activeCaptureStreams.has(normalizedId)) {
      try {
        activeCaptureStreams.get(normalizedId).end();
      } catch (e) {}
      activeCaptureStreams.delete(normalizedId);
    }

    // Create a new PassThrough stream for ffmpeg stdin
    const passThrough = new PassThrough();
    activeCaptureStreams.set(normalizedId, passThrough);

    // Kick off HLS transcode using the PassThrough stream
    transcoder.startTranscode(normalizedId, passThrough, quality, io);

    // Update room source state to 'capture'
    roomStore.updateRoomSource(normalizedId, 'capture', null);

    io.to(normalizedId).emit('room:sourceChanged', {
      sourceType: 'capture',
      sourceUrl: null,
      currentTime: 0,
      isPlaying: false,
      updatedAt: Date.now()
    });

    if (typeof ack === 'function') ack({ success: true });
  });

  // Receive binary WebM chunks from host MediaRecorder
  socket.on('capture:chunk', ({ roomId, chunk }) => {
    const normalizedId = (roomId || socket.data.roomId || '').toUpperCase();
    const passThrough = activeCaptureStreams.get(normalizedId);

    if (passThrough && chunk) {
      try {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        passThrough.write(buffer);
      } catch (err) {
        console.error(`[Capture Error] Failed writing chunk to room ${normalizedId}:`, err);
      }
    }
  });

  // Stop tab capture stream
  const handleStopCapture = (roomId) => {
    const targetId = (roomId || socket.data.roomId || '').toUpperCase();
    if (activeCaptureStreams.has(targetId)) {
      console.log(`[Capture] Stopping live tab ingest for room ${targetId}`);
      try {
        const passThrough = activeCaptureStreams.get(targetId);
        passThrough.end();
      } catch (e) {}
      activeCaptureStreams.delete(targetId);
    }
    transcoder.stopTranscode(targetId);
  };

  socket.on('capture:stop', ({ roomId }) => {
    handleStopCapture(roomId);
  });

  socket.on('disconnect', () => {
    if (socket.data.roomId) {
      handleStopCapture(socket.data.roomId);
    }
  });
}

module.exports = registerCaptureEvents;
