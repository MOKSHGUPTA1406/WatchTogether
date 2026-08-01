import { useState, useEffect, useCallback, useMemo } from 'react';
import { socket } from '../lib/socket';

export function useRoomSocket(roomId, displayName) {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [roomState, setRoomState] = useState(null);
  const [members, setMembers] = useState({});
  const [chatLog, setChatLog] = useState([]);

  const isHost = useMemo(() => {
    return Boolean(socket.id && roomState && roomState.hostSocketId === socket.id);
  }, [socket.id, roomState?.hostSocketId]);

  useEffect(() => {
    if (!roomId || !displayName) return;

    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => {
      setIsConnected(true);
      socket.emit('room:join', { roomId, displayName }, (res) => {
        if (res?.error) {
          console.error('[Room Error]', res.error);
        }
      });
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    const onRoomState = (state) => {
      if (!state) return;
      setRoomState(state);
      setMembers(state.members || {});
    };

    const onMemberJoined = ({ socketId, displayName: name, members: updatedMembers, hostSocketId }) => {
      setMembers(updatedMembers || {});
      setRoomState((prev) => prev ? { ...prev, hostSocketId } : prev);
      setChatLog((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          isSystem: true,
          text: `${name} joined the watch party`,
          ts: Date.now()
        }
      ]);
    };

    const onMemberLeft = ({ socketId, displayName: name, members: updatedMembers, hostSocketId }) => {
      setMembers(updatedMembers || {});
      setRoomState((prev) => prev ? { ...prev, hostSocketId } : prev);
      setChatLog((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          isSystem: true,
          text: `${name || 'A user'} left the watch party`,
          ts: Date.now()
        }
      ]);
    };

    const onHostChanged = ({ newHostSocketId }) => {
      setRoomState((prev) => prev ? { ...prev, hostSocketId: newHostSocketId } : prev);
    };

    const onSourceChanged = (sourceData) => {
      setRoomState((prev) => prev ? { ...prev, ...sourceData } : prev);
    };

    const onPlaybackChanged = (playbackData) => {
      setRoomState((prev) => prev ? { ...prev, ...playbackData } : prev);
    };

    const onChatMessage = (msgPayload) => {
      setChatLog((prev) => [...prev, msgPayload]);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:state', onRoomState);
    socket.on('room:memberJoined', onMemberJoined);
    socket.on('room:memberLeft', onMemberLeft);
    socket.on('room:hostChanged', onHostChanged);
    socket.on('room:sourceChanged', onSourceChanged);
    socket.on('room:playbackChanged', onPlaybackChanged);
    socket.on('chat:message', onChatMessage);

    // If already connected, trigger join immediately
    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:state', onRoomState);
      socket.off('room:memberJoined', onMemberJoined);
      socket.off('room:memberLeft', onMemberLeft);
      socket.off('room:hostChanged', onHostChanged);
      socket.off('room:sourceChanged', onSourceChanged);
      socket.off('room:playbackChanged', onPlaybackChanged);
      socket.off('chat:message', onChatMessage);
      socket.emit('room:leave');
    };
  }, [roomId, displayName]);

  const sendChat = useCallback((text) => {
    if (!text || !text.trim()) return;
    socket.emit('chat:send', { roomId, text });
  }, [roomId]);

  const setSource = useCallback((sourceType, sourceUrl) => {
    socket.emit('room:setSource', { roomId, sourceType, sourceUrl });
  }, [roomId]);

  const play = useCallback((currentTime) => {
    socket.emit('room:play', { roomId, currentTime });
  }, [roomId]);

  const pause = useCallback((currentTime) => {
    socket.emit('room:pause', { roomId, currentTime });
  }, [roomId]);

  const seek = useCallback((currentTime) => {
    socket.emit('room:seek', { roomId, currentTime });
  }, [roomId]);

  const requestSync = useCallback(() => {
    socket.emit('room:requestSync', { roomId });
  }, [roomId]);

  return {
    socketId: socket.id,
    isConnected,
    isHost,
    roomState,
    members,
    chatLog,
    sendChat,
    setSource,
    play,
    pause,
    seek,
    requestSync
  };
}
