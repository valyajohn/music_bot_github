#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Музыкальный бот-парсер для Telegram каналов (@leaksffm и #новинки).
- Копирует реальные музыкальные треки, аудиофайлы и посты из @leaksffm с помощью Telegram copyMessage API.
- Никаких случайных картинок: сохраняются оригинальные обложки, аудио и медиа из исходного канала.
"""
import os
import sys
import csv
import json
import time
import requests
from bs4 import BeautifulSoup
from pathlib import Path
from datetime import datetime, timezone

BASE = Path(__file__).resolve().parent
STATE_DIR = BASE / "state"
STATE_CSV = STATE_DIR / "music_state.csv"

SOURCES = ["leaksffm", "novinki_muzyk", "newtracks", "leakspremiere"]

def log(msg: str):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}", flush=True)

def load_state():
    uploaded = set()
    if STATE_CSV.exists():
        try:
            with open(STATE_CSV, newline="", encoding="utf-8") as f:
                reader = csv.reader(f)
                for row in reader:
                    if row and len(row) > 0:
                        val = row[0].strip()
                        if val and val.lower() not in ("post_id", "filename", "upload_date"):
                            uploaded.add(val)
        except Exception as e:
            log(f"Предупреждение при чтении state: {e}")
    return uploaded

def save_state(post_id: str):
    STATE_DIR.mkdir(exist_ok=True)
    file_exists = STATE_CSV.exists() and STATE_CSV.stat().st_size > 0
    with open(STATE_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["post_id", "upload_date"])
        writer.writerow([post_id, datetime.now(timezone.utc).isoformat()])

def fetch_track_posts_from_telegram(channel: str):
    url = f"https://t.me/s/{channel}"
    posts = []
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://t.me/"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        if resp.status_code != 200:
            log(f"Ошибка HTTP {resp.status_code} для канала {channel}")
            return []
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        messages = soup.find_all('div', class_='tgme_widget_message')
        if not messages:
            messages = soup.select('.tgme_widget_message_wrap')
            
        for msg in messages:
            data_post = msg.get('data-post', '') # format: channel/123
            text_el = msg.find('div', class_='tgme_widget_message_text')
            text = text_el.get_text(separator=" ").strip() if text_el else ""
            
            # Check if post has audio, music or document or media
            has_audio = msg.find('audio') or msg.find('div', class_='tgme_widget_message_audio') or msg.find('a', class_='tgme_widget_message_voice') or "mp3" in msg.decode_contents().lower()
            
            if data_post:
                parts = data_post.split('/')
                if len(parts) == 2:
                    ch_name, msg_id_str = parts[0], parts[1]
                    if msg_id_str.isdigit():
                        posts.append({
                            "post_id": data_post,
                            "channel": ch_name,
                            "message_id": int(msg_id_str),
                            "text": text,
                            "has_audio": bool(has_audio)
                        })
    except Exception as e:
        log(f"Ошибка парсинга {channel}: {e}")
    return posts

def telegram_copy_message(bot_token: str, channel_id: str, from_chat: str, message_id: int):
    url = f"https://api.telegram.org/bot{bot_token}/copyMessage"
    data = {
        "chat_id": channel_id,
        "from_chat_id": f"@{from_chat}",
        "message_id": message_id
    }
    resp = requests.post(url, json=data, timeout=30)
    return resp.json()

def main():
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    channel_id = os.environ.get("TELEGRAM_CHANNEL_ID", "")
    if not (bot_token and channel_id):
        log("Ошибка: не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL_ID в переменных окружения.")
        sys.exit(1)

    uploaded = load_state()
    all_posts = []
    for s in SOURCES:
        all_posts.extend(fetch_track_posts_from_telegram(s))
        time.sleep(1)

    if not all_posts:
        log("⚠️ Посты с треками не найдены в Telegram предпросмотрах.")
        return

    log(f"Найдено постов в источниках: {len(all_posts)}")
    
    # Prioritize posts with audio/music if available
    all_posts.sort(key=lambda x: (1 if x["has_audio"] else 0, x["message_id"]), reverse=True)

    published = 0
    for p in all_posts:
        if published >= 3:
            break
        post_id = p["post_id"]
        if post_id in uploaded:
            continue

        ch = p["channel"]
        msg_id = p["message_id"]
        
        log(f"Копирование реального трека из @{ch} (ID: {msg_id})...")
        res = telegram_copy_message(bot_token, channel_id, ch, msg_id)
        
        if res.get("ok"):
            save_state(post_id)
            published += 1
            log(f"✅ Трек успешно скопирован в канал {channel_id} (со всеми аудиофайлами и обложкой)!")
            time.sleep(3)
        else:
            log(f"❌ Ошибка copyMessage для {post_id}: {res}")

if __name__ == "__main__":
    main()
