import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './video.module.css';
import io from 'socket.io-client';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import fullscreenIcon from '../../assets/fullscreen.png';
import fullscreenExitIcon from '../../assets/fullscreen-exit.png';
import VideoMetrics from '../../utils/videoMetrics';

// -----------------------------------------------------------------------------
// Helper utilities
// -----------------------------------------------------------------------------

/**
 * Check whether the current browser supports the WebRTC APIs we need.
 */
const isWebRTCSupported = () => {
  return !!(
    window.RTCPeerConnection &&
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
};



/**
 * Check whether the current browser supports screen‑sharing.
 */
const isScreenShareSupported = () => {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getDisplayMedia
  );
};

/**
 * Format time in HH:MM:SS format
 */
const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// -----------------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------------

const Video = () => {
  // -----------------------------------------
  // Refs / state
  // -----------------------------------------
  const localVideoCardRef = useRef();
  const remoteVideoCardRef = useRef();
  const localVideo = useRef();
  const socketRef = useRef();
  const localStreamRef = useRef();
  const screenStreamRef = useRef();
  const peerConnectionsRef = useRef({});
  const remoteVideosRef = useRef({});
  const timerRef = useRef(null);
  const metricsRef = useRef(null);
  const metricsIntervalRef = useRef(null);

  const { meetingId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // IDs / names ---------------------------------------------------------------
  const userName = searchParams.get('name') || 'You';
  const [noAudio] = useState(searchParams.get('noAudio') === 'true');
  const [videoOff] = useState(searchParams.get('videoOff') === 'true');
  const roomId = meetingId || Math.random().toString(36).substring(2, 15);

  // UI state ------------------------------------------------------------------
  const [compatibilityError, setCompatibilityError] = useState('');
  const [localFullscreen, setLocalFullscreen] = useState(false);
  const [remoteFullscreen, setRemoteFullscreen] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showLeaveDropdown, setShowLeaveDropdown] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [currentMetrics, setCurrentMetrics] = useState(null);

  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [remoteVideoStates, setRemoteVideoStates] = useState({});
  const [participants, setParticipants] = useState([]);
  const [micOn, setMicOn] = useState(!noAudio);
  const [camOn, setCamOn] = useState(!videoOff);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [isInitiator, setIsInitiator] = useState(false);

  // Timer state ---------------------------------------------------------------
  const [timeRemaining, setTimeRemaining] = useState(3600); // 1 hour in seconds
  const [timerActive, setTimerActive] = useState(false);
  const [fired15MinAlert, setFired15MinAlert] = useState(false);

  // ---------------------------------------------------------------------------
  // Timer effect
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (timerActive && timeRemaining > 0) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          // Alert at 15 minutes left (900 seconds), only once
          if (prev === 900 && !fired15MinAlert) {
            alert('15 minutes remaining in the meeting.');
            setFired15MinAlert(true);
          }
          if (prev <= 1) {
            // Timer expired
            setTimerActive(false);
            alert('Meeting time limit reached (1 hour). The meeting will end now.');
            leaveCall();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [timerActive, timeRemaining, fired15MinAlert]); 

  // Start timer when meeting starts
  useEffect(() => {
    if (joined && !timerActive) {
      setTimerActive(true);
    }
  }, [joined, timerActive]);

  // ---------------------------------------------------------------------------
  // Full‑screen helpers
  // ---------------------------------------------------------------------------
  const exitAnyFullscreen = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (_) {
        /* No‑op */
      }
    }
  };

  const handleFullscreen = (which, userId = null) => {
    const elem =
      which === 'local'
        ? localVideoCardRef.current
        : userId
        ? remoteVideosRef.current[userId]?.parentElement
        : remoteVideoCardRef.current;

    if (!elem) return;

    if (!document.fullscreenElement) {
      elem.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const updateFullscreen = () => {
      const fsElem = document.fullscreenElement;
      setLocalFullscreen(fsElem === localVideoCardRef.current);
      setRemoteFullscreen(
        !!fsElem && fsElem !== localVideoCardRef.current && fsElem !== null
      );
    };

    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  // Initialize metrics collection
  const initMetrics = useCallback(() => {
    if (!socketRef.current) return;
    
    // Generate a unique ID for this user if not exists
    const userId = localStorage.getItem('userId') || `user-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('userId', userId);
    
    // Initialize metrics collector
    metricsRef.current = new VideoMetrics(socketRef.current, userId);
    
    // Start metrics collection
    metricsRef.current.start(5000); // Collect metrics every 5 seconds
    
    // Periodically update metrics state for UI
    metricsIntervalRef.current = setInterval(() => {
      if (metricsRef.current) {
        setCurrentMetrics({
          ...metricsRef.current.metrics,
          timestamp: new Date().toISOString()
        });
      }
    }, 2000);
    
    return () => {
      if (metricsIntervalRef.current) {
        clearInterval(metricsIntervalRef.current);
      }
      if (metricsRef.current) {
        metricsRef.current.stop();
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Boot‑strap socket connection + global error handlers
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isWebRTCSupported()) {
      setCompatibilityError(
        'Your browser does not support WebRTC. Please use a modern browser like Chrome or Firefox.'
      );
      setStatus('WebRTC not supported');
      return;
    }
    if (!isScreenShareSupported()) {
      setCompatibilityError('Screen sharing is not supported in your browser.');
    }

    socketRef.current = io('http://localhost:5001');
    // socketRef.current = io('https://lysasolution-backend.onrender.com');
    
    // Initialize metrics when socket is ready
    initMetrics();

    socketRef.current.on('connect', () => setStatus('Connected to server'));
    socketRef.current.on('disconnect', () => setStatus('Disconnected from server'));
    socketRef.current.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setStatus('Failed to connect to server');
      alert('Failed to connect to server. Please check your network connection.');
    });

    // Global promise‑rejection guard — helps reveal silent errors
    const globalRejectionHandler = (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      setStatus('An unexpected error occurred.');
      alert('An unexpected error occurred. Please try again.');
    };
    window.addEventListener('unhandledrejection', globalRejectionHandler);

    return () => {
      socketRef.current.disconnect();
      window.removeEventListener('unhandledrejection', globalRejectionHandler);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Room / signalling event listeners that depend on socket
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!socketRef.current) return;

    // • Room roster / meta -----------------------------------------------------
    socketRef.current.on('user-joined', ({ users, isInitiator: initiator }) => {
      setIsInitiator(initiator);
      setParticipants(users);
      // Initialize video states for all users (including self)
      const newVideoStates = {};
      users.forEach(user => {
        newVideoStates[user.id] = { video: user.video !== undefined ? user.video : true };
      });
      setRemoteVideoStates(newVideoStates);
      setStatus(
        users.length > 1
          ? `${users.length} participants in meeting`
          : 'Waiting for participants...'
      );
    });

    // • WebRTC signalling ------------------------------------------------------
    socketRef.current.on('user-ready', ({ userId, userName: newUserName }) => {
      if (userId !== socketRef.current.id) {
        createPeerConnection(userId, newUserName, true);
      }
    });

    socketRef.current.on('offer', async ({ sdp, fromUserId, userName: senderName }) => {
      if (!peerConnectionsRef.current[fromUserId]) {
        createPeerConnection(fromUserId, senderName, false);
      }

      const pc = peerConnectionsRef.current[fromUserId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socketRef.current.emit('answer', {
            sdp: answer,
            toUserId: fromUserId,
            fromUserId: socketRef.current.id,
            roomId,
            userName,
          });
        } catch (err) {
          console.error('Error handling offer:', err);
          setStatus('WebRTC negotiation failed');
        }
      }
    });

    socketRef.current.on('answer', async ({ sdp, fromUserId }) => {
      const pc = peerConnectionsRef.current[fromUserId];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch (err) {
          console.error('Error handling answer:', err);
          setStatus('WebRTC negotiation failed');
        }
      }
    });

    socketRef.current.on('ice-candidate', async ({ candidate, fromUserId }) => {
      const pc = peerConnectionsRef.current[fromUserId];
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    // • Peer left --------------------------------------------------------------
    socketRef.current.on('user-left', ({ userId, userName: leftUserName }) => {
      console.log('User left:', userId, leftUserName);

      if (peerConnectionsRef.current[userId]) {
        peerConnectionsRef.current[userId].close();
        delete peerConnectionsRef.current[userId];
      }

      setRemoteStreams((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });

      setParticipants((prev) => prev.filter((p) => p.id !== userId));
      setStatus('A participant left the meeting');
    });

    // • Room limits ------------------------------------------------------------
    socketRef.current.on('room-full', () => {
      alert('Room is full. Maximum participants reached.');
      setStatus('Room full');
      navigate('/meet');
    });

    socketRef.current.on('room-not-found', () => {
      alert('Room not found or expired.');
      setStatus('Room not found');
      navigate('/meet');
    });

    return () => {
      socketRef.current.off('user-joined');
      socketRef.current.off('user-ready');
      socketRef.current.off('offer');
      socketRef.current.off('answer');
      socketRef.current.off('ice-candidate');
      socketRef.current.off('user-left');
      socketRef.current.off('room-full');
      socketRef.current.off('room-not-found');
    };
  }, [roomId, userName, navigate]);

  // ---------------------------------------------------------------------------
  // Listener for AV‑state + screen‑share toggles broadcast from peers
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!socketRef.current) return;

    const handleAudioToggle = ({ userId, enabled, userName }) => {
      console.log(`${userName} ${enabled ? 'enabled' : 'disabled'} audio`);
      // TODO: optional UI feedback (e.g., mute icon on remote card)
    };

    const handleVideoToggle = ({ userId, enabled, userName }) => {
      console.log(`${userName} ${enabled ? 'enabled' : 'disabled'} video`);
      // TODO: optional UI feedback
    };

    const handleScreenStart = ({ userId, userName }) => {
      console.log(`${userName} started screen sharing`);
    };
    const handleScreenStop = ({ userId, userName }) => {
      console.log(`${userName} stopped screen sharing`);
    };

    socketRef.current.on('audio-toggle', handleAudioToggle);
    socketRef.current.on('video-toggle', ({ userId, enabled, userName }) => {
      console.log(`${userName} ${enabled ? 'enabled' : 'disabled'} video`);
      setRemoteVideoStates(prev => ({
        ...prev,
        [userId]: { ...prev[userId], video: enabled }
      }));
      // Keep setCamOn for local video element only
      if (userId === socketRef.current.id) {
        setCamOn(enabled);
      }
    });
    socketRef.current.on('screen-share-start', handleScreenStart);
    socketRef.current.on('screen-share-stop', handleScreenStop);

    return () => {
      socketRef.current.off('audio-toggle', handleAudioToggle);
      socketRef.current.off('video-toggle', handleVideoToggle);
      socketRef.current.off('screen-share-start', handleScreenStart);
      socketRef.current.off('screen-share-stop', handleScreenStop);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Auto‑join when ready
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!joined && roomId && socketRef.current?.connected) joinCall();
  }, [roomId, joined, socketRef.current?.connected]);

  // ---------------------------------------------------------------------------
  // Peer‑connection factory
  // ---------------------------------------------------------------------------
  const createPeerConnection = (userId, remoteUserName, isInitiatorFlag) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    // ICE candidate callback ---------------------------------------------------
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          candidate: event.candidate,
          toUserId: userId,
          roomId,
        });
      }
    };

    // Track handler ------------------------------------------------------------
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      setRemoteStreams((prev) => ({
        ...prev,
        [userId]: { stream, userName: remoteUserName },
      }));

      if (remoteVideosRef.current[userId]) {
        remoteVideosRef.current[userId].srcObject = stream;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected') {
        setStatus('Connected to all participants');
      }
    };

    // Add local tracks ---------------------------------------------------------
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    peerConnectionsRef.current[userId] = pc;

    // Initiator => send offer --------------------------------------------------
    if (isInitiatorFlag) {
      setTimeout(async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socketRef.current.emit('offer', {
            sdp: offer,
            toUserId: userId,
            roomId,
            userName,
          });
        } catch (err) {
          console.error('Error creating offer:', err);
          setStatus('Failed to create offer');
        }
      }, 1000); // keep 1‑second delay for stability
    }

    return pc;
  };

  // ---------------------------------------------------------------------------
  // Join room + publish local stream
  // ---------------------------------------------------------------------------
  const joinCall = async () => {
    try {
      // Always request both audio and video, we'll handle the initial state with the toggle functions
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
      }

      // Set initial states based on URL params
      if (noAudio) {
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTracks[0].enabled = false;
          setMicOn(false);
        }
      }

      if (videoOff) {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          videoTracks[0].enabled = false;
          setCamOn(false);
        }
      }

      socketRef.current.emit('join', { roomId, userName, video: camOn });
      setJoined(true);

      setTimeout(() => {
        socketRef.current.emit('user-ready', { roomId, userName });
      }, 500);
    } catch (err) {
      console.error('Error accessing media:', err);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };

  // ---------------------------------------------------------------------------
  // Local controls (mic / cam / screenshare)
  // ---------------------------------------------------------------------------
  const toggleMic = async () => {
    try {
      if (!localStreamRef.current) return;
      
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length === 0) {
        // If no audio tracks exist, request them
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const newAudioTrack = stream.getAudioTracks()[0];
        localStreamRef.current.addTrack(newAudioTrack);
        setMicOn(true);
      } else {
        // Toggle existing audio track
        const enabled = !micOn;
        audioTracks.forEach(track => track.enabled = enabled);
        setMicOn(enabled);
      }
      
      socketRef.current.emit('audio-toggle', { roomId, enabled: !micOn, userName });
    } catch (err) {
      console.error('Error toggling microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const toggleCam = async () => {
    try {
      if (!localStreamRef.current) return;
      
      const videoTracks = localStreamRef.current.getVideoTracks();
      let enabled;
      if (videoTracks.length === 0) {
        // If no video tracks exist, request them
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = stream.getVideoTracks()[0];
        localStreamRef.current.addTrack(newVideoTrack);
        if (localVideo.current) {
          localVideo.current.srcObject = localStreamRef.current;
        }
        enabled = true;
        setCamOn(true);
      } else {
        // Toggle existing video track
        enabled = !camOn;
        videoTracks.forEach(track => track.enabled = enabled);
        setCamOn(enabled);
      }
      // Broadcast new camera state to all users
      socketRef.current.emit('video-toggle', { 
        enabled, 
        roomId,
        userName,
        userId: socketRef.current.id
      });
    } catch (err) {
      console.error('Error toggling camera:', err);
      alert('Could not access camera. Please check permissions.');
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenShareSupported()) {
      alert('Screen sharing is not supported in your browser.');
      return;
    }

    if (!sharingScreen) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrack.onended = stopScreenShare;

        Object.values(peerConnectionsRef.current).forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(screenTrack);
        });

        if (localVideo.current) localVideo.current.srcObject = screenStream;

        screenStreamRef.current = screenStream;
        setSharingScreen(true);

        socketRef.current.emit('screen-share-start', { roomId, userName });
      } catch (err) {
        console.error('Screen sharing failed:', err);
        alert('Screen sharing failed. Please try again.');
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());

    // Revert back to camera track
    Object.values(peerConnectionsRef.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (sender && cameraTrack) sender.replaceTrack(cameraTrack);
    });

    if (localVideo.current) localVideo.current.srcObject = localStreamRef.current;

    setSharingScreen(false);
    socketRef.current.emit('screen-share-stop', { roomId, userName });
  };

  // ---------------------------------------------------------------------------
  // Meeting control functions
  // ---------------------------------------------------------------------------
  const endMeetingForAll = async () => {
    // Notify all participants to leave
    socketRef.current.emit('end-meeting', { roomId });
    // Then leave the call normally
    await leaveCall();
  };

  // Handle when meeting is ended by host
  useEffect(() => {
    if (!socketRef.current) return;

    const handleMeetingEnded = () => {
      alert('The meeting has been ended by the host.');
      leaveCall();
    };

    socketRef.current.on('meeting-ended', handleMeetingEnded);
    return () => {
      socketRef.current.off('meeting-ended', handleMeetingEnded);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Leave / cleanup
  // ---------------------------------------------------------------------------
  const leaveCall = async (isEndingMeeting = false) => {
    await exitAnyFullscreen();

    // Stop timer
    setTimerActive(false);
    clearInterval(timerRef.current);

    // Close all peer connections
    Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
    peerConnectionsRef.current = {};

    // Stop all media tracks
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());

    setLocalStream(null);
    setRemoteStreams({});
    setParticipants([]);
    setJoined(false);

    if (!isEndingMeeting) {
      socketRef.current.emit('leave', { roomId, userName });
    }
    
    navigate('/meet');
  };

  const toggleParticipants = () => setShowParticipants((prev) => !prev);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const isSingleUser = Object.keys(remoteStreams).length === 0;
  const showSingleUserView = isSingleUser && !camOn;

  return (
    <div className={styles.container}>
      {compatibilityError && (
        <div className={styles.error}>{compatibilityError}</div>
      )}

      {!localFullscreen && !remoteFullscreen && (
        <>
          <div className={styles.meta}>
            <div className={styles.timerDisplay} style={{position:'static', boxShadow:'none', outline:'none', marginLeft:16}}>
              <div className={styles.timerIcon}></div>
              <div className={styles.timerText}>
                {formatTime(timeRemaining)}
              </div>
            </div>
            <div className={styles.metaInfo}>
              Room ID: {roomId} | User: {userName} | Participants: {participants.length}
            </div>
            <button className={styles.participantsBtn} onClick={toggleParticipants}>
              People ({participants.length})
            </button>
          </div>
          <h2 className={styles.statusText}>{status}</h2>
        </>
      )}

      {showParticipants && (
        <div className={styles.participantsPanel}>
          <div className={styles.participantsHeader}>
            <h3>Participants ({participants.length})</h3>
            <button onClick={toggleParticipants}>×</button>
          </div>
          <div className={styles.participantsList}>
            {participants.map((p) => (
              <div key={p.id} className={styles.participantItem}>
                <div className={styles.participantAvatar}>
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className={styles.participantInfo}>
                  <span className={styles.participantName}>
                    {p.name} {p.id === socketRef.current?.id && '(You)'}
                  </span>
                  <span className={styles.participantRole}>
                    {p.isInitiator ? 'Host' : 'Participant'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Video grid ------------------------------------------------------------*/}
      <div
        className={`${styles.videoGrid} ${
          localFullscreen ? styles.localFullscreenGrid : ''
        } ${remoteFullscreen ? styles.remoteFullscreenGrid : ''} ${
          showSingleUserView ? styles.singleUserView : ''
        }`}
      >
        {/* Local video card ------------------------------------------------------*/}
        <div
          className={`${styles.videoCard} ${
            localFullscreen ? styles.fullscreenMainVideo : ''
          } ${remoteFullscreen ? styles.fullscreenPipVideo : ''}`}
          ref={localVideoCardRef}
        >
          {/* Enhanced fullscreen button with better visibility */}
          <button
            className={styles.fullscreenBtn}
            onClick={() => handleFullscreen('local')}
            style={{
              position: 'absolute',
              right: '12px',
              top: '12px',
              background: 'rgba(0, 0, 0, 0.7)',
              border: '2px solid rgba(255, 255, 255, 0.8)',
              borderRadius: '8px',
              padding: '8px',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 1000,
              backdropFilter: 'blur(10px)',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(0, 0, 0, 0.9)';
              e.target.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(0, 0, 0, 0.7)';
              e.target.style.transform = 'scale(1)';
            }}
          >
            <img
              src={localFullscreen ? fullscreenExitIcon : fullscreenIcon}
              alt="fullscreen"
              width={20}
              height={20}
              style={{
                filter: 'brightness(0) invert(1)',
                display: 'block',
              }}
            />
          </button>

          {/* Video element with fallback for when camera is off */}
          {showSingleUserView ? (
            <div className={styles.videoOffPlaceholder}>
              <div className={styles.userAvatar}>
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className={styles.userName}>{userName}</div>
              <div className={styles.cameraOffText}>Camera is off</div>
            </div>
          ) : (
            <>
              <video 
                ref={localVideo} 
                autoPlay 
                muted 
                playsInline 
                className={styles.video}
                style={{
                  display: camOn ? 'block' : 'none'
                }}
              />
              {!camOn && (
                <div style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  color: 'white',
                  fontSize: '48px',
                  backgroundColor: 'rgba(0, 0, 0, 0.7)',
                  padding: '20px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '80px',
                  height: '80px'
                }}>
                </div>
              )}
            </>
          )}

          <div className={styles.label}>
            {userName} (You) {sharingScreen && ''}
          </div>
          <div className={styles.videoControls}>
            <span className={styles.audioIndicator}>{micOn ? '' : ''}</span>
            <span className={styles.videoIndicator}>{camOn ? '' : ''}</span>
          </div>

          {/* Fullscreen local controls */}
          {localFullscreen && (
            <div className={styles.fullscreenLocalControls}>
              <button onClick={toggleMic} className={micOn ? styles.on : styles.off}>
                {micOn ? 'Mute' : 'Unmute'}
              </button>
              <button onClick={toggleCam} className={camOn ? styles.on : styles.off}>
                {camOn ? 'Stop Video' : 'Start Video'}
              </button>
              <button onClick={toggleScreenShare} className={styles.on}>
                {sharingScreen ? 'Stop Sharing' : 'Share Screen'}
              </button>
            </div>
          )}
        </div>

        {/* Remote video cards ----------------------------------------------------*/}
        {Object.entries(remoteStreams).map(([userId, { stream, userName: remoteName }]) => (
          <div
            key={userId}
            className={`${styles.videoCard} ${
              remoteFullscreen ? styles.fullscreenMainVideo : ''
            } ${localFullscreen ? styles.fullscreenPipVideo : ''}`}
            ref={remoteVideoCardRef}
          >
            {/* Enhanced fullscreen button for remote videos */}
            <button
              className={styles.fullscreenBtn}
              onClick={() => handleFullscreen('remote', userId)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '12px',
                background: 'rgba(0, 0, 0, 0.7)',
                border: '2px solid rgba(255, 255, 255, 0.8)',
                borderRadius: '8px',
                padding: '8px',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 1000,
                backdropFilter: 'blur(10px)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(0, 0, 0, 0.9)';
                e.target.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(0, 0, 0, 0.7)';
                e.target.style.transform = 'scale(1)';
              }}
            >
              <img
                src={remoteFullscreen ? fullscreenExitIcon : fullscreenIcon}
                alt="fullscreen"
                width={20}
                height={20}
                style={{
                  filter: 'brightness(0) invert(1)',
                  display: 'block',
                }}
              />
            </button>

            {remoteVideoStates[userId]?.video === false ? (
              <div className={styles.videoOffPlaceholder}>
                <div className={styles.userAvatar}>
                  {remoteName.charAt(0).toUpperCase()}
                </div>
                <div className={styles.userName}>{remoteName}</div>
                <div className={styles.cameraOffText}>Camera is off</div>
              </div>
            ) : (
              <>
                <video
                  ref={(el) => {
                    if (el) {
                      remoteVideosRef.current[userId] = el;
                      el.srcObject = stream;
                    }
                  }}
                  autoPlay
                  playsInline
                  className={styles.video}
                  style={{
                    display: remoteVideoStates[userId]?.video === false ? 'none' : 'block'
                  }}
                />
                {remoteVideoStates[userId]?.video === false && (
                  <div className={styles.videoOffPlaceholder}>
                    <div className={styles.userAvatar}>
                      {remoteName.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.userName}>{remoteName}</div>
                    <div className={styles.cameraOffText}>Camera is off</div>
                  </div>
                )}
              </>
            )}
            <div className={styles.label}>
              {remoteName} {sharingScreen && '(Sharing Screen)'}
            </div>

            {/* Fullscreen remote controls */}
            {remoteFullscreen && (
              <div className={styles.fullscreenRemoteControls}>
                <button onClick={toggleMic} className={micOn ? styles.on : styles.off}>
                  {micOn ? 'Mute' : 'Unmute'}
                </button>
                <button onClick={toggleCam} className={camOn ? styles.on : styles.off}>
                  {camOn ? 'Stop Video' : 'Start Video'}
                </button>
                <button onClick={toggleScreenShare} className={styles.on}>
                  {sharingScreen ? 'Stop Sharing' : 'Share Screen'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Bottom control bar ----------------------------------------------------*/}
      {!localFullscreen && !remoteFullscreen && (
        <div className={styles.controls}>
          <button onClick={toggleMic} className={micOn ? styles.on : styles.off}>
            {micOn ? 'Mute' : 'Unmute'}
          </button>
          <button onClick={toggleCam} className={camOn ? styles.on : styles.off}>
            {camOn ? 'Stop Video' : 'Start Video'}
          </button>
          <button onClick={toggleScreenShare} className={styles.on}>
            {sharingScreen ? 'Stop Sharing' : 'Share Screen'}
          </button>
          <button onClick={toggleParticipants} className={styles.participantsControlBtn}>
            People ({participants.length})
          </button>
          <button 
            onClick={() => setShowMetrics(!showMetrics)} 
            className={`${styles.metricsButton} ${showMetrics ? styles.active : ''}`}
          >
            Metrics
          </button>
          <div className={styles.leaveDropdown}>
            <button 
              onClick={() => setShowLeaveDropdown(!showLeaveDropdown)} 
              className={styles.leave}
            >
              Leave Call {showLeaveDropdown ? '▲' : '▼'}
            </button>
            {showLeaveDropdown && (
              <div className={styles.leaveDropdownContent}>
                <button onClick={() => {
                  leaveCall();
                  setShowLeaveDropdown(false);
                }}>
                  Leave Meeting
                </button>
                {isInitiator && (
                  <button 
                    onClick={() => {
                      endMeetingForAll();
                      setShowLeaveDropdown(false);
                    }}
                    className={styles.endMeetingBtn}
                  >
                    End Meeting for All
                  </button>
                )}
              </div>
            )}
          </div>
          
          {/* Metrics Panel */}
          {showMetrics && currentMetrics && (
            <div className={styles.metricsPanel}>
              <h4>Connection Metrics</h4>
              <div className={styles.metricsGrid}>
                <div className={styles.metricGroup}>
                  <h5>Network</h5>
                  <p>Latency: {currentMetrics.network.latency}ms</p>
                  <p>Jitter: {currentMetrics.network.jitter}ms</p>
                  <p>Packet Loss: {currentMetrics.network.packetLoss?.toFixed(2)}%</p>
                  <p>Bitrate: {currentMetrics.network.bitrate?.video || 0}kbps (video)</p>
                  <p>{currentMetrics.network.bitrate?.audio || 0}kbps (audio)</p>
                </div>
                <div className={styles.metricGroup}>
                  <h5>Video</h5>
                  <p>Resolution: {currentMetrics.video.resolution?.width}x{currentMetrics.video.resolution?.height}</p>
                  <p>Frame Rate: {currentMetrics.video.frameRate || 0}fps</p>
                  <p>Delay: {currentMetrics.video.delay}ms</p>
                  <p>Freezes: {currentMetrics.video.freezes?.count || 0} ({(currentMetrics.video.freezes?.duration / 1000 || 0).toFixed(1)}s)</p>
                </div>
                <div className={styles.metricGroup}>
                  <h5>Audio</h5>
                  <p>Latency: {currentMetrics.audio.latency}ms</p>
                  <p>Drops: {currentMetrics.audio.drops?.count || 0} ({(currentMetrics.audio.drops?.duration / 1000 || 0).toFixed(1)}s)</p>
                  <p>Quality: {currentMetrics.audio.mos?.toFixed(1) || 'N/A'}/5.0 MOS</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alt leave button when in fullscreen -----------------------------------*/}
      {(localFullscreen || remoteFullscreen) && (
        <div className={styles.leaveDropdown}>
          <button 
            onClick={() => setShowLeaveDropdown(!showLeaveDropdown)} 
            className={styles.fullscreenLeaveBtn}
          >
            Leave Call {showLeaveDropdown ? '▲' : '▼'}
          </button>
          {showLeaveDropdown && (
            <div className={styles.leaveDropdownContent} style={{position: 'absolute', bottom: '60px', left: '50%', transform: 'translateX(-50%)'}}>
              <button 
                onClick={() => {
                  leaveCall();
                  setShowLeaveDropdown(false);
                }}
                className={styles.leaveOption}
              >
                Leave Meeting
              </button>
              {isInitiator && (
                <button 
                  onClick={() => {
                    endMeetingForAll();
                    setShowLeaveDropdown(false);
                  }}
                  className={`${styles.leaveOption} ${styles.endMeetingBtn}`}
                >
                  End Meeting for All
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Video;