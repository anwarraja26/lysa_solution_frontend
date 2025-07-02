import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from '../styles/meet.module.css';
import Join from './Join';

export default function Meet() {
  const navigate = useNavigate();
  const [showJoinModal, setShowJoinModal] = useState(false);

  const handleNewMeeting = () => navigate('/video');
  const handleJoin = () => setShowJoinModal(true);
  const handleSchedule = () => alert('Schedule feature will be available soon.');
  const handleShareScreen = () => alert('Share screen feature will be available soon.');

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <h2>Video Conferencing</h2>
      </div>

      <div className={styles.grid}>
        <div className={styles.button} onClick={handleNewMeeting}>
          <div className={`${styles.icon} ${styles.orange}`}>📹</div>
          <span>New Meeting</span>
        </div>
        <div className={styles.button} onClick={handleJoin}>
          <div className={`${styles.icon} ${styles.blue}`}>➕</div>
          <span>Join</span>
        </div>
        <div className={styles.button} onClick={handleSchedule}>
          <div className={`${styles.icon} ${styles.blue}`}>📅</div>
          <span>Schedule</span>
        </div>
        <div className={styles.button} onClick={handleShareScreen}>
          <div className={`${styles.icon} ${styles.blue}`}>⬆️</div>
          <span>Share Screen</span>
        </div>
      </div>

      {showJoinModal && <Join onClose={() => setShowJoinModal(false)} />}
    </div>
  );
}
