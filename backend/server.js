const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { scrapeImages } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3001;

// Task store (In-memory for simplicity)
const tasks = new Map();

// Middleware
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Public directory for scraped images
const PUBLIC_DIR = path.join(__dirname, 'public');
const SCRAPED_IMAGES_DIR = path.join(PUBLIC_DIR, 'scraped_images');

if (!fs.existsSync(SCRAPED_IMAGES_DIR)) {
    fs.mkdirSync(SCRAPED_IMAGES_DIR, { recursive: true });
}

// Serve static images
app.use('/images', express.static(SCRAPED_IMAGES_DIR));

// API: Start Scrape
app.post('/api/scrape', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    const taskId = uuidv4();
    const task = {
        id: taskId,
        url,
        status: 'PROCESSING',
        results: [],
        timestamp: Date.now(),
        error: null
    };

    tasks.set(taskId, task);

    // Run scraper in background
    scrapeImages(taskId, url, SCRAPED_IMAGES_DIR, (count, newFile) => {
        const t = tasks.get(taskId);
        if (t) {
            t.results.push(newFile);
        }
    }).then((results) => {
        const t = tasks.get(taskId);
        if (t) {
            t.status = 'COMPLETED';
            t.results = results;
        }
    }).catch((err) => {
        const t = tasks.get(taskId);
        if (t) {
            t.status = 'FAILED';
            t.error = err.message;
        }
    });

    res.json({ taskId, url });
});

// API: Get Task Status
app.get('/api/tasks/:id', (req, res) => {
    const taskId = req.params.id;
    const task = tasks.get(taskId);

    if (!task) {
        return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Images served from: ${SCRAPED_IMAGES_DIR}`);
});
