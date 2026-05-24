import { useEffect, useState, useRef } from 'react';
import { API_BASE } from '../config';
import './StatusDashboard.css';

export default function StatusDashboard({ taskId, taskUrl, onResults }) {
  const [task, setTask] = useState(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!taskId) return;

    const poll = async () => {
      try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`);
        if (!response.ok) return;

        const parsed = await response.json();
        console.log('[DEBUG] Task poll result:', parsed);
        
        setTask(parsed);
        if (parsed.results?.length) onResults?.(parsed.results);

        if (parsed.status === 'COMPLETED' || parsed.status === 'FAILED') {
          clearInterval(intervalRef.current);
        }
      } catch (err) {
        console.error('Poll error', err);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 5000);
    return () => clearInterval(intervalRef.current);
  }, [taskId]);

  if (!task) return null;

  const badgeClass = task.status.toLowerCase();

  return (
    <section className="card status-card">
      <div className="status-header">
        <h2>Task Status</h2>
        <span className={`status-badge ${badgeClass}`}>{task.status}</span>
      </div>

      <div className="status-details">
        <div className="detail-row">
          <span className="detail-label">Task ID</span>
          <span className="detail-value mono">{task.id}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">URL</span>
          <span className="detail-value">{task.url}</span>
        </div>
        {task.error && <p className="error-text">Error: {task.error}</p>}
      </div>
    </section>
  );
}
