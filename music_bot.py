#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Музыкальный бот-парсер для Telegram каналов (@leaksffm, @novinki_muzyk, @newtracks, @leakspremiere).
Использует интеллектуальный последовательный обход ID через Telegram Bot API (copyMessage).
Не требует Telethon, API_ID, API_HASH и не зависит от веб-превью Telegram.
"""
import os
import sys
import csv
import time
import requests
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

def telegram_copy_message(bot_token: str, channel_id: str, from_chat: str, message_id: int):
    url = f"https://api.telegram.org/bot{bot_token}/copyMessage"
    data = {
        "chat_id": channel_id,
        "from_chat_id": f"@{from_chat}",
        "message_id": message_id
    }
    resp = requests.post(url, json=data, timeout=10)
    return resp.json()

def main():
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    channel_id = os.environ.get("TELEGRAM_CHANNEL_ID", "").strip()

    if not (bot_token and channel_id):
        log("❌ Ошибка: не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL_ID в Secrets GitHub.")
        sys.exit(1)

    uploaded = load_state()
    published = 0

    log("🚀 Запуск бота в режиме последовательного мониторинга ID через Telegram Bot API...")

    for source in SOURCES:
        if published >= 5:
            break
        
        # Determine highest known message ID for this source
        max_id = 0
        for post_id in uploaded:
            if post_id.startswith(f"{source}/"):
                try:
                    num = int(post_id.split('/')[1])
                    if num > max_id:
                        max_id = num
                except:
                    pass
        
        # If no history yet, start from a recent estimated baseline ID or probe
        if max_id == 0:
            max_id = 4500 # Adjust baseline if needed
            
        log(f"🔍 Сканирование @{source} начиная с ID {max_id + 1}...")
        
        consecutive_not_found = 0
        # Check next potential new message IDs sequentially
        for next_id in range(max_id + 1, max_id + 25):
            if published >= 5:
                break
            post_key = f"{source}/{next_id}"
            if post_key in uploaded:
                continue

            res = telegram_copy_message(bot_token, channel_id, source, next_id)
            if res.get("ok"):
                save_state(post_key)
                published += 1
                log(f"✅ Успешно скопирован новый трек: {post_key}!")
                consecutive_not_found = 0
                time.sleep(2)
            else:
                desc = res.get("description", "").lower()
                if "not found" in desc or "parser" in desc or "chat not found" in desc:
                    consecutive_not_found += 1
                    if consecutive_not_found >= 6:
                        break
                time.sleep(0.2)

    log(f"🏁 Работа бота завершена. Успешно скопировано новых треков: {published}")

if __name__ == "__main__":
    main()
