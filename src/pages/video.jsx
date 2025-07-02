// import React, { useEffect, useRef, useState } from 'react';
// import styles from '../styles/video.module.css';
// import io from 'socket.io-client';
// import { useParams, useSearchParams, useNavigate } from 'react-router-dom';

// const Video = () => {
//   const navigate = useNavigate();
//   const localVideo = useRef();
//   const remoteVideo = useRef();
//   const pcRef = useRef();
//   const socketRef = useRef();
//   const localStreamRef = useRef();

//   const { meetingId } = useParams();
//   const [searchParams] = useSearchParams();
//   const userName = searchParams.get('name') || 'You';
//   const [noAudio, setNoAudio] = useState(searchParams.get('noAudio') === 'true');
//   const [videoOff, setVideoOff] = useState(searchParams.get('videoOff') === 'true');
  
//   // Generate room ID if not provided (for new meetings)
//   const roomId = meetingId || Math.random().toString(36).substring(2, 15);

//   const [joined, setJoined] = useState(false);
//   const [localStream, setLocalStream] = useState(null);
//   const [remoteStream, setRemoteStream] = useState(null);
//   const [micOn, setMicOn] = useState(!noAudio);
//   const [camOn, setCamOn] = useState(!videoOff);
//   const [status, setStatus] = useState('Initializing...');
//   const [remoteName, setRemoteName] = useState('Waiting for peer...');
//   const [isInitiator, setIsInitiator] = useState(false);

//   // Initialize socket connection
//   useEffect(() => {
//     console.log('Initializing socket connection...');
//     // socketRef.current = io('http://localhost:5001');
//     socketRef.current = io('https://lysasolution-backend.onrender.com');
    
//     socketRef.current.on('connect', () => {
//       console.log('Socket connected:', socketRef.current.id);
//       setStatus('Connected to server');
//     });

//     socketRef.current.on('disconnect', () => {
//       console.log('Socket disconnected');
//       setStatus('Disconnected from server');
//     });

//     socketRef.current.on('connect_error', (error) => {
//       console.error('Socket connection error:', error);
//       setStatus('Failed to connect to server');
//     });

//     return () => {
//       if (socketRef.current) {
//         socketRef.current.disconnect();
//       }
//     };
//   }, []);

//   // Set up socket event listeners
//   useEffect(() => {
//     if (!socketRef.current) return;

//     socketRef.current.on('user-joined', ({ isInitiator: initiator, users }) => {
//       console.log('User joined event:', { initiator, users, currentUser: userName });
//       setIsInitiator(initiator);
      
//       if (users.length === 2) {
//         setStatus('Peer found, establishing connection...');
//         console.log('Two users in room, initiator:', initiator);
        
//         if (initiator) {
//           console.log('I am initiator, will create offer');
//           setTimeout(() => createOffer(), 1000); // Small delay to ensure both sides are ready
//         } else {
//           console.log('I am not initiator, waiting for offer');
//         }
//       } else if (users.length === 1) {
//         setStatus('Waiting for peer to join...');
//       }
//     });

//     socketRef.current.on('offer', async ({ sdp, name }) => {
//       console.log('Received offer from:', name);
//       setRemoteName(name);
//       setStatus('Received offer, creating answer...');
      
//       try {
//         if (!pcRef.current) {
//           console.error('No peer connection available');
//           return;
//         }

//         await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
//         const answer = await pcRef.current.createAnswer();
//         await pcRef.current.setLocalDescription(answer);
        
//         socketRef.current.emit('answer', { 
//           sdp: answer, 
//           roomId, 
//           name: userName 
//         });
        
//         console.log('Answer sent');
//       } catch (error) {
//         console.error('Error handling offer:', error);
//         setStatus('Error handling offer');
//       }
//     });

//     socketRef.current.on('answer', async ({ sdp, name }) => {
//       console.log('Received answer from:', name);
//       setRemoteName(name);
      
//       try {
//         if (!pcRef.current) {
//           console.error('No peer connection available');
//           return;
//         }

//         await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
//         setStatus('Connection established!');
//         console.log('Answer processed successfully');
//       } catch (error) {
//         console.error('Error handling answer:', error);
//         setStatus('Error handling answer');
//       }
//     });

