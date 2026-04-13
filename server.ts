import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import * as cheerio from "cheerio";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Link Fetching
  app.post("/api/fetch-link", async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      
      // Remove scripts, styles, and nav elements
      $('script, style, nav, header, footer, noscript, iframe, ad').remove();

      const title = $('title').text() || $('h1').first().text() || '网页摘录';
      
      // Try to find the main content
      let content = '';
      const selectors = ['article', 'main', '.content', '.post-content', '.article-content', '#content', '.main-content'];
      
      for (const selector of selectors) {
        const el = $(selector);
        if (el.length > 0) {
          content = el.text();
          break;
        }
      }

      if (!content) {
        content = $('body').text();
      }

      // Basic cleanup
      content = content
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();

      res.json({
        title: title.trim(),
        content: content,
        author: new URL(url).hostname
      });
    } catch (error) {
      console.error("Error fetching link:", error);
      res.status(500).json({ error: "无法抓取该链接内容，请检查链接是否有效或受限。" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
