import { useState } from 'react';
import { API_BASE } from '../config';
import './ScraperForm.css';

export default function ScraperForm({ onTaskCreated }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) throw new Error('Failed to start scrape');

      const data = await response.json();
      setUrl('');
      onTaskCreated?.(data.taskId, url);
    } catch (err) {
      console.error('Failed to create task', err);
      alert('Unable to start scrape — check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card scraper-form-card">
      <h2>New Scrape</h2>
      <form onSubmit={handleSubmit} className="scraper-form">
        <input
          id="url-input"
          type="url"
          placeholder="https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          autoComplete="off"
        />
        <button type="submit" disabled={loading} id="submit-btn">
          {loading ? (
            <>
              <span className="btn-loader" />
              Submitting…
            </>
          ) : (
            'Start Scraping'
          )}
        </button>
      </form>
    </section>
  );
}
