function registerChatEvents(io, socket) {
  socket.on('chat:send', ({ roomId, text }, ack) => {
    const targetRoomId = (roomId || socket.data.roomId || '').toUpperCase();
    const displayName = socket.data.displayName || 'Anonymous';

    if (!targetRoomId || !text || !text.trim()) {
      if (typeof ack === 'function') ack({ error: 'Message text cannot be empty' });
      return;
    }

    const messagePayload = {
      id: `${socket.id}-${Date.now()}`,
      socketId: socket.id,
      displayName,
      text: text.trim(),
      ts: Date.now()
    };

    // Broadcast chat message to all members in the room (including sender)
    io.to(targetRoomId).emit('chat:message', messagePayload);

    if (typeof ack === 'function') ack({ success: true, message: messagePayload });
  });
}

module.exports = registerChatEvents;
