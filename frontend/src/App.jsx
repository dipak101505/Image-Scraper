import { useState } from 'react';
import ScraperForm from './components/ScraperForm';
import StatusDashboard from './components/StatusDashboard';
import ImageGallery from './components/ImageGallery';
import './App.css';

export default function App() {
  const [taskId, setTaskId] = useState(null);
  const [taskUrl, setTaskUrl] = useState('');
  const [results, setResults] = useState([]);

  const handleTaskCreated = (id, url) => {
    setTaskId(id);
    setTaskUrl(url);
    setResults([]);
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-glow" />
        <h1>🖼️ Image Scraper</h1>
        <p className="subtitle">Submit a URL · Node.js scrapes it · Images appear here</p>
      </header>

      {/* Main */}
      <main className="container">
        <ScraperForm onTaskCreated={handleTaskCreated} />

        {taskId && (
          <StatusDashboard
            taskId={taskId}
            taskUrl={taskUrl}
            onResults={setResults}
          />
        )}

        <ImageGallery results={results} />
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Powered by Node.js · Express · Playwright</p>
      </footer>
    </div>
  );
}
