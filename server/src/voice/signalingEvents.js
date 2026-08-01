/**
 * Socket.io WebRTC signaling relay server for voice chat and live screen sharing.
 */
function registerSignalingEvents(io, socket) {
  // Client requests list of peers in room for WebRTC stream initialization
  socket.on('webrtc:join', ({ roomId, streamType = 'screen' }) => {
    const targetRoomId = (roomId || socket.data.roomId || '').toUpperCase();
    if (!targetRoomId) return;

    const channelName = `${targetRoomId}:${streamType}`;
    socket.join(channelName);

    const roomSockets = io.sockets.adapter.rooms.get(channelName);
    const existingPeers = [];

    if (roomSockets) {
      for (const id of roomSockets) {
        if (id !== socket.id) {
          existingPeers.push(id);
        }
      }
    }

    console.log(`[WebRTC Signaling] Socket ${socket.id} joined channel ${channelName}. Peers count: ${existingPeers.length}`);

    // Send list of existing peers to joining socket
    socket.emit('webrtc:peers', { peers: existingPeers, streamType });

    // Notify existing peers in room that a new peer joined
    socket.to(channelName).emit('webrtc:peerJoined', {
      peerId: socket.id,
      streamType
    });
  });

  // WebRTC Offer relay
  socket.on('webrtc:offer', ({ targetSocketId, sdp, streamType = 'screen' }) => {
    if (!targetSocketId) return;
    console.log(`[WebRTC Signaling] Relay OFFER from ${socket.id} to ${targetSocketId} (${streamType})`);
    io.to(targetSocketId).emit('webrtc:offer', {
      senderSocketId: socket.id,
      sdp,
      streamType
    });
  });

  // WebRTC Answer relay
  socket.on('webrtc:answer', ({ targetSocketId, sdp, streamType = 'screen' }) => {
    if (!targetSocketId) return;
    console.log(`[WebRTC Signaling] Relay ANSWER from ${socket.id} to ${targetSocketId} (${streamType})`);
    io.to(targetSocketId).emit('webrtc:answer', {
      senderSocketId: socket.id,
      sdp,
      streamType
    });
  });

  // WebRTC ICE Candidate relay
  socket.on('webrtc:ice', ({ targetSocketId, candidate, streamType = 'screen' }) => {
    if (!targetSocketId) return;
    io.to(targetSocketId).emit('webrtc:ice', {
      senderSocketId: socket.id,
      candidate,
      streamType
    });
  });

  // Leave signaling namespace
  socket.on('webrtc:leave', ({ roomId, streamType = 'screen' }) => {
    const targetRoomId = (roomId || socket.data.roomId || '').toUpperCase();
    const channelName = `${targetRoomId}:${streamType}`;
    socket.leave(channelName);
    socket.to(channelName).emit('webrtc:peerLeft', {
      senderSocketId: socket.id,
      streamType
    });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      socket.to(`${roomId}:screen`).emit('webrtc:peerLeft', { senderSocketId: socket.id, streamType: 'screen' });
      socket.to(`${roomId}:voice`).emit('webrtc:peerLeft', { senderSocketId: socket.id, streamType: 'voice' });
    }
  });
}

module.exports = registerSignalingEvents;
