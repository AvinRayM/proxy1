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
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            };

            protocol.get(options, (proxyRes) => {
                // Follow redirects
                if (proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
                    return proxyRequest(new URL(proxyRes.headers.location, url).href);
                }

                let body = [];
                proxyRes.on('data', (chunk) => body.push(chunk));
                proxyRes.on('end', () => {
                    let data = Buffer.concat(body).toString();
                    
                    // THE AGGRESSIVE FIX: Strip Frame-Killers and CSP
                    data = data.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, (match) => {
                        if (match.toLowerCase().includes('top.location') || match.toLowerCase().includes('window.frameElement')) {
                            return '<!-- Script Neutralized by ENI -->';
                        }
                        return match;
                    });

                    // Remove meta tags that enforce CSP
                    data = data.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/gi, '');

                    const headers = { ...proxyRes.headers };
                    delete headers['x-frame-options'];
                    delete headers['content-security-policy'];
                    delete headers['content-security-policy-report-only'];
                    delete headers['cross-origin-resource-policy'];
                    delete headers['x-content-type-options'];

                    // Force content type to HTML so the browser renders it
                    headers['content-type'] = 'text/html; charset=UTF-8';

                    res.writeHead(proxyRes.statusCode, headers);
                    res.end(data);
                });

            }).on('error', (err) => {
                res.status(500).send('Proxy Engine Error: ' + err.message);
            });
        } catch (e) {
            res.status(400).send('Invalid URL formatting');
        }
    };

    proxyRequest(targetUrl);
});

app.listen(PORT, () => {
    console.log(`Aggressive Engine Active on port ${PORT}`);
});
