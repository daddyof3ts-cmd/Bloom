import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Serve the static files from the Vite build, but DO NOT serve index.html directly
app.use(express.static(path.join(__dirname, '../dist'), { index: false }));

// Handle all core React routing natively by serving a dynamic index.html
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, '../dist/index.html');
  fs.readFile(indexPath, 'utf8', (err, htmlData) => {
    if (err) {
      console.error('Error reading index.html', err);
      return res.sendFile(indexPath); // Fallback
    }
    
    // Inject GEMINI_API_KEY from server's runtime environment
    const apiKey = process.env.GEMINI_API_KEY || '';
    const injectedScript = `<script>window.__RUNTIME_GEMINI_API_KEY__ = "${apiKey}";</script>`;
    
    // Replace the first </head> with the script + </head>
    const modifiedHtml = htmlData.replace('</head>', `${injectedScript}</head>`);
    
    res.send(modifiedHtml);
  });
});

// Use port 8080 as expected by Google Cloud App Engine Standard Environment
const port = process.env.PORT || 8080;
app.listen(port, () => {
    console.log(`Bloom server logic listening on port ${port}`);
});
