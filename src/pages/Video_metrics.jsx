class VideoMetrics {
  constructor(socket, userId) {
    this.socket = socket;
    this.userId = userId;
    this.metrics = {
      network: {
        latency: null,
        jitter: null,
        packetLoss: 0,
        bandwidth: { upload: 0, download: 0 },
        bitrate: { video: 0, audio: 0 }
      },
      video: {
        frameRate: 0,
        resolution: { width: 0, height: 0 },
        freezes: { count: 0, duration: 0 },
        delay: 0
      },
      audio: {
        latency: 0,
        drops: { count: 0, duration: 0 },
        mos: 5 // Start with perfect score, adjust based on conditions
      }
    };
    
    this.lastStats = {};
    this.lastTimestamp = 0;
    this.interval = null;
    this.peerConnections = new Map();
  }

  // Add a peer connection to monitor
  addPeerConnection(peerId, pc) {
    this.peerConnections.set(peerId, pc);
  }

  // Remove a peer connection
  removePeerConnection(peerId) {
    this.peerConnections.delete(peerId);
  }

  // Start collecting metrics
  start(interval = 5000) {
    if (this.interval) return;
    
    this.interval = setInterval(() => {
      this.collectMetrics();
      this.sendMetrics();
    }, interval);
  }

  // Stop collecting metrics
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  // Collect metrics from peer connections
  async collectMetrics() {
    const now = Date.now();
    const statsPromises = [];
    const activeConnections = [];

    // Collect stats from all peer connections
    for (const [peerId, pc] of this.peerConnections.entries()) {
      try {
        statsPromises.push(pc.getStats().then(stats => {
          activeConnections.push({ peerId, stats });
        }));
      } catch (e) {
        console.error('Error getting stats for peer', peerId, e);
      }
    }

    await Promise.all(statsPromises);

    // Process stats
    let totalBytesSent = 0;
    let totalBytesReceived = 0;
    let totalPacketsLost = 0;
    let totalPackets = 0;
    let totalJitter = 0;
    let audioJitter = 0;
    let videoJitter = 0;
    let audioCount = 0;
    let videoCount = 0;

    activeConnections.forEach(({ peerId, stats }) => {
      stats.forEach(report => {
        const now = report.timestamp;
        const lastStats = this.lastStats[`${peerId}-${report.id}`];
        
        // Calculate bitrate
        if (lastStats && report.type === 'outbound-rtp') {
          const timeDiff = (now - lastStats.timestamp) / 1000; // in seconds
          const byteDiff = report.bytesSent - lastStats.bytesSent;
          const bitrate = (byteDiff * 8) / timeDiff / 1000; // kbps
          
          if (report.kind === 'video') {
            this.metrics.network.bitrate.video = Math.round(bitrate);
            this.metrics.video.frameRate = report.framesPerSecond || 0;
            
            // Check for video freezes (frameRate < 1fps)
            if (this.metrics.video.frameRate < 1) {
              this.metrics.video.freezes.count++;
              this.metrics.video.freezes.duration += timeDiff * 1000; // ms
            }
          } else if (report.kind === 'audio') {
            this.metrics.network.bitrate.audio = Math.round(bitrate);
          }
        }

        // Calculate jitter and packet loss
        if (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') {
          if (lastStats) {
            const timeDiff = (now - lastStats.timestamp) / 1000;
            const packetDiff = report.packetsSent - lastStats.packetsSent;
            const lostPackets = report.packetsLost - (lastStats.packetsLost || 0);
            
            totalPacketsLost += lostPackets;
            totalPackets += packetDiff;
            
            if (report.jitter) {
              if (report.kind === 'audio') {
                audioJitter += report.jitter;
                audioCount++;
              } else if (report.kind === 'video') {
                videoJitter += report.jitter;
                videoCount++;
              }
              totalJitter += report.jitter;
            }
          }
        }

        // Store current stats for next comparison
        this.lastStats[`${peerId}-${report.id}`] = {
          ...report,
          timestamp: now
        };
      });
    });

    // Calculate metrics
    if (totalPackets > 0) {
      this.metrics.network.packetLoss = (totalPacketsLost / totalPackets) * 100;
    }
    
    // Average jitter across all streams
    const totalStreams = audioCount + videoCount;
    if (totalStreams > 0) {
      this.metrics.network.jitter = Math.round((totalJitter / totalStreams) * 1000); // in ms
    }
    
    // Update MOS based on network conditions
    this.updateMOS();
    
    // Simulate latency (in a real app, you'd measure RTT)
    this.metrics.network.latency = Math.max(50, Math.min(1000, 
      Math.round(50 + Math.random() * 50 + 
      (this.metrics.network.packetLoss * 5) + 
      (this.metrics.network.jitter / 10))));
    
    // Update video delay (simulated based on network conditions)
    this.metrics.video.delay = Math.round(
      this.metrics.network.latency * 1.5 + 
      (this.metrics.network.packetLoss * 2) + 
      (this.metrics.network.jitter / 2)
    );
    
    // Update audio latency (slightly lower than video)
    this.metrics.audio.latency = Math.round(this.metrics.network.latency * 0.9);
    
    // Update timestamps
    this.lastTimestamp = now;
  }

  // Update Mean Opinion Score based on network conditions
  updateMOS() {
    let mos = 5.0; // Start with perfect score
    
    // Reduce MOS based on packet loss
    if (this.metrics.network.packetLoss > 5) {
      mos -= 1.5;
    } else if (this.metrics.network.packetLoss > 2) {
      mos -= 0.5;
    } else if (this.metrics.network.packetLoss > 0.5) {
      mos -= 0.2;
    }
    
    // Reduce MOS based on jitter
    if (this.metrics.network.jitter > 50) {
      mos -= 1.0;
    } else if (this.metrics.network.jitter > 20) {
      mos -= 0.5;
    } else if (this.metrics.network.jitter > 10) {
      mos -= 0.2;
    }
    
    // Reduce MOS based on latency
    if (this.metrics.network.latency > 300) {
      mos -= 1.0;
    } else if (this.metrics.network.latency > 200) {
      mos -= 0.5;
    } else if (this.metrics.network.latency > 100) {
      mos -= 0.2;
    }
    
    // Ensure MOS is between 1 and 5
    this.metrics.audio.mos = Math.max(1, Math.min(5, mos));
  }

  // Send metrics to the server
  sendMetrics() {
    if (!this.socket || !this.socket.connected) return;
    
    this.socket.emit('metrics-update', {
      userId: this.userId,
      ...this.metrics
    });
  }

  // Report a video freeze
  reportFreeze(durationMs) {
    this.metrics.video.freezes.count++;
    this.metrics.video.freezes.duration += durationMs;
  }

  // Report an audio drop
  reportAudioDrop(durationMs) {
    this.metrics.audio.drops.count++;
    this.metrics.audio.drops.duration += durationMs;
  }

  // Update resolution
  updateResolution(width, height) {
    this.metrics.video.resolution = { width, height };
  }
}

export default VideoMetrics;