//     socketRef.current.on('ice-candidate', async ({ candidate }) => {
//       console.log('Received ICE candidate');
      
//       try {
//         if (!pcRef.current) {
//           console.error('No peer connection available for ICE candidate');
//           return;
//         }

//         await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
//         console.log('ICE candidate added successfully');
//       } catch (error) {
//         console.error('Error adding ICE candidate:', error);
//       }
//     });

//     socketRef.current.on('user-left', ({ name }) => {
//       console.log('User left:', name);
//       setRemoteName('Waiting for peer...');
//       setRemoteStream(null);
//       setStatus('Peer disconnected');
//       if (remoteVideo.current) {
//         remoteVideo.current.srcObject = null;
//       }
//     });

//     socketRef.current.on('room-full', () => {
//       alert('Room is full. Maximum 2 participants allowed.');
//       navigate('/meet');
//     });

//     return () => {
//       if (socketRef.current) {
//         socketRef.current.off('user-joined');
//         socketRef.current.off('offer');
//         socketRef.current.off('answer');
//         socketRef.current.off('ice-candidate');
//         socketRef.current.off('user-left');
//         socketRef.current.off('room-full');
//       }
//     };
//   }, [roomId, userName, navigate]);

//   // Initialize media and join room
//   useEffect(() => {
//     if (!joined && roomId && socketRef.current?.connected) {
//       joinCall();
//     }
//   }, [roomId, joined, socketRef.current?.connected]);

//   const createPeerConnection = () => {
//     console.log('Creating peer connection...');
    
//     const configuration = {
//       iceServers: [
//         { urls: 'stun:stun.l.google.com:19302' },
//         { urls: 'stun:stun1.l.google.com:19302' }
//       ]
//     };

//     const pc = new RTCPeerConnection(configuration);

//     pc.onicecandidate = (event) => {
//       if (event.candidate) {
//         console.log('Sending ICE candidate');
//         socketRef.current?.emit('ice-candidate', { 
//           candidate: event.candidate, 
//           roomId 
//         });
//       } else {
//         console.log('ICE gathering completed');
//       }
//     };

//     pc.ontrack = (event) => {
//       console.log('Remote track received');
//       const [stream] = event.streams;
//       setRemoteStream(stream);
//       if (remoteVideo.current) {
//         remoteVideo.current.srcObject = stream;
//       }
//       setStatus('Connected - Video call active');
//     };

//     pc.onconnectionstatechange = () => {
//       console.log('Connection state changed:', pc.connectionState);
//       switch (pc.connectionState) {
//         case 'connected':
//           setStatus('Connected - Video call active');
//           break;
//         case 'disconnected':
//           setStatus('Connection lost');
//           break;
//         case 'failed':
//           setStatus('Connection failed');
//           break;
//         case 'closed':
//           setStatus('Connection closed');
//           break;
//       }
//     };

//     pc.onicegatheringstatechange = () => {
//       console.log('ICE gathering state:', pc.iceGatheringState);
//     };

//     return pc;
//   };

//   const createOffer = async () => {
//     try {
//       console.log('Creating offer...');
//       if (!pcRef.current) {
//         console.error('No peer connection available');
//         return;
//       }

//       const offer = await pcRef.current.createOffer({
//         offerToReceiveAudio: true,
//         offerToReceiveVideo: true
//       });
      
//       await pcRef.current.setLocalDescription(offer);
      
//       socketRef.current?.emit('offer', { 
//         sdp: offer, 
//         roomId, 
//         name: userName 
//       });
      
//       console.log('Offer created and sent');
//       setStatus('Offer sent, waiting for answer...');
//     } catch (error) {
//       console.error('Error creating offer:', error);
//       setStatus('Error creating offer');
//     }
//   };

//   const joinCall = async () => {
//     try {
//       console.log('Joining call...', { roomId, userName });
//       setStatus('Accessing camera and microphone...');

//       // Get user media
//       const constraints = {
//         video: !videoOff,
//         audio: !noAudio
//       };

//       const stream = await navigator.mediaDevices.getUserMedia(constraints);
//       console.log('Got user media:', stream.getTracks().map(t => t.kind));
      
