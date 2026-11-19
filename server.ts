import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const STATE_DIR = path.resolve(__dirname, 'state');
const STATE_CSV = path.resolve(STATE_DIR, 'music_state.csv');
const CONFIG_PATH = path.resolve(__dirname, 'config.json');

if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

const DEFAULT_CONFIG = {
  interval_hours: 3,
  timezone: "Europe/Moscow",
  telegram_channel_id: "@my_channel_username",
  telegram_bot_token: "",
  default_tags: ["music", "новинки", "leaks"]
};

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

function saveConfig(cfg: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
}

const SOURCES = ["leaksffm", "novinki_muzyk", "newtracks", "leakspremiere"];

app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
  const newCfg = req.body;
  saveConfig(newCfg);
  res.json({ success: true, config: newCfg });
});

app.get('/api/logs', (req, res) => {
  let uploadedTracks: any[] = [];
  if (fs.existsSync(STATE_CSV)) {
    try {
      const content = fs.readFileSync(STATE_CSV, 'utf-8');
      const lines = content.split('\n').filter(l => l.trim().length > 0);
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length >= 2) {
          uploadedTracks.push({
            post_id: parts[0],
            upload_date: parts[1]
          });
        }
      }
    } catch (e) {}
  }
  res.json({ uploaded: uploadedTracks.reverse() });
});

app.get('/api/parse-channels', async (req, res) => {
  const results: any[] = [];
  const channelParam = req.query.channel as string;
  const channelsToFetch = channelParam ? [channelParam] : SOURCES;

  for (const ch of channelsToFetch) {
    try {
      const url = `https://t.me/s/${ch}`;
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        }
      });
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const tracks: any[] = [];
      $('.tgme_widget_message').each((_, el) => {
        const postId = $(el).attr('data-post') || `${ch}_${Math.random()}`;
        const text = $(el).find('.tgme_widget_message_text').text().trim();
        const hasAudio = $(el).find('audio, .tgme_widget_message_audio, .tgme_widget_message_voice').length > 0 || $(el).html()?.toLowerCase().includes('mp3');
        if (text || hasAudio) {
          tracks.push({
            post_id: postId,
            channel: ch,
            text: text || "[Аудио / Музыкальный файл без текста]",
            has_audio: Boolean(hasAudio)
          });
        }
      });

      results.push({ channel: ch, success: true, count: tracks.length, tracks });
    } catch (err: any) {
      results.push({ channel: ch, success: false, error: err.message, count: 0, tracks: [] });
    }
  }

  res.json({ results });
});

app.post('/api/run-bot', async (req, res) => {
  const cfg = loadConfig();
  const logs: string[] = [];
  logs.push(`[${new Date().toISOString()}] Старт копирования реальных треков из каналов: ${SOURCES.join(', ')}`);

  let allPosts: any[] = [];
  for (const ch of SOURCES) {
    try {
      const resp = await fetch(`https://t.me/s/${ch}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      const html = await resp.text();
      const $ = cheerio.load(html);
      $('.tgme_widget_message').each((_, el) => {
        const postId = $(el).attr('data-post') || '';
        const text = $(el).find('.tgme_widget_message_text').text().trim();
        const hasAudio = $(el).find('audio, .tgme_widget_message_audio, .tgme_widget_message_voice').length > 0;
        if (postId) {
          const parts = postId.split('/');
          if (parts.length === 2) {
            allPosts.push({ post_id: postId, channel: parts[0], message_id: Number(parts[1]), text, hasAudio });
          }
        }
      });
    } catch (e: any) {
      logs.push(`[Ошибка] Не удалось спарсить ${ch}: ${e.message}`);
    }
  }

  allPosts.sort((a, b) => (b.hasAudio ? 1 : 0) - (a.hasAudio ? 1 : 0));
  const selected = allPosts.slice(0, 3);
  const published: any[] = [];

  for (const p of selected) {
    logs.push(`[Успех] Найден реальный трек в @${p.channel} (ID: ${p.message_id}). Готов к копированию.`);
    const entry = `${p.post_id},${new Date().toISOString()}\n`;
    fs.appendFileSync(STATE_CSV, entry, 'utf-8');

    if (cfg.telegram_bot_token && cfg.telegram_channel_id) {
      try {
        const copyRes = await fetch(`https://api.telegram.org/bot${cfg.telegram_bot_token}/copyMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: cfg.telegram_channel_id,
            from_chat_id: `@${p.channel}`,
            message_id: p.message_id
          })
        });
        const copyData = await copyRes.json();
        if (copyData.ok) {
          logs.push(`✅ Успешно скопировано в ${cfg.telegram_channel_id}!`);
        } else {
          logs.push(`❌ Ошибка Telegram copyMessage: ${JSON.stringify(copyData)}`);
        }
      } catch (err: any) {
        logs.push(`❌ Ошибка запроса copyMessage: ${err.message}`);
      }
    }

    published.push({
      post_id: p.post_id,
      channel: p.channel,
      text: p.text
    });
  }

  res.json({ success: true, logs, published });
});

app.post('/api/test-telegram', async (req, res) => {
  const { bot_token, channel_id } = req.body;
  if (!bot_token || !channel_id) {
    return res.status(400).json({ success: false, error: "Не указан токен бота или ID канала" });
  }

  try {
    // Test copying a message from @leaksffm
    const testResp = await fetch(`https://t.me/s/leaksffm`);
    const html = await testResp.text();
    const $ = cheerio.load(html);
    let samplePostId = "";
    $('.tgme_widget_message').each((_, el) => {
      const pid = $(el).attr('data-post');
      if (pid && !samplePostId) samplePostId = pid;
    });

    if (!samplePostId) {
      return res.status(400).json({ success: false, error: "Не удалось найти тестовый пост в @leaksffm" });
    }

    const parts = samplePostId.split('/');
    const copyRes = await fetch(`https://api.telegram.org/bot${bot_token}/copyMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channel_id,
        from_chat_id: `@${parts[0]}`,
        message_id: Number(parts[1])
      })
    });
    const data = await copyRes.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

async function startServer() {
  const { createServer: createViteServer } = await import('vite');
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false }
  });

  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
