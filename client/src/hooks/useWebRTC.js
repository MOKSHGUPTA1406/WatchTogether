import { useState, useEffect, useRef, useCallback } from 'react';
import { socket } from '../lib/socket';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

let globalAudioCtx = null;

function getGlobalAudioContext() {
  if (!globalAudioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      globalAudioCtx = new AudioContextClass();
    }
  }
  if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

function attachRemoteVoiceStream(targetSocketId, stream) {
  let audioElement = document.getElementById(`audio-peer-${targetSocketId}`);
  if (!audioElement) {
    audioElement = document.createElement('audio');
    audioElement.id = `audio-peer-${targetSocketId}`;
    audioElement.autoplay = true;
    audioElement.playsInline = true;
    audioElement.style.display = 'none';
    document.body.appendChild(audioElement);
  }
  audioElement.srcObject = stream;
  audioElement.play().catch((err) => {
    console.warn('[Voice Autoplay HTML5 Blocked, trying AudioContext]', err);
  });

  try {
    const ctx = getGlobalAudioContext();
    if (ctx) {
      const source = ctx.createMediaStreamSource(stream);
      source.connect(ctx.destination);
      console.log(`[WebRTC Voice] AudioContext stream connected for peer ${targetSocketId}`);
    }
  } catch (e) {
    console.warn('[AudioContext connect error]', e);
  }
}


