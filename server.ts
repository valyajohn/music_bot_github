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

// Ensure state dir exists
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Default config
const DEFAULT_CONFIG = {
  interval_hours: 3,
  timezone: "Europe/Moscow",
  telegram_channel_id: "@my_channel_username",
  telegram_bot_token: "",
  unsplash_access_key: "",
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

const RU_SLANG_INTROS = [
  "🔥 Главный бэнгер этой недели:",
  "⚡ Этот трек разнесет все чарты:",
  "🖤 Новый звук, который ты ждал:",
  "💎 Чистый кач и мощный вайб:",
  "🌪️ Трек, от которого мурашки:"
];

const EN_SLANG_INTROS = [
  "🔥 Pure fire on repeat:",
  "⚡ Absolute chart-breaker:",
  "🖤 The vibe is unmatched:",
  "💎 Fresh drop you need right now:",
  "🌪️ Heavy rotation material:"
];

const RU_HASHTAGS = ["новинки", "музыка", "трек", "премьера", "хит", "звук", "рэп", "поп", "чарт", "кач", "вайб"];
const EN_HASHTAGS = ["newmusic", "track", "premiere", "hit", "vibes", "audio", "rap", "pop", "chart", "fire", "fresh"];

function isRussian(text: string) {
  return /[а-яёА-ЯЁ]/.test(text);
}

// API Routes
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
        if (text) {
          tracks.push({
            post_id: postId,
            channel: ch,
            text,
            is_ru: isRussian(text)
          });
        }
      });

      if (tracks.length === 0) {
        $('.message').each((_, el) => {
          const text = $(el).text().trim();
          if (text) {
            tracks.push({
              post_id: `${ch}_fallback_${Math.random()}`,
              channel: ch,
              text,
              is_ru: isRussian(text)
            });
          }
        });
      }

      results.push({ channel: ch, success: true, count: tracks.length, tracks });
    } catch (err: any) {
      results.push({ channel: ch, success: false, error: err.message, count: 0, tracks: [] });
    }
  }

  res.json({ results });
});

app.post('/api/run-bot', async (req, res) => {
  const logs: string[] = [];
  logs.push(`[${new Date().toISOString()}] Старт выполнения бота для каналов: ${SOURCES.join(', ')}`);

  let allTracks: any[] = [];
  for (const ch of SOURCES) {
    try {
      const resp = await fetch(`https://t.me/s/${ch}`, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
      });
      const html = await resp.text();
      const $ = cheerio.load(html);
      $('.tgme_widget_message').each((_, el) => {
        const text = $(el).find('.tgme_widget_message_text').text().trim();
        const postId = $(el).attr('data-post') || `${ch}_${Math.random()}`;
        if (text) {
          allTracks.push({ post_id: postId, channel: ch, text });
        }
      });
    } catch (e: any) {
      logs.push(`[Ошибка] Не удалось спарсить ${ch}: ${e.message}`);
    }
  }

  if (allTracks.length === 0) {
    logs.push(`[Внимание] Треки не найдены в Telegram предпросмотрах. Используем резервный пул горячих релизов (@leaksffm)...`);
    allTracks = [
      { post_id: "fallback_pharaoh_2026", channel: "leaksffm", text: "PHARAOH - Новый неизданный трек (Snippet Leak 2026) #новинки #leaksffm" },
      { post_id: "fallback_ogbuda_2026", channel: "leaksffm", text: "OG Buda & Mayot - Demo Session Freestyle #хит #новинки" },
      { post_id: "fallback_scarlxrd_2026", channel: "leaksffm", text: "Scarlxrd - Dark Metal ID #newmusic #track" }
    ];
  }

  const selected = allTracks.slice(0, 3);
  const published: any[] = [];

  for (const t of selected) {
    const isRu = isRussian(t.text);
    const intro = isRu 
      ? RU_SLANG_INTROS[Math.floor(Math.random() * RU_SLANG_INTROS.length)]
      : EN_SLANG_INTROS[Math.floor(Math.random() * EN_SLANG_INTROS.length)];
    
    const tagPool = isRu ? RU_HASHTAGS : EN_HASHTAGS;
    const shuffledTags = [...tagPool].sort(() => 0.5 - Math.random()).slice(0, 5);
    const tagsStr = shuffledTags.map(tag => `#${tag}`).join(' ');

    const cover = "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&fm=jpg";
    const caption = `${intro}\n\n<b>${t.text.substring(0, 250)}</b>\n\n🎧 Слушай на повторе!\n\n${tagsStr}`;

    logs.push(`[Успех] Обработан трек (${t.channel}): ${t.text.substring(0, 50)}...`);
    
    const entry = `${t.post_id},${new Date().toISOString()}\n`;
    fs.appendFileSync(STATE_CSV, entry, 'utf-8');

    published.push({
      post_id: t.post_id,
      channel: t.channel,
      caption,
      cover
    });
  }

  res.json({ success: true, logs, published });
});

app.post('/api/test-telegram', async (req, res) => {
  const { bot_token, channel_id, caption, photo_url } = req.body;
  if (!bot_token || !channel_id) {
    return res.status(400).json({ success: false, error: "Не указан токен бота или ID канала" });
  }

  try {
    const tgUrl = `https://api.telegram.org/bot${bot_token}/sendPhoto`;
    const resp = await fetch(tgUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channel_id,
        photo: photo_url || "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&fm=jpg",
        caption: caption || "🔥 Тестовый пост из Telegram Music Bot Dashboard",
        parse_mode: "HTML"
      })
    });
    const data = await resp.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Vite middleware integration for dev
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
