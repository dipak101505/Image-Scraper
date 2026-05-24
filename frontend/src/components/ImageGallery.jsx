import { IMAGE_BASE } from '../config';
import './ImageGallery.css';

export default function ImageGallery({ results }) {
  if (!results || results.length === 0) return null;

  return (
    <section className="card gallery-card">
      <h2>Scraped Images</h2>
      <div className="gallery-grid">
        {results.map((path) => (
          <div className="gallery-item" key={path}>
            <img
              src={`${IMAGE_BASE}/${path}`}
              alt="Scraped"
              loading="lazy"
            />
            <div className="gallery-overlay">
              <span className="gallery-filename">
                {path.split('/').pop()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
