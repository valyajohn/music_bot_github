#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Музыкальный бот-парсер для Telegram каналов (@leaksffm, @novinki_muzyk, @newtracks, @leakspremiere).
Использует Telethon (MTProto API) для мгновенного чтения и копирования треков.
"""
import os
import sys
import csv
import time
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

def main():
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    channel_id = os.environ.get("TELEGRAM_CHANNEL_ID", "")
    api_id = os.environ.get("TELEGRAM_API_ID", "")
    api_hash = os.environ.get("TELEGRAM_API_HASH", "")

    if not (bot_token and channel_id):
        log("❌ Ошибка: не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL_ID в Secrets.")
        sys.exit(1)

    if not (api_id and api_hash):
        log("❌ Ошибка: не заданы TELEGRAM_API_ID и TELEGRAM_API_HASH в Secrets GitHub!")
        log("Добавьте TELEGRAM_API_ID и TELEGRAM_API_HASH в Settings -> Secrets and variables -> Actions.")
        sys.exit(1)

    try:
        from telethon import TelegramClient
        import asyncio
    except ImportError:
        log("❌ Библиотека telethon не установлена. Проверьте requirements.txt.")
        sys.exit(1)

    log("🚀 Запуск бота в режиме Telethon (подключение к Telegram API)...")

    async def run_sync():
        client = TelegramClient('music_bot_session', int(api_id), api_hash)
        await client.start(bot_token=bot_token)
        
        uploaded = load_state()
        published = 0

        for source in SOURCES:
            try:
                log(f"🔍 Сканирование канала @{source}...")
                async for message in client.iter_messages(source, limit=15):
                    if published >= 5:
                        break
                    if not message.id:
                        continue
                    
                    post_key = f"{source}/{message.id}"
                    if post_key in uploaded:
                        continue

                    log(f"🔄 Копирование сообщения {post_key} в {channel_id}...")
                    try:
                        await client.forward_messages(channel_id, message)
                        save_state(post_key)
                        published += 1
                        log(f"✅ Успешно скопировано в {channel_id}!")
                        time.sleep(2)
                    except Exception as err:
                        log(f"❌ Ошибка копирования сообщения {post_key}: {err}")
            except Exception as e:
                log(f"❌ Ошибка доступа к каналу @{source}: {e}")

        await client.disconnect()

    try:
        asyncio.run(run_sync())
        log("🏁 Работа бота успешно завершена.")
    except Exception as e:
        log(f"❌ Критическая ошибка выполнения Telethon: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
