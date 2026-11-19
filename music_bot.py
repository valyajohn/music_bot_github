#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Музыкальный бот-парсер для Telegram каналов (@leaksffm, @novinki_muzyk, @newtracks, @leakspremiere).
Поддерживает два надежных режима:
1. Telethon (MTProto API) — прямое чтение публичных каналов без скрапинга веб-превью (рекомендуется).
2. Telegram Bot API (copyMessage) — копирование постов.
"""
import os
import sys
import csv
import json
import time
import re
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

def run_telethon_bot():
    """Режим Telethon (MTProto API): читает каналы напрямую через официальный Telegram API."""
    try:
        from telethon import TelegramClient
        import asyncio
    except ImportError:
        log("Библиотека telethon не установлена. Установите её: pip install telethon")
        return False

    api_id = os.environ.get("TELEGRAM_API_ID", "")
    api_hash = os.environ.get("TELEGRAM_API_HASH", "")
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    channel_id = os.environ.get("TELEGRAM_CHANNEL_ID", "")

    if not (api_id and api_hash and channel_id):
        return False

    log("🚀 Запуск бота в режиме Telethon (прямое подключение к Telegram API)...")
    
    async def main_async():
        client = TelegramClient('music_bot_session', int(api_id), api_hash)
        await client.start(bot_token=bot_token if bot_token else None)
        
        uploaded = load_state()
        published = 0

        for source in SOURCES:
            try:
                log(f"Сканирование канала @{source} через Telethon...")
                async for message in client.iter_messages(source, limit=10):
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
                        log(f"✅ Успешно скопировано!")
                        time.sleep(2)
                    except Exception as err:
                        log(f"❌ Ошибка пересылки сообщения: {err}")
            except Exception as e:
                log(f"Ошибка доступа к каналу @{source}: {e}")

        await client.disconnect()

    asyncio.run(main_async())
    return True

def run_bot_api_fallback():
    """Резервный режим веб-парсинга и копирования."""
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    channel_id = os.environ.get("TELEGRAM_CHANNEL_ID", "")
    if not (bot_token and channel_id):
        log("Ошибка: не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHANNEL_ID.")
        sys.exit(1)

    uploaded = load_state()
    log("⚠️ Веб-превью Telegram защищено от прямого парсинга HTML. Рекомендуется использовать Telethon (укажите TELEGRAM_API_ID и TELEGRAM_API_HASH в Secrets).")
    log("🔄 Попытка резервного сканирования недавних ID сообщений в каналах...")

    published = 0
    for s in SOURCES:
        if published >= 5:
            break
        # Scan recent message ID range dynamically
        for test_id in range(5500, 4000, -1):
            post_key = f"{s}/{test_id}"
            if post_key in uploaded:
                continue
            
            url = f"https://api.telegram.org/bot{bot_token}/copyMessage"
            data = {
                "chat_id": channel_id,
                "from_chat_id": f"@{s}",
                "message_id": test_id
            }
            try:
                resp = requests.post(url, json=data, timeout=10).json()
                if resp.get("ok"):
                    log(f"✅ Найден и скопирован новый трек: {post_key}!")
                    save_state(post_key)
                    published += 1
                    time.sleep(2)
                elif "Bad Request: message to copy not found" in str(resp):
                    continue
                else:
                    # Rate limit or other error
                    time.sleep(0.5)
            except Exception:
                pass

    if published == 0:
        log("ℹ️ Новых треков за этот проход не обнаружено. Убедитесь, что каналы активны и бот имеет доступ.")

def main():
    # Try Telethon first if credentials exist, otherwise fallback
    if os.environ.get("TELEGRAM_API_ID") and os.environ.get("TELEGRAM_API_HASH"):
        success = run_telethon_bot()
        if success:
            return

    run_bot_api_fallback()

if __name__ == "__main__":
    main()
