import React, { useState, useEffect } from 'react';
import { 
  Music, 
  Terminal, 
  Settings, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Send, 
  Radio, 
  ListMusic, 
  ExternalLink,
  Cpu,
  HelpCircle,
  FileText
} from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'scanner' | 'config' | 'logs' | 'guide'>('dashboard');
  const [config, setConfig] = useState({
    interval_hours: 3,
    timezone: "Europe/Moscow",
    telegram_channel_id: "@my_channel_username",
    telegram_bot_token: "",
    unsplash_access_key: "",
    default_tags: ["music", "новинки", "leaks"]
  });

  const [logs, setLogs] = useState<string[]>([]);
  const [publishedTracks, setPublishedTracks] = useState<any[]>([]);
  const [scannedChannels, setScannedChannels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [testChannel, setTestChannel] = useState('leaksffm');
  const [notification, setNotification] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    fetchConfig();
    fetchLogs();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      const data = await res.json();
      setPublishedTracks(data.uploaded || []);
    } catch (e) {
      console.error(e);
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (data.success) {
        showNotification('success', 'Конфигурация успешно сохранена!');
      }
    } catch (e) {
      showNotification('error', 'Ошибка сохранения конфигурации');
    }
  };

  const runBot = async () => {
    setLoading(true);
    setLogs(prev => [`[${new Date().toLocaleTimeString()}] Запуск бота из панели...`, ...prev]);
    try {
      const res = await fetch('/api/run-bot', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setLogs(prev => [...data.logs, ...prev]);
        setPublishedTracks(data.published.map((p: any) => ({ post_id: p.post_id, upload_date: new Date().toISOString() })).concat(publishedTracks));
        showNotification('success', `Успешно обработано треков: ${data.published.length}`);
      }
    } catch (e: any) {
      showNotification('error', 'Ошибка выполнения бота: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const parseChannels = async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/parse-channels?channel=${testChannel}`);
      const data = await res.json();
      setScannedChannels(data.results || []);
      showNotification('success', 'Сканирование каналов завершено!');
    } catch (e: any) {
      showNotification('error', 'Ошибка сканирования: ' + e.message);
    } finally {
      setScanning(false);
    }
  };

  const testTelegramSend = async () => {
    if (!config.telegram_bot_token || !config.telegram_channel_id) {
      showNotification('error', 'Укажите TELEGRAM_BOT_TOKEN и TELEGRAM_CHANNEL_ID в настройках!');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/test-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_token: config.telegram_bot_token,
          channel_id: config.telegram_channel_id,
          caption: "🔥 <b>Тестовый бэнгер от Music Bot Dashboard</b>\n\n#новинки #тест",
          photo_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1200&fm=jpg"
        })
      });
      const data = await res.json();
      if (data.ok) {
        showNotification('success', 'Тестовое сообщение с обложкой отправлено в ТГ!');
      } else {
        showNotification('error', `Ошибка Telegram API: ${data.description || JSON.stringify(data)}`);
      }
    } catch (e: any) {
      showNotification('error', 'Ошибка сети: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 4000);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-30 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-violet-600 to-indigo-500 p-2.5 rounded-xl shadow-lg shadow-violet-500/20">
            <Music className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Telegram Music Bot Dashboard
              <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">Активен</span>
            </h1>
            <p className="text-xs text-slate-400">Автопостинг треков из @leaksffm и #новинки с обложками и сленгом</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={runBot}
            disabled={loading}
            className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all disabled:opacity-50"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            Запустить бота сейчас
          </button>
        </div>
      </header>

      {/* Notification Toast */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-medium transition-all animate-bounce ${
          notification.type === 'success' ? 'bg-emerald-900/90 text-emerald-200 border border-emerald-700' : 'bg-rose-900/90 text-rose-200 border border-rose-700'
        }`}>
          {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" /> : <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />}
          <span>{notification.text}</span>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar Nav */}
        <div className="md:col-span-1 space-y-2">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 shadow-sm">
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'dashboard' ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Radio className="w-4 h-4" />
                Обзор и Статус
              </button>
              <button
                onClick={() => setActiveTab('scanner')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'scanner' ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <ListMusic className="w-4 h-4" />
                Парсер треков (Live)
              </button>
              <button
                onClick={() => setActiveTab('config')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'config' ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4" />
                Настройки и Секреты
              </button>
              <button
                onClick={() => setActiveTab('logs')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'logs' ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Terminal className="w-4 h-4" />
                История и Логи
              </button>
              <button
                onClick={() => setActiveTab('guide')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'guide' ? 'bg-violet-600 text-white shadow-md shadow-violet-600/30' : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <HelpCircle className="w-4 h-4" />
                Запуск в Python
              </button>
            </nav>
          </div>

          {/* Quick Info Box */}
          <div className="bg-gradient-to-br from-violet-950/40 to-slate-900 border border-violet-900/30 rounded-2xl p-4 text-xs text-slate-300 space-y-2">
            <div className="font-semibold text-violet-300 flex items-center gap-1.5">
              <Cpu className="w-4 h-4 text-violet-400" />
              Статус парсера @leaksffm
            </div>
            <p className="leading-relaxed text-slate-400">
              Бот успешно обходит ограничения Telegram Web Preview благодаря ротации заголовков User-Agent и резервному пулу релизов.
            </p>
          </div>
        </div>

        {/* Content Area */}
        <div className="md:col-span-3 space-y-6">
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-sm">
                  <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Канал назначения</div>
                  <div className="text-xl font-bold text-white truncate">{config.telegram_channel_id || 'Не задан'}</div>
                  <div className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Автопостинг с фото
                  </div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-sm">
                  <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Источники парсинга</div>
                  <div className="text-xl font-bold text-white">4 источника</div>
                  <div className="text-xs text-violet-400 mt-2">@leaksffm, @novinki_muzyk...</div>
                </div>
                <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl shadow-sm">
                  <div className="text-slate-400 text-xs font-medium uppercase tracking-wider mb-1">Опубликовано треков</div>
                  <div className="text-xl font-bold text-white">{publishedTracks.length}</div>
                  <div className="text-xs text-slate-400 mt-2">В базе state/music_state.csv</div>
                </div>
              </div>

              {/* Quick Actions Panel */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                  <Play className="w-5 h-5 text-violet-400" />
                  Управление и тестирование бота
                </h3>
                <p className="text-sm text-slate-400">
                  Вы можете запустить полный цикл парсинга и отправки треков в Telegram прямо отсюда или проверить отправку тестового поста с обложкой.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={runBot}
                    disabled={loading}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-md shadow-violet-600/20"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Запустить цикл бота
                  </button>
                  <button
                    onClick={testTelegramSend}
                    disabled={loading}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border border-slate-700"
                  >
                    <Send className="w-4 h-4" />
                    Тест отправки в Telegram
                  </button>
                  <button
                    onClick={() => setActiveTab('scanner')}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-xl text-sm font-medium transition-all border border-slate-700"
                  >
                    <ListMusic className="w-4 h-4" />
                    Проверить треки в @leaksffm
                  </button>
                </div>
              </div>

              {/* Console Logs Preview */}
              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-violet-400" />
                    Последние события и логи бота
                  </h3>
                  <button 
                    onClick={() => setActiveTab('logs')}
                    className="text-xs text-violet-400 hover:text-violet-300 font-medium"
                  >
                    Все логи →
                  </button>
                </div>
                <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-1.5 max-h-48 overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="text-slate-500 italic">Логи пусты. Нажмите «Запустить цикл бота» для начала работы.</div>
                  ) : (
                    logs.map((log, idx) => (
                      <div key={idx} className="border-b border-slate-900 pb-1">{log}</div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scanner' && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Парсер Telegram каналов в реальном времени</h3>
                  <p className="text-sm text-slate-400">Проверьте, какие треки сейчас доступны для парсинга на @leaksffm и других источниках.</p>
                </div>
                <div className="flex items-center gap-2">
                  <select 
                    value={testChannel} 
                    onChange={e => setTestChannel(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                  >
                    <option value="leaksffm">@leaksffm</option>
                    <option value="novinki_muzyk">@novinki_muzyk</option>
                    <option value="newtracks">@newtracks</option>
                    <option value="leakspremiere">@leakspremiere</option>
                  </select>
                  <button
                    onClick={parseChannels}
                    disabled={scanning}
                    className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md shadow-violet-600/20"
                  >
                    {scanning ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Спарсить
                  </button>
                </div>
              </div>

              {scannedChannels.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-500">
                  Нажмите кнопку «Спарсить», чтобы загрузить свежие треки из Telegram.
                </div>
              ) : (
                <div className="space-y-4">
                  {scannedChannels.map((res, idx) => (
                    <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <Radio className="w-4 h-4 text-violet-400" />
                          канал: @{res.channel}
                        </div>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${res.count > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                          Найдено треков: {res.count}
                        </span>
                      </div>
                      
                      {res.tracks && res.tracks.length > 0 ? (
                        <div className="space-y-2 mt-2">
                          {res.tracks.map((t: any, i: number) => (
                            <div key={i} className="bg-slate-900 border border-slate-800 p-3 rounded-lg text-xs space-y-1">
                              <div className="text-slate-200 font-medium">{t.text}</div>
                              <div className="text-slate-400 flex items-center justify-between pt-1 text-[11px]">
                                <span>Язык: {t.is_ru ? 'RU (Русский)' : 'EN (Иностранный)'}</span>
                                <span className="text-violet-400">ID: {t.post_id}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-amber-300/80 bg-amber-950/20 border border-amber-900/30 p-3 rounded-lg">
                          Треки через веб-превью не получены (возможно, канал пуст или требуется авторизация). Скрипт использует встроенный резервный пул горячих релизов, чтобы автопостинг не останавливался.
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'config' && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">Настройки и секреты бота</h3>
                <p className="text-sm text-slate-400">Укажите токен Telegram бота и ID вашего канала для автоматической публикации.</p>
              </div>

              <form onSubmit={saveConfig} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Telegram Bot Token</label>
                    <input
                      type="password"
                      value={config.telegram_bot_token}
                      onChange={e => setConfig({...config, telegram_bot_token: e.target.value})}
                      placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Telegram Channel ID</label>
                    <input
                      type="text"
                      value={config.telegram_channel_id}
                      onChange={e => setConfig({...config, telegram_channel_id: e.target.value})}
                      placeholder="@my_channel_username"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Unsplash Access Key (для обложек)</label>
                    <input
                      type="password"
                      value={config.unsplash_access_key}
                      onChange={e => setConfig({...config, unsplash_access_key: e.target.value})}
                      placeholder="DEMO_KEY или ваш ключ Unsplash"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Интервал проверки (часы)</label>
                    <input
                      type="number"
                      value={config.interval_hours}
                      onChange={e => setConfig({...config, interval_hours: Number(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-violet-500"
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-violet-600/25 transition-all"
                  >
                    Сохранить настройки
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-white">История опубликованных треков</h3>
                <p className="text-sm text-slate-400">Список ID постов, уже опубликованных ботом (сохраняется в state/music_state.csv).</p>
              </div>

              {publishedTracks.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl text-slate-500">
                  История публикаций пуста.
                </div>
              ) : (
                <div className="space-y-2">
                  {publishedTracks.map((item, idx) => (
                    <div key={idx} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between text-xs">
                      <div className="font-mono text-violet-300 font-semibold">{item.post_id}</div>
                      <div className="text-slate-400">Дата: {new Date(item.upload_date).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'guide' && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <FileText className="w-5 h-5 text-violet-400" />
                    Готовый ZIP-архив для GitHub
                  </h3>
                  <p className="text-sm text-slate-400">Скачайте архив со всеми скриптами, конфигурацией и GitHub Actions воркфлоу.</p>
                </div>
                <a
                  href="/music_bot_github.zip"
                  download="music_bot_github.zip"
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-emerald-600/20 transition-all text-center justify-center"
                >
                  📥 Скачать ZIP архив
                </a>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-violet-400" />
                  Инструкция по запуску music_bot.py
                </h3>
                <p className="text-sm text-slate-400">Как запустить скрипт локально или настроить автозапуск 24/7.</p>
              </div>

              <div className="space-y-4 text-sm text-slate-300">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="font-semibold text-white">1. Установите зависимости Python:</div>
                  <pre className="bg-slate-900 p-3 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto">
pip install requests beautifulsoup4
                  </pre>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="font-semibold text-white">2. Задайте переменные окружения (.env):</div>
                  <pre className="bg-slate-900 p-3 rounded-lg font-mono text-xs text-violet-300 overflow-x-auto">
export TELEGRAM_BOT_TOKEN="ваш_токен_бота"
export TELEGRAM_CHANNEL_ID="@ваш_канал"
                  </pre>
                </div>

                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-2">
                  <div className="font-semibold text-white">3. Запустите скрипт командой:</div>
                  <pre className="bg-slate-900 p-3 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto">
python3 music_bot.py
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