//       setLocalStream(stream);
//       localStreamRef.current = stream;
      
//       if (localVideo.current) {
//         localVideo.current.srcObject = stream;
//       }

//       // Apply initial settings
//       stream.getAudioTracks().forEach(track => {
//         track.enabled = !noAudio;
//       });
//       stream.getVideoTracks().forEach(track => {
//         track.enabled = !videoOff;
//       });

//       // Create peer connection
//       pcRef.current = createPeerConnection();

//       // Add local stream to peer connection
//       stream.getTracks().forEach(track => {
//         console.log('Adding track to peer connection:', track.kind);
//         pcRef.current.addTrack(track, stream);
//       });

//       // Join the room
//       console.log('Emitting join event:', { roomId, userName });
//       socketRef.current?.emit('join', { roomId, name: userName });
      
//       setStatus('Joined room, waiting for peer...');
//       setJoined(true);

//     } catch (error) {
//       console.error('Error joining call:', error);
//       setStatus('Could not access camera/microphone');
//       alert('Could not access camera or microphone. Please check your permissions and try again.');
//     }
//   };

//   const toggleMic = () => {
//     if (!localStreamRef.current) return;
//     const enabled = !micOn;
//     localStreamRef.current.getAudioTracks().forEach(track => {
//       track.enabled = enabled;
//     });
//     setMicOn(enabled);
//   };

//   const toggleCam = () => {
//     if (!localStreamRef.current) return;
//     const enabled = !camOn;
//     localStreamRef.current.getVideoTracks().forEach(track => {
//       track.enabled = enabled;
//     });
//     setCamOn(enabled);
//   };

//   const leaveCall = () => {
//     console.log('Leaving call...');
    
//     // Cleanup peer connection
//     if (pcRef.current) {
//       pcRef.current.close();
//       pcRef.current = null;
//     }
    
//     // Cleanup local stream
//     if (localStreamRef.current) {
//       localStreamRef.current.getTracks().forEach(track => track.stop());
//       localStreamRef.current = null;
//     }
    
//     // Cleanup state
//     setLocalStream(null);
//     setRemoteStream(null);
//     setJoined(false);
//     setStatus('Call ended');
    
//     // Notify server
//     if (socketRef.current) {
//       socketRef.current.emit('leave', { roomId, name: userName });
//     }
    
//     navigate('/meet');
//   };

//   // Cleanup on unmount
//   useEffect(() => {
//     return () => {
//       if (pcRef.current) {
//         pcRef.current.close();
//       }
//       if (localStreamRef.current) {
//         localStreamRef.current.getTracks().forEach(track => track.stop());
//       }
//       if (socketRef.current) {
//         socketRef.current.disconnect();
//       }
//     };
//   }, []);

//   return (
//     <div className={styles.container}>
//       <div style={{ marginBottom: '10px', fontSize: '12px', color: '#666' }}>
//         Room ID: {roomId} | User: {userName} | Role: {isInitiator ? 'Initiator' : 'Receiver'}
//       </div>
//       <h2 className={styles.statusText}>{status}</h2>
      
//       <div className={styles.videoGrid}>
//         <div className={styles.videoCard}>
//           <video 
//             ref={localVideo} 
//             autoPlay 
//             muted 
//             playsInline 
//             className={styles.video}
//             style={{ backgroundColor: '#000' }}
//           />
//           <div className={styles.label}>{userName} (You)</div>
//         </div>
        
//         <div className={styles.videoCard}>
//           <video 
//             ref={remoteVideo} 
//             autoPlay 
//             playsInline 
//             className={styles.video}
//             style={{ backgroundColor: '#000' }}
//           />
//           <div className={styles.label}>{remoteName}</div>
//         </div>
//       </div>
      
//       <div className={styles.controls}>
//         <button 
//           onClick={toggleMic} 
//           className={micOn ? styles.on : styles.off}
//         >
//           {micOn ? '🎤' : '🎤'} {micOn ? 'Mute' : 'Unmute'}
//         </button>
//         <button 
//           onClick={toggleCam} 
//           className={camOn ? styles.on : styles.off}
//         >
//           {camOn ? '📹' : '📹'} {camOn ? 'Stop Video' : 'Start Video'}
//         </button>
//         <button onClick={leaveCall} className={styles.leave}>
//           🔴 Leave Call
//         </button>
//       </div>
//     </div>
//   );
// };

