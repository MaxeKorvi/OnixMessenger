/* Onix appearance — lightweight wallpapers without repeated reflows */
(function () {
  'use strict';

  const LS_KEY = 'onix_custom_wallpaper_v2';
  const LEGACY_LS_KEY = 'onix_custom_wallpaper_v1';
  const DB_NAME = 'onix_wallpaper_store_v2';
  const STORE_NAME = 'wallpapers';
  const THEME_KEY = 'onix_chat_theme_v1';
  const PRESET_WALLPAPERS = [
    { id: 'default', name: 'По умолчанию', css: 'none', isDefault: true },
    { id: 'preset-1', name: 'Океан', css: 'linear-gradient(135deg, #1e3a5f, #2a5ca8)' },
    { id: 'preset-2', name: 'Лес', css: 'linear-gradient(135deg, #1b3a24, #2d6a3f)' },
    { id: 'preset-3', name: 'Закат', css: 'linear-gradient(135deg, #4c1d24, #8b2a3a)' },
    { id: 'preset-4', name: 'Фиолет', css: 'linear-gradient(135deg, #3c1e5a, #6a3ba0)' },
    { id: 'preset-5', name: 'Тёмный', css: 'linear-gradient(135deg, #0f172a, #334155)' },
    { id: 'preset-6', name: 'Ночь', css: 'linear-gradient(135deg, #1a1a2e, #16213e)' }
  ];
  const CHAT_THEMES = [
    { id: 'default', name: 'Обычная', bg: '', preview: 'linear-gradient(135deg, #171520, #211D2D)' },
    { id: 'light', name: 'Светлая', bg: '#F0F2F5', preview: '#F0F2F5' },
    { id: 'blue', name: 'Синяя', bg: '#1e3a5f', preview: 'linear-gradient(135deg, #1e3a5f, #2a5ca8)' },
    { id: 'green', name: 'Зелёная', bg: '#1b3a24', preview: 'linear-gradient(135deg, #1b3a24, #2d6a3f)' },
    { id: 'dark-blue', name: 'Тёмно-синяя', bg: '#0f172a', preview: 'linear-gradient(135deg, #0f172a, #1e3a5f)' },
    { id: 'purple', name: 'Фиолетовая', bg: '#2d1b4e', preview: 'linear-gradient(135deg, #2d1b4e, #4a2d82)' }
  ];

  let dbPromise = null;
  let appliedObjectUrl = '';
  let applyToken = 0;

  function safeJson(raw) {
    try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; }
  }

  function getStoredWallpaper() {
    const current = safeJson(localStorage.getItem(LS_KEY));
    if (current && typeof current === 'object') return current;
    // Read an old selection for compatibility, but never write a large data URL
    // back into localStorage.
    const legacy = safeJson(localStorage.getItem(LEGACY_LS_KEY));
    if (!legacy || typeof legacy !== 'object') return null;
    return legacy;
  }

  function storeWallpaper(value) {
    try {
      if (!value || value.id === 'default') localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, JSON.stringify(value));
      return true;
    } catch (_) {
      window.toast?.('Недостаточно места для настроек обоев');
      return false;
    }
  }

  function openDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    });
    return dbPromise;
  }

  async function putBlob(ref, blob) {
    const db = await openDb();
    if (!db || !ref || !blob) return false;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(blob, ref);
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    });
  }

  async function getBlob(ref) {
    const db = await openDb();
    if (!db || !ref) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(ref);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => resolve(null);
    });
  }

  function toUrlCss(value) {
    const url = String(value || '').replaceAll('"', '%22');
    return url ? `url("${url}")` : '';
  }

  async function resolveWallpaperCss(data) {
    if (!data || data.id === 'default' || data.css === 'none') return '';
    if (data.type === 'local' && data.ref) {
      const blob = await getBlob(data.ref);
      if (!blob) return '';
      if (appliedObjectUrl) URL.revokeObjectURL(appliedObjectUrl);
      appliedObjectUrl = URL.createObjectURL(blob);
      return toUrlCss(appliedObjectUrl);
    }
    if (data.type === 'url') return toUrlCss(data.url || data.value);
    return String(data.css || '');
  }

  async function applyWallpaper(data = getStoredWallpaper()) {
    const token = ++applyToken;
    const css = await resolveWallpaperCss(data);
    if (token !== applyToken) return false;

    const root = document.documentElement;
    const body = document.body;
    if (!css) {
      body.classList.remove('has-chat-wallpaper', 'has-custom-wallpaper');
      root.style.removeProperty('--chat-wallpaper-image');
      body.style.removeProperty('--chat-wallpaper-image');
      return false;
    }
    root.style.setProperty('--chat-wallpaper-image', css);
    body.style.setProperty('--chat-wallpaper-image', css);
    body.classList.add('has-chat-wallpaper');
    body.classList.toggle('has-custom-wallpaper', data?.id === 'custom' || data?.type === 'local' || data?.isCustom === true);
    return true;
  }

  async function compressImage(file) {
    if (!(file instanceof Blob)) throw new Error('invalid image');
    // Bitmap decoding and toBlob are asynchronous; no base64 conversion or
    // synchronous localStorage write blocks the chat UI.
    let bitmap = null;
    try {
      if ('createImageBitmap' in window) bitmap = await createImageBitmap(file);
      if (!bitmap) throw new Error('bitmap unavailable');
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d', { alpha: false }).drawImage(bitmap, 0, 0, width, height);
      const result = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
      bitmap.close?.();
      return result || file;
    } catch (_) {
      bitmap?.close?.();
      return file;
    }
  }

  async function saveLocalImage(file, scope = 'wallpaper') {
    if (!file || !String(file.type || '').startsWith('image/')) throw new Error('not image');
    if (file.size > 20 * 1024 * 1024) throw new Error('too large');
    const blob = await compressImage(file);
    const ref = `${scope}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    if (!(await putBlob(ref, blob))) throw new Error('storage unavailable');
    return { id: 'custom', type: 'local', ref, name: file.name || 'Свои обои', isCustom: true };
  }

  function setWallpaperStatus(text) {
    const status = document.getElementById('wallpaperStatus');
    if (status) status.textContent = text;
  }

  function renderWallpaperPreview(config) {
    const preview = document.getElementById('wallpaperPreview');
    if (!preview) return;
    preview.classList.toggle('has-image', Boolean(config && config.id !== 'default'));
    resolveWallpaperCss(config).then((css) => {
      if (!preview.isConnected) return;
      preview.style.backgroundImage = css || '';
    });
  }

  function applyChatTheme(themeId = localStorage.getItem(THEME_KEY) || 'default') {
    const selected = CHAT_THEMES.some((theme) => theme.id === themeId) ? themeId : 'default';
    localStorage.setItem(THEME_KEY, selected);
    const layout = document.getElementById('messenger');
    if (layout) layout.dataset.globalChatTheme = selected;
    document.querySelectorAll('.theme-option-card').forEach((item) => item.classList.toggle('active', item.dataset.theme === selected));
    return selected;
  }

  function createWallpaperUI() {
    const page = document.querySelector('[data-page="appearance"]');
    if (!page || page.querySelector('.appearance-wallpaper-card')) return;
    const current = getStoredWallpaper();
    const card = document.createElement('div');
    card.className = 'setting-card appearance-wallpaper-card';
    card.innerHTML = `
      <div class="range-title" style="margin-bottom:2px"><h3>Обои чата</h3><b id="wallpaperStatus">${current?.name || 'По умолчанию'}</b></div>
      <p class="appearance-enhanced-hint" style="margin-bottom:8px">Выберите фон для диалогов или загрузите свою картинку. Файл хранится локально без лагов и переполнения localStorage.</p>
      <div class="wallpaper-preview-area" id="wallpaperPreview"><span class="preview-label">Предпросмотр</span></div>
      <div class="wallpaper-actions">
        <label class="secondary-button compact" style="cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
          <input type="file" id="wallpaperFileInput" accept="image/*" hidden>
          <svg class="svg-icon" style="width:16px;height:16px"><use href="#i-image"></use></svg>Загрузить своё
        </label>
        <button class="secondary-button compact" type="button" id="removeWallpaperBtn">Убрать</button>
      </div>
      <div style="margin-top:4px"><small style="color:var(--muted);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em">Пресеты</small><div class="wallpaper-presets" id="wallpaperPresets"></div></div>
    `;
    const firstCard = page.querySelector('.setting-card');
    firstCard?.parentNode?.insertBefore(card, firstCard.nextSibling);
    if (!card.isConnected) page.appendChild(card);

    const presets = card.querySelector('#wallpaperPresets');
    PRESET_WALLPAPERS.forEach((preset) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `wallpaper-preset ${preset.id === current?.id ? 'active' : ''} ${preset.isDefault ? 'default-preset' : ''}`;
      button.title = preset.name;
      if (preset.isDefault) button.textContent = 'Default';
      else button.style.background = preset.css;
      button.addEventListener('click', async () => {
        const next = preset.isDefault ? null : { id: preset.id, name: preset.name, css: preset.css };
        storeWallpaper(next);
        await applyWallpaper(next);
        renderWallpaperPreview(next);
        presets.querySelectorAll('.wallpaper-preset').forEach((item) => item.classList.toggle('active', item === button));
        setWallpaperStatus(preset.name);
      });
      presets.appendChild(button);
    });

    card.querySelector('#wallpaperFileInput')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      setWallpaperStatus('Подготавливаем…');
      try {
        const next = await saveLocalImage(file, 'chat-wallpaper');
        storeWallpaper(next);
        await applyWallpaper(next);
        renderWallpaperPreview(next);
        presets.querySelectorAll('.wallpaper-preset').forEach((item) => item.classList.remove('active'));
        setWallpaperStatus(file.name.length > 22 ? `${file.name.slice(0, 22)}…` : file.name);
      } catch (error) {
        setWallpaperStatus(current?.name || 'По умолчанию');
        window.toast?.(error?.message === 'too large' ? 'Изображение больше 20 МБ' : 'Не удалось сохранить обои');
      }
    });
    card.querySelector('#removeWallpaperBtn')?.addEventListener('click', async () => {
      storeWallpaper(null);
      await applyWallpaper(null);
      renderWallpaperPreview(null);
      presets.querySelectorAll('.wallpaper-preset').forEach((item) => item.classList.toggle('active', item.classList.contains('default-preset')));
      setWallpaperStatus('По умолчанию');
    });
    renderWallpaperPreview(current);
  }

  function createChatThemeUI() {
    const page = document.querySelector('[data-page="appearance"]');
    if (!page || page.querySelector('.appearance-theme-card')) return;
    const selected = localStorage.getItem(THEME_KEY) || 'default';
    const card = document.createElement('div');
    card.className = 'setting-card appearance-theme-card';
    card.innerHTML = `<div class="range-title" style="margin-bottom:2px"><h3>Тема чата</h3><b id="themeStatus">${(CHAT_THEMES.find((item) => item.id === selected) || CHAT_THEMES[0]).name}</b></div><p class="appearance-enhanced-hint" style="margin-bottom:8px">Цвет фона сообщений. Обои имеют приоритет и не сбрасывают тему.</p><div class="theme-options-grid" id="themeOptionsGrid"></div>`;
    const wallpaperCard = page.querySelector('.appearance-wallpaper-card');
    wallpaperCard?.parentNode?.insertBefore(card, wallpaperCard.nextSibling);
    if (!card.isConnected) page.appendChild(card);
    const grid = card.querySelector('#themeOptionsGrid');
    CHAT_THEMES.forEach((theme) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `theme-option-card ${theme.id === selected ? 'active' : ''}`;
      button.dataset.theme = theme.id;
      button.innerHTML = `<div class="theme-option-preview" style="background:${theme.preview}"></div><b>${theme.name}</b>`;
      button.addEventListener('click', () => {
        applyChatTheme(theme.id);
        card.querySelector('#themeStatus').textContent = theme.name;
      });
      grid.appendChild(button);
    });
  }

  function ensureAppearanceCards() {
    // Global "Theme chat" card is intentionally omitted. Themes are changed
    // per dialog/channel from its own Appearance action, like Telegram.
    document.querySelectorAll('.appearance-theme-card').forEach((card) => card.remove());
    createWallpaperUI();
  }

  function init() {
    applyWallpaper();
    document.getElementById('messenger')?.removeAttribute('data-global-chat-theme');
    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-settings-page="appearance"], [data-drawer-action="settings"]')) {
        requestAnimationFrame(ensureAppearanceCards);
      }
    });
    document.addEventListener('DOMContentLoaded', () => {
      ensureAppearanceCards();
      applyWallpaper();
    }, { once: true });
  }

  window.__onixAppearance = {
    applyWallpaper,
    getStoredWallpaper,
    saveLocalImage,
    resolveWallpaperCss,
    applyChatTheme,
    PRESET_WALLPAPERS,
    CHAT_THEMES
  };
  init();
})();
