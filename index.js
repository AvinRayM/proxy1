import express from 'express';
import https from 'node:https';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/proxy', (req, res) => {
    let targetUrl;
    try {
        // Decode the URL from Base64 to hide it from GoGuardian
        const encodedUrl = req.query.url;
        targetUrl = Buffer.from(encodedUrl, 'base64').toString('utf-8');
    } catch (e) {
        return res.status(400).send('Invalid Stealth Request');
    }

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
                    'Accept-Encoding': 'identity', // Prevents compression issues during rewriting
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
                    let data = Buffer.concat(body);
                    const contentType = proxyRes.headers['content-type'] || '';

                    // Only rewrite URLs for HTML and CSS files
                    if (contentType.includes('text/html') || contentType.includes('text/css')) {
                        let text = data.toString();
                        
                        // MAGIC: Rewrite all links/images into Base64 Proxy calls
                        text = text.replace(/(src|href|action|poster)="(?!http|https|data|#)([^"]+)"/gim, (m, p1, p2) => {
                            const absolute = new URL(p2, url).href;
                            const b64 = Buffer.from(absolute).toString('base64');
                            return `${p1}="/proxy?url=${b64}"`;
                        });

                        // Catch full URLs too
                        text = text.replace(/(src|href|action|poster)="(http[^"]+)"/gim, (m, p1, p2) => {
                            const b64 = Buffer.from(p2).toString('base64');
                            return `${p1}="/proxy?url=${b64}"`;
                        });

                        // Strip frame-killers
                        text = text.replace(/top\.location|window\.frameElement/gi, '/* ENI */');
                        data = Buffer.from(text);
                    }

                    const headers = { ...proxyRes.headers };
                    delete headers['x-frame-options'];
                    delete headers['content-security-policy'];
                    headers['content-type'] = contentType;
                    headers['access-control-allow-origin'] = '*';

                    res.writeHead(proxyRes.statusCode, headers);
                    res.end(data);
                });
            }).on('error', (err) => res.status(500).send('Void Error: ' + err.message));
        } catch (e) {
            res.status(400).send('Format Error');
        }
    };

    proxyRequest(targetUrl);
});

app.listen(PORT, () => console.log('Void Operating'));
