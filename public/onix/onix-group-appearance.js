/* Onix group appearance — Telegram-like group styling, with local/offline fallback. */
(function () {
  'use strict';

  const GROUP_COLORS = [
    '#d6504b', '#d77b21', '#8d58cb', '#299e27', '#3aa8b8', '#3989d0', '#bd4b83', '#99a8b6',
    '#eb726d', '#e9a83f', '#d974db', '#82c74e', '#58beca', '#67b5e4', '#e6849a', '#c0cbd5'
  ];
  const BACKGROUND_EMOJIS = ['😀', '😂', '🥰', '😍', '🤩', '😎', '🥳', '😭', '❤️', '🔥', '⭐', '🎉', '✨', '💎', '👑', '🎊', '💥', '🌟', '💫', '🎨', '🌈', '💜', '💙', '💚'];
  const WALLPAPERS = [
    { name: 'Океан', css: 'linear-gradient(135deg, #1e3a5f, #2a5ca8)' },
    { name: 'Лес', css: 'linear-gradient(135deg, #1b3a24, #2d6a3f)' },
    { name: 'Закат', css: 'linear-gradient(135deg, #4c1d24, #8b2a3a)' },
    { name: 'Фиолет', css: 'linear-gradient(135deg, #3c1e5a, #6a3ba0)' },
    { name: 'Ночь', css: 'linear-gradient(135deg, #0f172a, #334155)' },
    { name: 'Аметист', css: 'linear-gradient(135deg, #2d1b4e, #4a2d82)' }
  ];
  const EMOJI_PACKS = [
    { id: '', name: 'Нет', preview: '—' },
    { id: 'classic', name: 'Классика', preview: '😀 ❤️ 🔥' },
    { id: 'party', name: 'Праздник', preview: '🎉 🥳 ✨' },
    { id: 'nature', name: 'Природа', preview: '🌿 🌈 🌙' }
  ];
  let applyToken = 0;

  const html = (value) => typeof window.escapeHtml === 'function'
    ? window.escapeHtml(value)
    : String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));

  function participantCount(chat) {
    if (Array.isArray(chat?.members)) return Math.max(1, chat.members.length);
    const fromStatus = String(chat?.status || '').match(/(\d[\d\s.,]*)/);
    return fromStatus ? Number(fromStatus[1].replace(/[^\d]/g, '')) || 0 : 0;
  }

  function participantLabel(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    const word = mod10 === 1 && mod100 !== 11 ? 'участник' : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? 'участника' : 'участников';
    return `${Number(count || 0).toLocaleString('ru-RU')} ${word}`;
  }

  function normaliseAppearance(chat) {
    const legacyWallpaper = chat.wallpaper || chat.groupWallpaper || '';
    const appearance = chat.appearance && typeof chat.appearance === 'object' ? { ...chat.appearance } : {};
    return {
      color: appearance.color || chat.groupColor || chat.color || '#3989d0',
      backgroundEmoji: appearance.backgroundEmoji || chat.bgEmoji || '',
      emojiStatus: appearance.emojiStatus || chat.emojiStatus || '',
      emojiPack: appearance.emojiPack || chat.emojiPack || '',
      wallpaper: appearance.wallpaper || (legacyWallpaper ? { type: legacyWallpaper.startsWith('linear-gradient(') ? 'css' : 'url', [legacyWallpaper.startsWith('linear-gradient(') ? 'css' : 'url']: legacyWallpaper.replace(/^url\((.*)\)$/i, '$1') } : null)
    };
  }

  function cloneAppearance(appearance) {
    return JSON.parse(JSON.stringify(appearance || {}));
  }

  function appearanceWallpaperCss(wallpaper) {
    if (!wallpaper) return Promise.resolve('');
    if (wallpaper.type === 'css') return Promise.resolve(String(wallpaper.css || ''));
    if (wallpaper.type === 'url') {
      const url = String(wallpaper.url || '');
      return Promise.resolve(url ? `url("${url.replaceAll('"', '%22')}")` : '');
    }
    if (wallpaper.type === 'local' && window.__onixAppearance?.resolveWallpaperCss) {
      return window.__onixAppearance.resolveWallpaperCss(wallpaper);
    }
    return Promise.resolve('');
  }

  async function applyActiveGroupAppearance(chat) {
    const layout = document.getElementById('messenger');
    const messages = document.getElementById('messages');
    if (!layout || !messages) return;
    const token = ++applyToken;
    const isGroup = Boolean(chat && ['group', 'channel'].includes(chat.type));
    layout.classList.toggle('has-group-appearance', isGroup);
    if (!isGroup) {
      layout.classList.remove('has-group-wallpaper');
      layout.style.removeProperty('--group-wallpaper-image');
      layout.style.removeProperty('--group-accent');
      document.querySelectorAll('.group-status-chip, .group-avatar-background-emoji').forEach((node) => node.remove());
      return;
    }

    const appearance = normaliseAppearance(chat);
    layout.style.setProperty('--group-accent', appearance.color);
    const css = await appearanceWallpaperCss(appearance.wallpaper);
    if (token !== applyToken || String(window.state?.activeChatId || '') !== String(chat.id)) return;
    layout.classList.toggle('has-group-wallpaper', Boolean(css));
    if (css) layout.style.setProperty('--group-wallpaper-image', css);
    else layout.style.removeProperty('--group-wallpaper-image');

    const addStatus = (selector) => {
      const title = document.querySelector(selector);
      title?.querySelector('.group-status-chip')?.remove();
      if (appearance.emojiStatus && title) {
        const badge = document.createElement('span');
        badge.className = 'group-status-chip';
        badge.textContent = appearance.emojiStatus;
        badge.title = 'Эмодзи-статус группы';
        title.appendChild(badge);
      }
    };
    addStatus('#activeTitle');
    addStatus('#infoTitle');

    const avatar = document.getElementById('activeAvatar');
    avatar?.querySelector('.group-avatar-background-emoji')?.remove();
    if (appearance.backgroundEmoji && avatar) {
      const emoji = document.createElement('span');
      emoji.className = 'group-avatar-background-emoji';
      emoji.textContent = appearance.backgroundEmoji;
      avatar.appendChild(emoji);
    }
  }

  function levelPill(level) {
    return `<small class="ga-level-pill">🔒 Уровень ${level}</small>`;
  }

  function groupAvatar(chat, appearance) {
    const title = chat.title || 'Группа';
    const image = chat.avatarData || (String(chat.avatar || '').startsWith('data:') ? chat.avatar : '');
    const label = image ? `<img src="${html(image)}" alt="">` : html(chat.avatar || title[0] || 'Г');
    return `<div class="ga-avatar" style="--ga-color:${html(appearance.color)}">${label}${appearance.backgroundEmoji ? `<span>${html(appearance.backgroundEmoji)}</span>` : ''}</div>`;
  }

  function row(icon, title, description, value, action) {
    return `<button type="button" class="ga-row" data-ga-action="${action}">
      <span class="ga-row-icon">${icon}</span>
      <span class="ga-row-text"><b>${title}</b><small>${description}</small></span>
      <span class="ga-row-value">${value}</span><i class="ga-chevron">›</i>
    </button>`;
  }

  function openMain(chat, draft) {
    const participants = participantCount(chat);
    const wallpaperName = draft.wallpaper?.name || (draft.wallpaper?.type === 'css' ? 'Выбраны' : draft.wallpaper?.type === 'url' || draft.wallpaper?.type === 'local' ? 'Свои' : 'Нет');
    const pack = EMOJI_PACKS.find((item) => item.id === draft.emojiPack);
    const selectedColor = GROUP_COLORS.includes(draft.color) ? draft.color : GROUP_COLORS[5];
    const content = `
      <section class="group-appearance-modal">
        <header class="ga-header">
          ${groupAvatar(chat, draft)}
          <div class="ga-group-name"><h3>📌 ${html(chat.title || 'Группа')} ${draft.emojiStatus ? html(draft.emojiStatus) : ''}</h3><small>${participants ? participantLabel(participants) : 'Участники'}</small></div>
          <p class="ga-votes">У группы ${Number(chat.boosts || chat.votes || 0)} голосов. <a href="#" data-ga-votes>Подробнее о голосах</a></p>
        </header>
        <div class="ga-colors" aria-label="Цвет профиля">
          ${GROUP_COLORS.map((color) => `<button type="button" class="ga-color-btn ${color === selectedColor ? 'active' : ''}" data-group-color="${color}" aria-label="Цвет" style="--ga-color:${color}"></button>`).join('')}
        </div>
        <div class="ga-rows">
          ${row('🖼️', 'Фоновый эмодзи', 'Вы можете выбрать цвет и фоновый эмодзи для профиля группы.', `${draft.backgroundEmoji ? `<b class="ga-emoji-value">${html(draft.backgroundEmoji)}</b>` : 'Нет'} ${levelPill(5)}`, 'backgroundEmoji')}
          ${row('〽️', 'Эмодзи-статус группы', 'Вы можете выбрать статус, который будет отображаться рядом с названием группы.', `${draft.emojiStatus ? `<b class="ga-emoji-value">${html(draft.emojiStatus)}</b>` : 'Нет'} ${levelPill(8)}`, 'emojiStatus')}
          ${row('🖼', 'Обои в группе', 'Вы можете установить в группе обои, которые будут видны всем, кто её просматривает.', `${html(wallpaperName)} ${levelPill(10)}`, 'wallpaper')}
          ${row('😊', 'Набор эмодзи группы', 'Вы можете выбрать набор эмодзи, который будет доступен всем участникам в этой группе.', `${html(pack?.name || 'Нет')} ${levelPill(4)}`, 'emojiPack')}
        </div>
        <button type="button" class="primary-button ga-apply-button" data-ga-action="apply">Применить стиль</button>
      </section>`;
    window.openSimpleModal?.('Оформление', content, { resetHistory: true });
    const modal = document.getElementById('simpleModal');
    if (!modal) return;

    modal.querySelectorAll('[data-group-color]').forEach((button) => button.addEventListener('click', () => {
      draft.color = button.dataset.groupColor;
      openMain(chat, draft);
    }));
    modal.querySelector('[data-ga-action="backgroundEmoji"]')?.addEventListener('click', () => openEmojiPicker(chat, draft, 'backgroundEmoji'));
    modal.querySelector('[data-ga-action="emojiStatus"]')?.addEventListener('click', () => openEmojiPicker(chat, draft, 'emojiStatus'));
    modal.querySelector('[data-ga-action="wallpaper"]')?.addEventListener('click', () => openWallpaperPicker(chat, draft));
    modal.querySelector('[data-ga-action="emojiPack"]')?.addEventListener('click', () => openEmojiPackPicker(chat, draft));
    modal.querySelector('[data-ga-action="apply"]')?.addEventListener('click', () => saveAppearance(chat, draft));
    modal.querySelector('[data-ga-votes]')?.addEventListener('click', (event) => {
      event.preventDefault();
      window.toast?.('Уровни оформления зависят от голосов за группу. В этой версии выбор доступен для настройки и предпросмотра.');
    });
  }

  function openEmojiPicker(chat, draft, field) {
    const title = field === 'backgroundEmoji' ? 'Фоновый эмодзи' : 'Эмодзи-статус';
    const content = `<section class="ga-picker"><p>${field === 'backgroundEmoji' ? 'Выберите эмодзи для аватара группы.' : 'Выберите эмодзи, который будет рядом с названием группы.'}</p><div class="ga-emoji-grid">${BACKGROUND_EMOJIS.map((emoji) => `<button type="button" data-ga-emoji="${emoji}" class="${draft[field] === emoji ? 'active' : ''}">${emoji}</button>`).join('')}</div><button type="button" class="secondary-button" data-ga-clear>Убрать</button><button type="button" class="secondary-button" data-ga-back>Назад</button></section>`;
    window.openSimpleModal?.(title, content, { resetHistory: true });
    const modal = document.getElementById('simpleModal');
    modal?.querySelectorAll('[data-ga-emoji]').forEach((button) => button.addEventListener('click', () => {
      draft[field] = button.dataset.gaEmoji || '';
      openMain(chat, draft);
    }));
    modal?.querySelector('[data-ga-clear]')?.addEventListener('click', () => { draft[field] = ''; openMain(chat, draft); });
    modal?.querySelector('[data-ga-back]')?.addEventListener('click', () => openMain(chat, draft));
  }

  function openEmojiPackPicker(chat, draft) {
    const content = `<section class="ga-picker"><p>Выберите набор, доступный участникам группы.</p><div class="ga-pack-list">${EMOJI_PACKS.map((pack) => `<button type="button" data-ga-pack="${pack.id}" class="${draft.emojiPack === pack.id ? 'active' : ''}"><b>${html(pack.name)}</b><span>${html(pack.preview)}</span></button>`).join('')}</div><button type="button" class="secondary-button" data-ga-back>Назад</button></section>`;
    window.openSimpleModal?.('Набор эмодзи группы', content, { resetHistory: true });
    const modal = document.getElementById('simpleModal');
    modal?.querySelectorAll('[data-ga-pack]').forEach((button) => button.addEventListener('click', () => {
      draft.emojiPack = button.dataset.gaPack || '';
      openMain(chat, draft);
    }));
    modal?.querySelector('[data-ga-back]')?.addEventListener('click', () => openMain(chat, draft));
  }

  function openWallpaperPicker(chat, draft) {
    const content = `<section class="ga-picker"><p>Выберите обои. При работе с сервером они синхронизируются для всех участников группы.</p><div class="ga-wallpaper-grid">${WALLPAPERS.map((wallpaper, index) => `<button type="button" data-ga-wallpaper="${index}" style="background:${wallpaper.css}" aria-label="${html(wallpaper.name)}"><span>${html(wallpaper.name)}</span></button>`).join('')}</div><label class="secondary-button ga-upload-label"><input id="gaWallpaperFile" type="file" accept="image/*" hidden>📎 Загрузить свои обои</label><button type="button" class="secondary-button ga-remove-wallpaper" data-ga-remove-wallpaper>Убрать обои</button><button type="button" class="secondary-button" data-ga-back>Назад</button></section>`;
    window.openSimpleModal?.('Обои в группе', content, { resetHistory: true });
    const modal = document.getElementById('simpleModal');
    modal?.querySelectorAll('[data-ga-wallpaper]').forEach((button) => button.addEventListener('click', () => {
      const wallpaper = WALLPAPERS[Number(button.dataset.gaWallpaper)];
      if (wallpaper) draft.wallpaper = { type: 'css', css: wallpaper.css, name: wallpaper.name };
      openMain(chat, draft);
    }));
    modal?.querySelector('[data-ga-remove-wallpaper]')?.addEventListener('click', () => { draft.wallpaper = null; openMain(chat, draft); });
    modal?.querySelector('[data-ga-back]')?.addEventListener('click', () => openMain(chat, draft));
    modal?.querySelector('#gaWallpaperFile')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const uploadLabel = modal.querySelector('.ga-upload-label');
      if (uploadLabel) uploadLabel.textContent = 'Подготавливаем обои…';
      try {
        let remote = null;
        if (window.canUseServerApi?.() && typeof window.uploadFileToServer === 'function') {
          remote = await window.uploadFileToServer(file, { status: false });
        }
        if (remote?.url && !String(remote.url).startsWith('data:')) {
          draft.wallpaper = { type: 'url', url: remote.url, name: file.name || 'Свои обои' };
        } else if (window.__onixAppearance?.saveLocalImage) {
          draft.wallpaper = await window.__onixAppearance.saveLocalImage(file, `group-${chat.id}`);
          draft.wallpaper.name = file.name || 'Свои обои';
        } else {
          throw new Error('storage unavailable');
        }
        openMain(chat, draft);
      } catch (_) {
        window.toast?.('Не удалось сохранить обои группы');
        openWallpaperPicker(chat, draft);
      }
    });
  }

  function serverAppearance(draft) {
    const out = {
      color: draft.color,
      backgroundEmoji: draft.backgroundEmoji || '',
      emojiStatus: draft.emojiStatus || '',
      emojiPack: draft.emojiPack || ''
    };
    if (draft.wallpaper?.type === 'css') out.wallpaper = { type: 'css', css: draft.wallpaper.css };
    if (draft.wallpaper?.type === 'url') out.wallpaper = { type: 'url', url: draft.wallpaper.url };
    return out;
  }

  async function saveAppearance(chat, draft) {
    if (typeof window.currentUserCanManage === 'function' && !window.currentUserCanManage(chat)) {
      window.toast?.('Менять оформление группы могут только администраторы');
      return;
    }
    const next = cloneAppearance(draft);
    chat.appearance = next;
    // Compatibility with existing chat cards and older local data.
    chat.groupColor = next.color;
    chat.color = next.color;
    chat.bgEmoji = next.backgroundEmoji;
    chat.emojiStatus = next.emojiStatus;
    chat.emojiPack = next.emojiPack;
    chat.wallpaper = next.wallpaper?.type === 'css' ? next.wallpaper.css : next.wallpaper?.url || '';
    if (next.wallpaper?.type === 'local') chat.localAppearance = next;
    else delete chat.localAppearance;

    window.persistChats?.();
    window.renderChats?.();
    window.renderActiveChat?.({ animate: false, focusComposer: false });
    window.closeSimpleModal?.();

    let synced = false;
    if (Number(chat.serverConversationId) > 0 && window.canUseServerApi?.() && typeof window.apiPost === 'function') {
      try {
        const result = await window.apiPost('v2/conversations/update', {
          conversation_id: Number(chat.serverConversationId),
          appearance: serverAppearance(next)
        });
        if (result?.ok) {
          if (result.data?.conversation?.appearance) chat.appearance = { ...next, ...result.data.conversation.appearance };
          synced = true;
          window.persistChats?.();
        }
      } catch (_) {}
    }
    window.toast?.(synced ? 'Стиль группы применён и синхронизирован' : 'Стиль группы применён');
  }

  function openGroupAppearanceModal(chat) {
    if (!chat || !['group', 'channel'].includes(chat.type)) {
      return window.openChatAppearanceModalOriginal?.(chat);
    }
    openMain(chat, cloneAppearance(chat.localAppearance || normaliseAppearance(chat)));
  }

  function patchRenderer() {
    if (typeof window.renderActiveChat !== 'function' || window.renderActiveChat.__groupAppearancePatched) return;
    const original = window.renderActiveChat;
    const patched = function patchedRenderActiveChat() {
      const result = original.apply(this, arguments);
      Promise.resolve(applyActiveGroupAppearance(window.activeChat?.() || window.state?.chats?.find((item) => item.id === window.state?.activeChatId))).catch(() => {});
      return result;
    };
    patched.__groupAppearancePatched = true;
    window.renderActiveChat = patched;
  }

  function patchAppearanceModal() {
    if (typeof window.openChatAppearanceModal !== 'function' || window.openChatAppearanceModal.__groupAppearancePatched) return;
    const original = window.openChatAppearanceModal;
    window.openChatAppearanceModalOriginal = original;
    window.openChatAppearanceModal = function patchedOpenChatAppearance(chat) {
      if (chat && ['group', 'channel'].includes(chat.type)) return openGroupAppearanceModal(chat);
      return original.apply(this, arguments);
    };
    window.openChatAppearanceModal.__groupAppearancePatched = true;
  }

  function install() {
    patchRenderer();
    patchAppearanceModal();
    const chat = window.activeChat?.() || window.state?.chats?.find((item) => item.id === window.state?.activeChatId);
    applyActiveGroupAppearance(chat).catch(() => {});
  }

  window.__groupAppearance = { open: openGroupAppearanceModal, apply: applyActiveGroupAppearance };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  setTimeout(install, 200);
})();