export function useWebRTC(roomId, socketId, roomState = null) {
  // Screen Share WebRTC State
  const [localScreenStream, setLocalScreenStream] = useState(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState(null);

  // Voice Chat WebRTC State
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [inVoiceMembers, setInVoiceMembers] = useState([]);

  // Peer Connection Refs: Map<targetSocketId, RTCPeerConnection>
  const screenPeersRef = useRef(new Map());
  const voicePeersRef = useRef(new Map());

  // ICE Candidate Queues for candidates arriving before setRemoteDescription completes
  const iceQueuesRef = useRef(new Map()); // key: `${streamType}:${targetSocketId}`, value: Array<candidate>

  const localVoiceStreamRef = useRef(null);
  const localScreenStreamRef = useRef(null);

  // Flush queued ICE candidates after setRemoteDescription
  const flushIceCandidates = useCallback(async (targetSocketId, streamType, pc) => {
    const queueKey = `${streamType}:${targetSocketId}`;
    const queue = iceQueuesRef.current.get(queueKey);
    if (queue && queue.length > 0) {
      console.log(`[WebRTC ICE] Flushing ${queue.length} queued candidates for ${queueKey}`);
      for (const candidate of queue) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn(`[WebRTC ICE Flush Warning]`, e);
        }
      }
      iceQueuesRef.current.delete(queueKey);
    }
  }, []);

  // Helper: Create RTCPeerConnection
  const createPeerConnection = useCallback((targetSocketId, streamType, localStream = null) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peersMap = streamType === 'screen' ? screenPeersRef.current : voicePeersRef.current;
    peersMap.set(targetSocketId, pc);

    // Add local tracks if available
    if (localStream) {
      localStream.getTracks().forEach((track) => {
        pc.addTrack(track, localStream);
      });
    }

    // Send ICE candidates to target peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('webrtc:ice', {
          roomId,
          targetSocketId,
          candidate: event.candidate,
          streamType
        });
      }
    };

    // Receive remote media tracks
    pc.ontrack = (event) => {
      console.log(`[WebRTC Track Received] Type: ${streamType}, Track kind: ${event.track.kind}`);
      if (streamType === 'screen') {
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
        setRemoteScreenStream(stream);
      } else if (streamType === 'voice') {
        const stream = (event.streams && event.streams[0]) ? event.streams[0] : new MediaStream([event.track]);
        attachRemoteVoiceStream(targetSocketId, stream);
      }


    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC PC Connection State] ${streamType} -> ${targetSocketId}: ${pc.connectionState}`);
    };

    return pc;
  }, [roomId]);

  // Initiate an offer to a specific target peer
  const initiateOffer = useCallback(async (targetSocketId, streamType, localStream) => {
    const peersMap = streamType === 'screen' ? screenPeersRef.current : voicePeersRef.current;
    let pc = peersMap.get(targetSocketId);
    if (!pc) {
      pc = createPeerConnection(targetSocketId, streamType, localStream);
    }
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:offer', {
        roomId,
        targetSocketId,
        sdp: offer,
        streamType
      });
    } catch (err) {
      console.error(`[WebRTC Initiate Offer Error] ${streamType} to ${targetSocketId}:`, err);
    }
  }, [roomId, createPeerConnection]);

  // -------------------------------------------------------------
  // WebRTC Signaling Event Listeners
  // -------------------------------------------------------------
  useEffect(() => {
    if (!roomId) return;

    // Join screen and voice signaling groups on room mount
    socket.emit('webrtc:join', { roomId, streamType: 'screen' });
    socket.emit('webrtc:join', { roomId, streamType: 'voice' });


    // Handle existing peers when joining signaling channel
    const onPeers = async ({ peers, streamType }) => {
      console.log(`[WebRTC Peers] Channel ${streamType} peers:`, peers);
      const localStream = streamType === 'screen' ? localScreenStreamRef.current : localVoiceStreamRef.current;

      if (streamType === 'voice') {
        setInVoiceMembers(peers);
      }

      // If we have a local stream (e.g. Host sharing screen or active Voice user), initiate offers to all peers
      if (localStream) {
        for (const peerId of peers) {
          await initiateOffer(peerId, streamType, localStream);
        }
      }
    };

    // Handle new peer joining signaling channel
    const onPeerJoined = async ({ peerId, streamType }) => {
      console.log(`[WebRTC Peer Joined] ${peerId} joined ${streamType}`);
      const localStream = streamType === 'screen' ? localScreenStreamRef.current : localVoiceStreamRef.current;

      if (streamType === 'voice') {
        setInVoiceMembers((prev) => Array.from(new Set([...prev, peerId])));
      }

      // If we are sharing a stream (Host sharing tab screen or Voice user), initiate offer to newly joined peer
      if (localStream) {
        await initiateOffer(peerId, streamType, localStream);
      }
    };

    // Handle incoming WebRTC Offer
    const onOffer = async ({ senderSocketId, sdp, streamType }) => {
      console.log(`[WebRTC Offer Received] From ${senderSocketId} (${streamType})`);
      const peersMap = streamType === 'screen' ? screenPeersRef.current : voicePeersRef.current;
      const localStream = streamType === 'screen' ? localScreenStreamRef.current : localVoiceStreamRef.current;

      let pc = peersMap.get(senderSocketId);
      if (!pc) {
        pc = createPeerConnection(senderSocketId, streamType, localStream);
      }

      // Ignore offer if peer connection is already processing an offer/answer
      if (pc.signalingState !== 'stable') {
        console.warn(`[WebRTC Offer Ignored] Connection to ${senderSocketId} is in state: ${pc.signalingState}`);
        return;
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        // Flush any ICE candidates that arrived before remote description was set
        await flushIceCandidates(senderSocketId, streamType, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('webrtc:answer', {
          roomId,
          targetSocketId: senderSocketId,
          sdp: answer,
          streamType
        });
      } catch (err) {
        console.error(`[WebRTC Answer Generation Error] From ${senderSocketId}:`, err);
      }
    };

    // Handle incoming WebRTC Answer
    const onAnswer = async ({ senderSocketId, sdp, streamType }) => {
      console.log(`[WebRTC Answer Received] From ${senderSocketId} (${streamType})`);
      const peersMap = streamType === 'screen' ? screenPeersRef.current : voicePeersRef.current;
      const pc = peersMap.get(senderSocketId);

      // Only set remote description if connection is expecting an answer (have-local-offer)
      if (pc && pc.signalingState === 'have-local-offer') {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          await flushIceCandidates(senderSocketId, streamType, pc);
        } catch (err) {
          console.error(`[WebRTC SetRemote Description Error] From ${senderSocketId}:`, err);
        }
      } else if (pc) {
        console.warn(`[WebRTC Answer Ignored] Connection state is ${pc.signalingState}, expected have-local-offer`);
      }
    };


    // Handle incoming ICE Candidates
    const onIce = async ({ senderSocketId, candidate, streamType }) => {
      const peersMap = streamType === 'screen' ? screenPeersRef.current : voicePeersRef.current;
      const pc = peersMap.get(senderSocketId);

      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.warn(`[WebRTC AddICE Error] From ${senderSocketId}:`, err);
        }
      } else {
        // Queue candidate until remote description is set
        const queueKey = `${streamType}:${senderSocketId}`;
        if (!iceQueuesRef.current.has(queueKey)) {
          iceQueuesRef.current.set(queueKey, []);
        }
        iceQueuesRef.current.get(queueKey).push(candidate);
      }
    };

    // Handle peer left signaling channel
    const onPeerLeft = ({ senderSocketId, streamType }) => {
      console.log(`[WebRTC Peer Left] ${senderSocketId} (${streamType})`);
      const peersMap = streamType === 'screen' ? screenPeersRef.current : voicePeersRef.current;
      const pc = peersMap.get(senderSocketId);
      if (pc) {
        pc.close();
        peersMap.delete(senderSocketId);
      }

      if (streamType === 'screen') {
        setRemoteScreenStream(null);
      } else if (streamType === 'voice') {
        setInVoiceMembers((prev) => prev.filter((id) => id !== senderSocketId));
        const audioElement = document.getElementById(`audio-peer-${senderSocketId}`);
        if (audioElement) audioElement.remove();
      }
    };

    socket.on('webrtc:peers', onPeers);
    socket.on('webrtc:peerJoined', onPeerJoined);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice', onIce);
    socket.on('webrtc:peerLeft', onPeerLeft);

    return () => {
      socket.off('webrtc:peers', onPeers);
      socket.off('webrtc:peerJoined', onPeerJoined);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice', onIce);
      socket.off('webrtc:peerLeft', onPeerLeft);
    };
  }, [roomId, createPeerConnection, initiateOffer, flushIceCandidates]);

  // Re-join screen signaling when room source becomes capture
  useEffect(() => {
    if (roomState?.sourceType === 'capture') {
      console.log(`[WebRTC Screen Re-join] Room source is capture. Joining screen channel...`);
      socket.emit('webrtc:join', { roomId, streamType: 'screen' });
    }
  }, [roomId, roomState?.sourceType]);

  // -------------------------------------------------------------
  // Screen Sharing WebRTC Mesh Controls
  // -------------------------------------------------------------
  const startScreenShareMesh = useCallback(async (stream) => {
    localScreenStreamRef.current = stream;
    setLocalScreenStream(stream);

    // Request active peers in screen channel to initiate offers
    socket.emit('webrtc:join', { roomId, streamType: 'screen' });
  }, [roomId]);

  const stopScreenShareMesh = useCallback(() => {
    if (localScreenStreamRef.current) {
      localScreenStreamRef.current.getTracks().forEach((track) => track.stop());
      localScreenStreamRef.current = null;
    }
    setLocalScreenStream(null);
    screenPeersRef.current.forEach((pc) => pc.close());
    screenPeersRef.current.clear();
    setRemoteScreenStream(null);
    socket.emit('webrtc:leave', { roomId, streamType: 'screen' });
  }, [roomId]);

  // -------------------------------------------------------------
  // Voice Chat Controls
  // -------------------------------------------------------------
  const joinVoice = useCallback(async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localVoiceStreamRef.current = audioStream;
      setIsVoiceConnected(true);
      setIsMuted(false);

      // Attach local mic tracks to any existing voice peer connections & renegotiate
      for (const [peerId, pc] of voicePeersRef.current.entries()) {
        audioStream.getAudioTracks().forEach((track) => {
          pc.addTrack(track, audioStream);
        });
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('webrtc:offer', {
            roomId,
            targetSocketId: peerId,
            sdp: offer,
            streamType: 'voice'
          });
        } catch (e) {
          console.warn('[Voice Offer Error]', e);
        }
      }

      // Unlock Web Audio API context under user gesture
      getGlobalAudioContext();

      // Resume/play all remote audio elements under user gesture context
      document.querySelectorAll('audio[id^="audio-peer-"]').forEach((el) => {
        el.play().catch((err) => console.warn('[Audio Play Error]', err));
      });


      socket.emit('webrtc:join', { roomId, streamType: 'voice' });
    } catch (err) {
      console.error('[Voice Error] Failed to access microphone:', err);
    }
  }, [roomId]);


  const leaveVoice = useCallback(() => {
    if (localVoiceStreamRef.current) {
      localVoiceStreamRef.current.getTracks().forEach((track) => track.stop());
      localVoiceStreamRef.current = null;
    }
    voicePeersRef.current.forEach((pc, peerId) => {
      pc.close();
      const audioElement = document.getElementById(`audio-peer-${peerId}`);
      if (audioElement) audioElement.remove();
    });
    voicePeersRef.current.clear();

    setIsVoiceConnected(false);
    socket.emit('webrtc:leave', { roomId, streamType: 'voice' });
  }, [roomId]);

  const toggleMute = useCallback(() => {
    if (localVoiceStreamRef.current) {
      const audioTrack = localVoiceStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  }, []);

  const toggleDeafen = useCallback(() => {
    setIsDeafened((prev) => {
      const next = !prev;
      document.querySelectorAll('audio[id^="audio-peer-"]').forEach((el) => {
        el.muted = next;
      });
      return next;
    });
  }, []);

  return {
    localScreenStream,
    remoteScreenStream,
    startScreenShareMesh,
    stopScreenShareMesh,
    isVoiceConnected,
    isMuted,
    isDeafened,
    inVoiceMembers,
    joinVoice,
    leaveVoice,
    toggleMute,
    toggleDeafen
  };
}
