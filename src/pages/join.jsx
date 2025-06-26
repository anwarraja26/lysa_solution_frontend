import React, { useState } from 'react';
import styles from '../styles/join.module.css';
import { useNavigate } from 'react-router-dom';

export default function JoinModal({ onClose }) {
  const [meetingId, setMeetingId] = useState('');
  const [name, setName] = useState('');
  const [noAudio, setNoAudio] = useState(false);
  const [videoOff, setVideoOff] = useState(true);
  const navigate = useNavigate();

  const handleJoin = () => {
    if (!meetingId || !name) return alert('Fill all fields');
    navigate(`/video/${meetingId}?name=${encodeURIComponent(name)}&noAudio=${noAudio}&videoOff=${videoOff}`);
    onClose();
  };

  return (
    <div className={styles.backdrop}>
      <div className={styles.modal}>
        <h2>Join meeting</h2>
        <input
          type="text"
          placeholder="Meeting ID or link"
          value={meetingId}
          onChange={(e) => setMeetingId(e.target.value)}
        />
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className={styles.checkBoxGroup}>
          <label>
            <input type="checkbox" checked={noAudio} onChange={() => setNoAudio(!noAudio)} />
            Don't connect to audio
          </label>
        </div>

        <div className={styles.checkBoxGroup}>
          <label>
            <input type="checkbox" checked={videoOff} onChange={() => setVideoOff(!videoOff)} />
            Turn off my video
          </label>
        </div>

        <div className={styles.actions}>
          <button onClick={handleJoin}>Join</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
