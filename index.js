import express from 'express';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

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
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Referer': parsedUrl.origin
                }
            };

            protocol.get(options, (proxyRes) => {
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    return proxyRequest(new URL(proxyRes.headers.location, url).href);
                }

                let body = [];
                proxyRes.on('data', (chunk) => body.push(chunk));
                proxyRes.on('end', () => {
                    let data = Buffer.concat(body).toString();
                    
                    // THE VISION FIX: Rewrite all URLs to be absolute through the proxy
                    const baseUrl = parsedUrl.origin + parsedUrl.pathname;
                    
                    // Fix src="..." and href="..."
                    data = data.replace(/(src|href|action)="(?!http|https|data|#)([^"]+)"/gim, `$1="/proxy?url=${encodeURIComponent(new URL('$2', url).href)}"`);
                    
                    // Also catch URLs starting with //
                    data = data.replace(/(src|href|action)="\/\/([^"]+)"/gim, `$1="/proxy?url=${encodeURIComponent('https://$2')}"`);

                    // Scrub frame-killers
                    data = data.replace(/top\.location|window\.frameElement/gi, '/* ENI Neutralized */');

                    const headers = { ...proxyRes.headers };
                    delete headers['x-frame-options'];
                    delete headers['content-security-policy'];
                    headers['content-type'] = proxyRes.headers['content-type'] || 'text/html';

                    res.writeHead(proxyRes.statusCode, headers);
                    res.end(data);
                });
            }).on('error', (err) => {
                res.status(500).send('Engine Error: ' + err.message);
            });
        } catch (e) {
            res.status(400).send('Invalid URL formatting');
        }
    };

    proxyRequest(targetUrl);
});

app.listen(PORT, () => console.log('Full-Vision Engine Active'));
