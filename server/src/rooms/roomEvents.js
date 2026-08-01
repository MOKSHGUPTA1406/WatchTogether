const roomStore = require('./roomStore');
const reaper = require('./reaper');

function registerRoomEvents(io, socket) {
  // Join room
  socket.on('room:join', ({ roomId, displayName }, ack) => {
    if (!roomId || !displayName) {
      if (typeof ack === 'function') ack({ error: 'roomId and displayName are required' });
      return;
    }

    const normalizedId = roomId.toUpperCase().trim();
    const cleanName = displayName.trim();

    // Cancel room reaper cleanup if room was pending deletion
    reaper.cancelReap(normalizedId);


    socket.join(normalizedId);
    socket.data.roomId = normalizedId;
    socket.data.displayName = cleanName;

    const room = roomStore.addMember(normalizedId, socket.id, cleanName);
    const serializedState = roomStore.serializeRoomState(room);

    // Send initial room state to joining socket
    socket.emit('room:state', serializedState);

    // Notify other room members
    socket.to(normalizedId).emit('room:memberJoined', {
      socketId: socket.id,
      displayName: cleanName,
      members: serializedState.members,
      hostSocketId: room.hostSocketId
    });

    console.log(`[Socket] ${cleanName} (${socket.id}) joined room ${normalizedId}`);
    if (typeof ack === 'function') ack({ success: true, room: serializedState });
  });

  // Request sync
  socket.on('room:requestSync', ({ roomId }) => {
    const targetRoomId = roomId ? roomId.toUpperCase() : socket.data.roomId;
    if (!targetRoomId) return;

    const room = roomStore.getRoom(targetRoomId);
    if (room) {
      socket.emit('room:state', roomStore.serializeRoomState(room));
    }
  });

  // Change media source (Host only)
  socket.on('room:setSource', ({ roomId, sourceType, sourceUrl }, ack) => {
    const targetRoomId = (roomId || socket.data.roomId || '').toUpperCase();
    const room = roomStore.getRoom(targetRoomId);

    if (!room) {
      if (typeof ack === 'function') ack({ error: 'Room not found' });
      return;
    }

    // Enforce host-only authority
    if (room.hostSocketId !== socket.id) {
      console.warn(`[Host Enforcement] Rejected room:setSource from non-host ${socket.id} in ${targetRoomId}`);
      if (typeof ack === 'function') ack({ error: 'Only the host can set media source' });
      return;
    }

    const updatedRoom = roomStore.updateRoomSource(targetRoomId, sourceType, sourceUrl);
    const serializedState = roomStore.serializeRoomState(updatedRoom);

    io.to(targetRoomId).emit('room:sourceChanged', {
      sourceType: updatedRoom.sourceType,
      sourceUrl: updatedRoom.sourceUrl,
      currentTime: updatedRoom.currentTime,
      isPlaying: updatedRoom.isPlaying,
      updatedAt: updatedRoom.updatedAt
    });

    if (typeof ack === 'function') ack({ success: true });
  });

  // Playback control: Play (Host only)
  socket.on('room:play', ({ roomId, currentTime }, ack) => {
    const targetRoomId = (roomId || socket.data.roomId || '').toUpperCase();
    const room = roomStore.getRoom(targetRoomId);

    if (!room || room.hostSocketId !== socket.id) {
      if (typeof ack === 'function') ack({ error: 'Unauthorized or room not found' });
      return;
    }

    const updatedRoom = roomStore.updatePlayback(targetRoomId, currentTime, true);

    io.to(targetRoomId).emit('room:playbackChanged', {
      isPlaying: true,
      currentTime: updatedRoom.currentTime,
      updatedAt: updatedRoom.updatedAt
    });

    if (typeof ack === 'function') ack({ success: true });
  });

  // Playback control: Pause (Host only)
  socket.on('room:pause', ({ roomId, currentTime }, ack) => {
    const targetRoomId = (roomId || socket.data.roomId || '').toUpperCase();
    const room = roomStore.getRoom(targetRoomId);

    if (!room || room.hostSocketId !== socket.id) {
      if (typeof ack === 'function') ack({ error: 'Unauthorized or room not found' });
      return;
    }

    const updatedRoom = roomStore.updatePlayback(targetRoomId, currentTime, false);

    io.to(targetRoomId).emit('room:playbackChanged', {
      isPlaying: false,
      currentTime: updatedRoom.currentTime,
      updatedAt: updatedRoom.updatedAt
    });

    if (typeof ack === 'function') ack({ success: true });
  });

  // Playback control: Seek (Host only)
  socket.on('room:seek', ({ roomId, currentTime }, ack) => {
    const targetRoomId = (roomId || socket.data.roomId || '').toUpperCase();
    const room = roomStore.getRoom(targetRoomId);

    if (!room || room.hostSocketId !== socket.id) {
      if (typeof ack === 'function') ack({ error: 'Unauthorized or room not found' });
      return;
    }

    const updatedRoom = roomStore.updatePlayback(targetRoomId, currentTime, room.isPlaying);

    io.to(targetRoomId).emit('room:playbackChanged', {
      isPlaying: room.isPlaying,
      currentTime: updatedRoom.currentTime,
      updatedAt: updatedRoom.updatedAt
    });

    if (typeof ack === 'function') ack({ success: true });
  });

  // Socket disconnected or explicit room:leave
  const handleLeave = () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    const previousRoom = roomStore.getRoom(roomId);
    const wasHost = previousRoom && previousRoom.hostSocketId === socket.id;

    const room = roomStore.removeMember(roomId, socket.id);
    if (room) {
      const serializedState = roomStore.serializeRoomState(room);

      socket.to(roomId).emit('room:memberLeft', {
        socketId: socket.id,
        displayName: socket.data.displayName,
        members: serializedState.members,
        hostSocketId: room.hostSocketId
      });

      if (wasHost && room.hostSocketId) {
        io.to(roomId).emit('room:hostChanged', {
          newHostSocketId: room.hostSocketId
        });
        console.log(`[Host Reassigned] Room ${roomId} host changed to ${room.hostSocketId}`);
      }

      // If room is empty, schedule reaper cleanup timer
      if (room.members.size === 0) {
        reaper.scheduleReap(roomId);
      }
    }
  };


  socket.on('room:leave', handleLeave);
  socket.on('disconnect', handleLeave);
}

module.exports = registerRoomEvents;
