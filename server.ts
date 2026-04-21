import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import PQueue from 'p-queue';
import { z } from 'zod';

export const app = express();
const PORT = 3000;

app.use(express.json());

const ScanRequestSchema = z.object({
  url: z.string().url(),
  maxPages: z.number().min(1).max(500).optional().default(50),
});

// Basic crawler logic
async function runCrawler(targetUrl: string, maxPages: number, onUpdate: (data: any) => void) {
  const visited = new Set<string>();
  const queue = [targetUrl];
  const brokenLinks: Array<{ url: string; source: string; status: number | string }> = [];
  let pagesProcessed = 0;
  
  const baseUrl = new URL(targetUrl).origin;
  const targetHost = new URL(targetUrl).hostname;

  // Queue for processing pages (internal only)
  const pageQueue = new PQueue({ concurrency: 5 });
  // Queue for checking individual links (can be many)
  const linkCheckQueue = new PQueue({ concurrency: 10 });

  const foundLinks = new Set<string>();

  onUpdate({ type: 'start', message: `Starting scan of ${targetUrl}` });

  const checkLink = async (linkUrl: string, sourcePage: string) => {
    if (foundLinks.has(`${linkUrl}-${sourcePage}`)) return;
    foundLinks.add(`${linkUrl}-${sourcePage}`);

    try {
      // Try HEAD request first for efficiency
      const response = await axios.head(linkUrl, {
        timeout: 5000,
        headers: { 'User-Agent': 'OneHoster/1.0' },
        validateStatus: () => true, // Don't throw on 404
      });

      // If HEAD fails or gives unexpected results, try a limited GET
      let status = response.status;
      if (status >= 400 && status !== 405) { // 405 Method Not Allowed is common for HEAD
         const getResponse = await axios.get(linkUrl, {
           timeout: 5000,
           headers: { 'User-Agent': 'OneHoster/1.0' },
           validateStatus: () => true,
           maxContentLength: 1000, // We don't need much
         });
         status = getResponse.status;
      }

      if (status >= 400 || status === 0) {
        brokenLinks.push({ url: linkUrl, source: sourcePage, status });
        onUpdate({ type: 'broken_found', stats: { pagesProcessed, brokenCount: brokenLinks.length }, brokenLink: { url: linkUrl, source: sourcePage, status } });
      }
    } catch (error: any) {
      const status = error.response?.status || error.code || 'TIMEOUT';
      brokenLinks.push({ url: linkUrl, source: sourcePage, status });
      onUpdate({ type: 'broken_found', stats: { pagesProcessed, brokenCount: brokenLinks.length }, brokenLink: { url: linkUrl, source: sourcePage, status } });
    }
  };

  const processPage = async (currentUrl: string) => {
    if (visited.has(currentUrl) || pagesProcessed >= maxPages) return;
    visited.add(currentUrl);
    pagesProcessed++;

    onUpdate({ type: 'progress', message: `Crawling ${currentUrl}`, stats: { pagesProcessed, brokenCount: brokenLinks.length } });

    try {
      const { data: html } = await axios.get(currentUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'OneHoster/1.0' },
      });

      const $ = cheerio.load(html);
      const linksOnPage: string[] = [];

      $('a[href]').each((_, element) => {
        const href = $(element).attr('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

        try {
          const resolvedUrl = new URL(href, currentUrl).href;
          const urlObj = new URL(resolvedUrl);

          // Normalize
          urlObj.hash = '';
          const finalUrl = urlObj.href;

          linksOnPage.push(finalUrl);
          
          // If internal and not visited, add to queue
          if (urlObj.hostname === targetHost && !visited.has(finalUrl) && pagesProcessed < maxPages) {
             pageQueue.add(() => processPage(finalUrl));
          }

          // Check if link is broken
          linkCheckQueue.add(() => checkLink(finalUrl, currentUrl));
        } catch (e) {
          // Invalid URL
        }
      });

    } catch (error) {
      onUpdate({ type: 'error', message: `Failed to crawl ${currentUrl}` });
    }
  };

  await processPage(targetUrl);
  await pageQueue.onIdle();
  await linkCheckQueue.onIdle();

  onUpdate({ type: 'complete', stats: { pagesProcessed, brokenCount: brokenLinks.length }, brokenLinks });
}

// SSE Endpoint for scanning
app.get('/api/scan', async (req, res) => {
  const urlParam = req.query.url as string;
  const maxPagesParam = req.query.maxPages ? parseInt(req.query.maxPages as string) : 50;

  if (!urlParam) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    new URL(urlParam);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: any) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    await runCrawler(urlParam, maxPagesParam, sendEvent);
  } catch (error) {
    sendEvent({ type: 'error', message: 'An unexpected error occurred during scan' });
  } finally {
    res.end();
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
