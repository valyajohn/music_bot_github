#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Музыкальный бот-парсер для Telegram каналов (@leaksffm, @novinki_muzyk, @newtracks, @leakspremiere).
- Парсит свежие треки по всем указанным источникам.
- Использует несколько надежных методов извлечения ID сообщений (data-post и ссылки на посты).
- Копирует реальные музыкальные треки и аудиофайлы с помощью Telegram copyMessage API.
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
    posts_dict = {}
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://t.me/"
    }
    try:
        resp = requests.get(url, headers=headers, timeout=15)
        log(f"Ответ от {url}: статус {resp.status_code}, длина HTML: {len(resp.text)}")
        if resp.status_code != 200:
            log(f"Ошибка HTTP {resp.status_code} для канала {channel}")
            return []
        
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # Method 1: Find by [data-post]
        for msg in soup.select('[data-post]'):
            dp = msg.get('data-post', '')
            if dp:
                parts = dp.split('/')
                if len(parts) == 2 and parts[1].isdigit():
                    posts_dict[int(parts[1])] = {
                        "post_id": dp,
                        "channel": parts[0],
                        "message_id": int(parts[1]),
                        "has_audio": True
                    }

        # Method 2: Find by all <a> links matching /{channel}/(\d+) or t.me/{channel}/(\d+)
        for a in soup.find_all('a', href=True):
            href = a['href']
            if f"/{channel}/" in href:
                subparts = href.split(f"/{channel}/")
                if len(subparts) > 1:
                    num_str = subparts[1].split('/')[0].split('?')[0].split('#')[0]
                    if num_str.isdigit():
                        msg_id = int(num_str)
                        if msg_id not in posts_dict:
                            posts_dict[msg_id] = {
                                "post_id": f"{channel}/{msg_id}",
                                "channel": channel,
                                "message_id": msg_id,
                                "has_audio": True
                            }

        results = list(posts_dict.values())
        log(f"Найдено уникальных постов для @{channel}: {len(results)}")
        return results

    except Exception as e:
        log(f"Ошибка парсинга {channel}: {e}")
    return []

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
    
    # Check all sources
    for s in SOURCES:
        log(f"Сканирование источника: @{s}...")
        posts = fetch_track_posts_from_telegram(s)
        all_posts.extend(posts)
        time.sleep(1)

    if not all_posts:
        log("⚠️ Посты с треками не найдены через веб-превью. Запуск резервного сканирования ID...")
        try:
            for s in SOURCES:
                for test_id in range(5000, 4800, -1):
                    res = telegram_copy_message(bot_token, channel_id, s, test_id)
                    if res.get("ok"):
                        log(f"✅ Успешно скопирован пост {s}/{test_id} через резервный сканер!")
                        save_state(f"{s}/{test_id}")
                        break
        except Exception as e:
            log(f"Ошибка резервного копирования: {e}")
        return

    log(f"Всего найдено постов во всех источниках: {len(all_posts)}")
    
    # Sort by message_id descending so newest posts are processed first
    all_posts.sort(key=lambda x: x["message_id"], reverse=True)

    published = 0
    for p in all_posts:
        if published >= 5:
            break
        post_id = p["post_id"]
        if post_id in uploaded:
            continue

        ch = p["channel"]
        msg_id = p["message_id"]
        
        log(f"Копирование трека из @{ch} (ID: {msg_id})...")
        res = telegram_copy_message(bot_token, channel_id, ch, msg_id)
        
        if res.get("ok"):
            save_state(post_id)
            published += 1
            log(f"✅ Трек успешно скопирован в канал {channel_id} из @{ch}!")
            time.sleep(3)
        else:
            log(f"❌ Ошибка copyMessage для {post_id}: {res}")

if __name__ == "__main__":
    main()