// export default Video;

import React, { useEffect, useRef, useState } from 'react';
import styles from '../styles/video.module.css';
import io from 'socket.io-client';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import fullscreenIcon from '../../assets/fullscreen.png';
import fullscreenExitIcon from '../../assets/fullscreen-exit.png';

// Browser compatibility check
const isWebRTCSupported = () => {
  return !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
};

const isScreenShareSupported = () => {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
};

const Video = () => {
  const exitAnyFullscreen = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (e) {}
    }
  };

  const [compatibilityError, setCompatibilityError] = useState('');
  const [localFullscreen, setLocalFullscreen] = useState(false);
  const [remoteFullscreen, setRemoteFullscreen] = useState(false);
  const localVideoCardRef = useRef();
  const remoteVideoCardRef = useRef();
  const navigate = useNavigate();
  const localVideo = useRef();
  const remoteVideo = useRef();
  const pcRef = useRef();
  const socketRef = useRef();
  const localStreamRef = useRef();
  const screenStreamRef = useRef();

  const { meetingId } = useParams();
  const [searchParams] = useSearchParams();
  const userName = searchParams.get('name') || 'You';
  const [noAudio] = useState(searchParams.get('noAudio') === 'true');
  const [videoOff] = useState(searchParams.get('videoOff') === 'true');
  const roomId = meetingId || Math.random().toString(36).substring(2, 15);

  const [joined, setJoined] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [micOn, setMicOn] = useState(!noAudio);
  const [camOn, setCamOn] = useState(!videoOff);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [remoteName, setRemoteName] = useState('Waiting for peer...');
  const [isInitiator, setIsInitiator] = useState(false);

  useEffect(() => {
    if (!isWebRTCSupported()) {
      setCompatibilityError('Your browser does not support WebRTC. Please use a modern browser like Chrome or Firefox.');
      setStatus('WebRTC not supported');
      return;
    }
    if (!isScreenShareSupported()) {
      setCompatibilityError('Screen sharing is not supported in your browser.');
    }

    // socketRef.current = io('http://localhost:5001');
    socketRef.current = io('https://lysasolution-backend.onrender.com');


    socketRef.current.on('connect', () => setStatus('Connected to server'));
    socketRef.current.on('disconnect', () => setStatus('Disconnected from server'));
    socketRef.current.on('connect_error', (error) => {
      console.error('Connection error:', error);
      setStatus('Failed to connect to server');
      alert('Failed to connect to server. Please check your network connection.');
    });

    window.addEventListener('unhandledrejection', (event) => {
      console.error('Unhandled promise rejection:', event.reason);
      setStatus('An unexpected error occurred.');
      alert('An unexpected error occurred. Please try again.');
    });

    return () => {
      socketRef.current.disconnect();
      window.removeEventListener('unhandledrejection', () => {});
    };
  }, []);

  useEffect(() => {
    if (!socketRef.current) return;

    socketRef.current.on('user-joined', ({ isInitiator: initiator, users }) => {
      setIsInitiator(initiator);
      if (users.length === 2 && initiator) {
        setTimeout(() => {
          try {
            createOffer();
          } catch (err) {
            setStatus('Failed to create offer');
            alert('Failed to start connection. Please try again.');
          }
        }, 1000);
      }
      setStatus(users.length === 2 ? 'Peer found, connecting...' : 'Waiting for peer...');
    });

    socketRef.current.on('offer', async ({ sdp, name }) => {
      setRemoteName(name);
      if (!pcRef.current) return;
      try {
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socketRef.current.emit('answer', { sdp: answer, roomId, name: userName });
      } catch (err) {
        setStatus('WebRTC negotiation failed');
        alert('Failed to negotiate video connection.');
      }
    });

    socketRef.current.on('answer', async ({ sdp, name }) => {
      setRemoteName(name);
      try {
        if (pcRef.current) await pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp));
        setStatus('Connected!');
      } catch (err) {
        setStatus('WebRTC negotiation failed');
        alert('Failed to finalize video connection.');
      }
    });

    socketRef.current.on('ice-candidate', async ({ candidate }) => {
      try {
        if (pcRef.current) await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        setStatus('ICE negotiation failed');
        alert('Network error: Could not establish peer connection.');
      }
    });

    socketRef.current.on('user-left', () => {
      setRemoteName('Waiting for peer...');
      setRemoteStream(null);
      setStatus('Peer disconnected');
      alert('The other user has left the call.');
    });

    socketRef.current.on('room-full', () => {
      alert('Room full. Only 2 people allowed.');
      setStatus('Room full');
      navigate('/meet');
    });

    socketRef.current.on('room-not-found', () => {
      alert('Room not found or expired.');
      setStatus('Room not found');
      navigate('/meet');
    });

    socketRef.current.on('duplicate-join', () => {
      alert('You are already in this room.');
      setStatus('Duplicate join');
      navigate('/meet');
    });

    return () => {
      socketRef.current.off('user-joined');
      socketRef.current.off('offer');
      socketRef.current.off('answer');
      socketRef.current.off('ice-candidate');
      socketRef.current.off('user-left');
      socketRef.current.off('room-full');
    };
  }, [roomId, userName, navigate]);

  useEffect(() => {
    if (!joined && roomId && socketRef.current?.connected) joinCall();
  }, [roomId, joined, socketRef.current?.connected]);

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', { candidate: event.candidate, roomId });
      }
    };

    pc.ontrack = (event) => {
      const [stream] = event.streams;
      setRemoteStream(stream);
      if (remoteVideo.current) remoteVideo.current.srcObject = stream;
      setStatus('Connected');
    };

    return pc;
  };

  const createOffer = async () => {
    if (!pcRef.current) return;
    const offer = await pcRef.current.createOffer();
    await pcRef.current.setLocalDescription(offer);
    socketRef.current.emit('offer', { sdp: offer, roomId, name: userName });
    setStatus('Offer sent, waiting...');
  };

  const joinCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;

      pcRef.current = createPeerConnection();
      stream.getTracks().forEach((track) => pcRef.current.addTrack(track, stream));

      socketRef.current.emit('join', { roomId, name: userName });
      setJoined(true);
    } catch (err) {
      console.error('Error accessing media:', err);
      alert('Could not access camera/mic.');
    }
  };

  const toggleMic = () => {
    const audioTracks = localStreamRef.current?.getAudioTracks();
    if (!audioTracks?.length) return alert('No mic available');
    const enabled = !micOn;
    audioTracks.forEach((track) => (track.enabled = enabled));
    setMicOn(enabled);
  };

  const toggleCam = () => {
    const videoTracks = localStreamRef.current?.getVideoTracks();
    if (!videoTracks?.length) return alert('No camera available');
    const enabled = !camOn;
    videoTracks.forEach((track) => (track.enabled = enabled));
    setCamOn(enabled);
  };

  const toggleScreenShare = async () => {
    if (!pcRef.current || !isScreenShareSupported()) return;

    if (!sharingScreen) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        screenTrack.onended = stopScreenShare;
        const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
        localVideo.current.srcObject = screenStream;
        screenStreamRef.current = screenStream;
        setSharingScreen(true);
      } catch (err) {
        alert('Screen sharing failed.');
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    if (sender && camTrack) sender.replaceTrack(camTrack);
    localVideo.current.srcObject = localStreamRef.current;
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    setSharingScreen(false);
  };

  const leaveCall = async () => {
    await exitAnyFullscreen();
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    setLocalStream(null);
    setRemoteStream(null);
    setJoined(false);
    socketRef.current.emit('leave', { roomId, name: userName });
    navigate('/meet');
  };

  const handleFullscreen = (which) => {
    const elem = which === 'local' ? localVideoCardRef.current : remoteVideoCardRef.current;
    if (!document.fullscreenElement) {
      elem?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  useEffect(() => {
    const updateFullscreen = () => {
      const fullscreenElement = document.fullscreenElement;
      setLocalFullscreen(fullscreenElement === localVideoCardRef.current);
      setRemoteFullscreen(fullscreenElement === remoteVideoCardRef.current);
    };
    document.addEventListener('fullscreenchange', updateFullscreen);
    return () => document.removeEventListener('fullscreenchange', updateFullscreen);
  }, []);

  return (
    <div className={styles.container}>
      {compatibilityError && <div className={styles.error}>{compatibilityError}</div>}
      {!localFullscreen && !remoteFullscreen && (
        <>
          <div className={styles.meta}>
            Room ID: {roomId} | User: {userName} | Role: {isInitiator ? 'Initiator' : 'Receiver'}
          </div>
          <h2 className={styles.statusText}>{status}</h2>
        </>
      )}

      <div className={`${styles.videoGrid} ${localFullscreen ? styles.localFullscreenGrid : ''} ${remoteFullscreen ? styles.remoteFullscreenGrid : ''}`}>
        {/* Local Video */}
        <div className={`${styles.videoCard} ${localFullscreen ? styles.fullscreenMainVideo : ''} ${remoteFullscreen ? styles.fullscreenPipVideo : ''}`} ref={localVideoCardRef} style={{ display: 'block' }}>
          <video ref={localVideo} autoPlay muted playsInline className={styles.video} />
          <div className={styles.label}>{userName} (You)</div>
          <button className={styles.fullscreenBtn} onClick={() => handleFullscreen('local')}>
            <img src={localFullscreen ? fullscreenExitIcon : fullscreenIcon} alt="fullscreen" width={26} height={26} />
          </button>
          {localFullscreen && (
            <div className={styles.fullscreenLocalControls}>
              <button onClick={toggleMic} className={micOn ? styles.on : styles.off}>{micOn ? 'Mute' : 'Unmute'}</button>
              <button onClick={toggleCam} className={camOn ? styles.on : styles.off}>{camOn ? 'Stop Video' : 'Start Video'}</button>
              <button onClick={toggleScreenShare} className={styles.on}>{sharingScreen ? 'Stop Sharing' : 'Share Screen'}</button>
            </div>
          )}
        </div>

        {/* Remote Video */}
        <div className={`${styles.videoCard} ${remoteFullscreen ? styles.fullscreenMainVideo : ''} ${localFullscreen ? styles.fullscreenPipVideo : ''}`} ref={remoteVideoCardRef} style={{ display: 'block' }}>
          <video ref={remoteVideo} autoPlay playsInline className={styles.video} />
          <div className={styles.label}>{remoteName}</div>
          <button className={styles.fullscreenBtn} onClick={() => handleFullscreen('remote')}>
            <img src={remoteFullscreen ? fullscreenExitIcon : fullscreenIcon} alt="fullscreen" width={26} height={26} />
          </button>
          {remoteFullscreen && (
            <div className={styles.fullscreenRemoteControls}>
              <button onClick={toggleMic} className={micOn ? styles.on : styles.off}>{micOn ? 'Mute' : 'Unmute'}</button>
              <button onClick={toggleCam} className={camOn ? styles.on : styles.off}>{camOn ? 'Stop Video' : 'Start Video'}</button>
              <button onClick={toggleScreenShare} className={styles.on}>{sharingScreen ? 'Stop Sharing' : 'Share Screen'}</button>
            </div>
          )}
        </div>
      </div>

      {!localFullscreen && !remoteFullscreen && (
        <div className={styles.controls}>
          <button onClick={toggleMic} className={micOn ? styles.on : styles.off}>{micOn ? 'Mute' : 'Unmute'}</button>
          <button onClick={toggleCam} className={camOn ? styles.on : styles.off}>{camOn ? 'Stop Video' : 'Start Video'}</button>
          <button onClick={toggleScreenShare} className={styles.on}>{sharingScreen ? 'Stop Sharing' : 'Share Screen'}</button>
          <button onClick={leaveCall} className={styles.leave}>Leave Call</button>
        </div>
      )}

      {(localFullscreen || remoteFullscreen) && (
        <button onClick={leaveCall} className={styles.fullscreenLeaveBtn}>Leave Call</button>
      )}
    </div>
  );
};

export default Video;
