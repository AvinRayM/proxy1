import express from 'express';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;

// Explicitly serve the index.html on the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// The Proxy Route - Fixed and Absolute
app.get('/proxy', (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('No URL provided');

    const proxyRequest = (url) => {
        try {
            const parsedUrl = new URL(url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Referer': parsedUrl.origin
                }
            };

            protocol.get(options, (proxyRes) => {
                // Handle Redirects
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    return proxyRequest(new URL(proxyRes.headers.location, url).href);
                }

                // Strip blocking headers
                const headers = { ...proxyRes.headers };
                delete headers['x-frame-options'];
                delete headers['content-security-policy'];
                delete headers['cross-origin-resource-policy'];

                res.writeHead(proxyRes.statusCode, headers);
                proxyRes.pipe(res, { end: true });
            }).on('error', (err) => {
                res.status(500).send('Proxy Error: ' + err.message);
            });
        } catch (e) {
            res.status(400).send('Invalid URL');
        }
    };

    proxyRequest(targetUrl);
});

app.listen(PORT, () => {
    console.log(`Velvet Void running at http://localhost:${PORT}`);
});