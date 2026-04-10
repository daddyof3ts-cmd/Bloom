import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve the static files from the Vite build
app.use(express.static(path.join(__dirname, '../dist')));

// Handle all core React routing natively by serving index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Use port 8080 as expected by Google Cloud App Engine Standard Environment
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Bloom server logic listening on port ${port}`);
});
