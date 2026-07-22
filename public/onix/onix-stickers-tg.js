/* Onix Stickers — packs, sending, and Telegram-like sticker-pack navigation. */
(function () {
  'use strict';

  const ASSET_VERSION = '20260722-stickers-preview-v8';
  const ADDED_KEY = 'onix_added_sticker_packs_v1';
  const REMOVED_KEY = 'onix_removed_sticker_packs_v1';
  const CUSTOM_PACKS_KEY = 'onix_custom_sticker_packs_v2';
  let activeEmojiTab = 'emoji';
  let stickerRightPress = null;
  let suppressContextMenuUntil = 0;
  let suppressStickerClickUntil = 0;
  let contextMenuOpenedAt = 0;
  const STICKER_HOLD_PREVIEW_DELAY = 240;
  const STICKER_PACKS = [
    { id: 'Wolfi', name: 'Wolfi', emoji: '🐺', path: 'assets/stickers/Wolfi', count: 16, files: [] },
    { id: 'bunny', name: 'Кролики', emoji: '🐰', path: 'assets/stickers/bunny', count: 12, files: [] }
  ];

  STICKER_PACKS.forEach((pack) => {
    for (let index = 1; index <= pack.count; index += 1) {
      if (pack.id === 'Wolfi' && index === 9) continue;
      pack.files.push(`${pack.path}/sticker_${String(index).padStart(2, '0')}.png?v=${ASSET_VERSION}`);
    }
  });

  // The last 12 Wolfi stickers are stored in the emotions directory.
  // They are part of the same Telegram-style pack, not a separate pack.
  const wolfiPack = STICKER_PACKS.find((pack) => pack.id === 'Wolfi');
  for (let index = 1; index <= 12; index += 1) {
    wolfiPack.files.push(`assets/stickers/wolf-emotions/sticker_${String(index).padStart(2, '0')}.png?v=${ASSET_VERSION}`);
  }
  wolfiPack.count = wolfiPack.files.length;

  try {
    const customPacks = JSON.parse(localStorage.getItem(CUSTOM_PACKS_KEY) || '[]');
    customPacks.forEach((pack) => {
      if (!pack?.id || STICKER_PACKS.some((item) => item.id === pack.id)) return;
      STICKER_PACKS.push({
        id: pack.id,
        name: `${pack.name || 'Мой пак'} (мой)`,
        emoji: '⭐',
        path: '',
        count: pack.stickers?.length || pack.count || 0,
        files: Array.isArray(pack.stickers) ? pack.stickers : [],
        isCustom: true
      });
    });
  } catch (_) {}

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
  const canonicalUrl = (url = '') => String(url || '').split('#')[0].split('?')[0];
  const fileNameFromUrl = (url = '') => canonicalUrl(url).split('/').pop() || 'sticker.png';
  const packById = (id) => STICKER_PACKS.find((pack) => String(pack.id) === String(id)) || null;


  function stickerInfoFromTarget(target) {
    const pickerSticker = target?.closest?.('[data-sticker-url]');
    const messageSticker = target?.closest?.('[data-sticker-message]');
    const element = pickerSticker || messageSticker;
    if (!element) return null;
    const packId = pickerSticker?.dataset.packId || messageSticker?.dataset.stickerPackId || '';
    const url = pickerSticker?.dataset.stickerUrl || messageSticker?.dataset.stickerUrl || '';
    if (!url) return null;
    const pack = packById(packId) || {
      id: packId,
      name: messageSticker?.dataset.stickerPackName || 'Стикеры',
      count: 0,
      files: [url],
      isCustom: false
    };
    return { element, pickerSticker, messageSticker, url, pack, keepPanelOpen: Boolean(pickerSticker) };
  }

  function setStickerInteractionActive(active) {
    const enabled = Boolean(active);
    document.body.classList.toggle('onix-sticker-interaction-active', enabled);
    const attachMenu = document.getElementById('attachMenu');
    if (!attachMenu) return;
    if (enabled) attachMenu.dataset.stickerInteractionActive = '1';
    else delete attachMenu.dataset.stickerInteractionActive;
  }

  function syncStickerInteractionState() {
    setStickerInteractionActive(Boolean(
      document.getElementById('onixStickerContextMenu')
      || document.getElementById('onixStickerHoldPreview')
      || stickerRightPress
    ));
  }

  function showStickerHoldPreview(info) {
    if (!info?.url) return;
    closeStickerContextMenu();
    let preview = document.getElementById('onixStickerHoldPreview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'onixStickerHoldPreview';
      preview.className = 'onix-sticker-hold-preview';
      preview.innerHTML = `
        <div class="onix-sticker-hold-preview-card">
          <img alt="Предпросмотр стикера">
          <b></b>
        </div>`;
      document.body.appendChild(preview);
    }
    const image = preview.querySelector('img');
    const title = preview.querySelector('b');
    if (image && canonicalUrl(image.dataset.stickerUrl || '') !== canonicalUrl(info.url)) {
      image.dataset.stickerUrl = info.url;
      image.src = info.url;
    }
    if (title) title.textContent = info.pack?.name || 'Стикер';
    preview.classList.add('is-visible');
    setStickerInteractionActive(true);
  }

  function hideStickerHoldPreview() {
    document.getElementById('onixStickerHoldPreview')?.remove();
    syncStickerInteractionState();
  }

  function updateHoldPreviewAtPoint(clientX, clientY) {
    const hovered = document.elementFromPoint(clientX, clientY);
    const info = stickerInfoFromTarget(hovered);
    if (!info) return;
    if (stickerRightPress) stickerRightPress.info = info;
    showStickerHoldPreview(info);
  }

  function getRemovedPacks() {
    try {
      const result = JSON.parse(localStorage.getItem(REMOVED_KEY) || '[]');
      return Array.isArray(result) ? result.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function saveRemovedPacks(ids = []) {
    localStorage.setItem(REMOVED_KEY, JSON.stringify(Array.from(new Set(ids.map(String)))));
  }

  function isPackRemoved(packId) {
    return getRemovedPacks().includes(String(packId || ''));
  }

  function visiblePacks() {
    return STICKER_PACKS.filter((pack) => pack?.isCustom || !isPackRemoved(pack?.id));
  }

  function getAddedPacks() {
    try {
      const result = JSON.parse(localStorage.getItem(ADDED_KEY) || '[]');
      return Array.isArray(result) ? result : [];
    } catch (_) {
      return [];
    }
  }

  function hasPack(pack) {
    if (!pack) return false;
    if (pack.isCustom) return true;
    return !isPackRemoved(pack.id);
  }

  function addPackToAdded(packId) {
    if (!packId) return;
    const id = String(packId);
    const removed = getRemovedPacks().filter((item) => item !== id);
    saveRemovedPacks(removed);
    const packs = getAddedPacks().map(String);
    if (!packs.includes(id)) {
      packs.push(id);
      localStorage.setItem(ADDED_KEY, JSON.stringify(packs));
    }
  }

  function sendSticker(url, pack = null, options = {}) {
    const chat = window.state?.chats?.find((item) => item.id === window.state?.activeChatId);
    if (!chat) {
      window.toast?.('Сначала выберите чат');
      return;
    }
    const menu = document.getElementById('attachMenu');
    const stickerPanel = menu?.querySelector('[data-onix-emoji-panel="stickers"]');
    const keepStickerPanelOpen = Boolean(
      options.keepPanelOpen
      || (
        menu
        && !menu.classList.contains('hidden')
        && (stickerPanel?.classList.contains('active') || activeEmojiTab === 'stickers')
      )
    );
    const stickerScrollTop = Number(stickerPanel?.scrollTop || 0);
    // Фикс: если url это «голое» имя стикера (sticker_01.png),
    // принудительно подставляем префикс assets/stickers/Wolfi/.
    let finalUrl = String(url || '');
    if (/^sticker[_-]?\d{1,3}\.(?:png|webp|gif|svg)(\?|$)/i.test(finalUrl)
        && !/assets\/|api\/v2\/|https?:\/\//i.test(finalUrl)) {
      finalUrl = 'assets/stickers/Wolfi/' + finalUrl.split('?')[0];
    }
    const fileRecord = {
      id: `sticker-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      name: fileNameFromUrl(finalUrl),
      type: 'image/png',
      size: 0,
      url: finalUrl,
      dataUrl: String(finalUrl || '').startsWith('data:') ? finalUrl : '',
      sticker: true,
      stickerPackId: pack?.id || '',
      stickerPackName: pack?.name || '',
      stickerId: fileNameFromUrl(finalUrl),
      mediaStyle: { displayWidth: 180, radius: 0 }
    };
    window.closeSimpleModal?.();
    window.sendMessage?.('', [fileRecord]);
    if (keepStickerPanelOpen) {
      activeEmojiTab = 'stickers';
      const restorePanel = () => {
        const currentMenu = document.getElementById('attachMenu');
        if (!currentMenu) return;
        currentMenu.dataset.menuType = 'emoji';
        currentMenu.classList.remove('hidden');
        injectStickers(false);
        activateEmojiTab(currentMenu, 'stickers');
        const currentPanel = currentMenu.querySelector('[data-onix-emoji-panel="stickers"]');
        if (currentPanel) currentPanel.scrollTop = stickerScrollTop;
      };
      [0, 80, 220].forEach((delay) => window.setTimeout(restorePanel, delay));
    }
  }

  function openStickerPreview(url, pack, options = {}) {
    const stickerMenu = document.getElementById('attachMenu');
    const keepPanelOpen = Boolean(
      options.keepPanelOpen
      || (
        stickerMenu
        && !stickerMenu.classList.contains('hidden')
        && stickerMenu.querySelector('[data-onix-emoji-panel="stickers"].active')
      )
    );
    const packName = pack?.name || 'Стикеры';
    const added = hasPack(pack);
    const html = `
      <div class="sticker-preview-modal">
        <div class="sticker-preview-stage"><img src="${esc(url)}" alt="Стикер" class="sticker-preview-img"></div>
        <div class="sticker-preview-info"><b>${esc(packName)}</b><small>${pack?.count || ''} стикеров</small></div>
        <div class="sticker-preview-actions">
          ${added ? '' : '<button type="button" class="secondary-button" data-preview-action="add">Добавить</button>'}
          <button type="button" class="primary-button" data-preview-action="send">Отправить</button>
        </div>
      </div>`;
    window.openSimpleModal?.('', html, { resetHistory: false });
    const modal = document.getElementById('simpleModal');
    if (!modal) return;
    if (keepPanelOpen) {
      setStickerInteractionActive(true);
      modal.addEventListener('close', () => {
        setStickerInteractionActive(false);
        const currentMenu = document.getElementById('attachMenu');
        if (!currentMenu) return;
        currentMenu.dataset.menuType = 'emoji';
        currentMenu.classList.remove('hidden');
        injectStickers(false);
        activateEmojiTab(currentMenu, 'stickers');
      }, { once: true });
    }
    modal.querySelector('[data-preview-action="add"]')?.addEventListener('click', () => {
      addPackToAdded(pack?.id);
      window.toast?.(`Пак «${packName}» добавлен`);
      openStickerLibraryAt(pack, url);
    });
    modal.querySelector('[data-preview-action="send"]')?.addEventListener('click', () => sendSticker(url, pack, { keepPanelOpen }));
  }

  function openStickerLibraryAt(pack, stickerUrl = '') {
    if (!pack) return;
    window.closeSimpleModal?.();
    const emojiButton = document.getElementById('emojiButton');
    if (!emojiButton) return;
    if (document.getElementById('attachMenu')?.classList.contains('hidden')) emojiButton.click();
    setTimeout(() => {
      injectStickers();
      const menu = document.getElementById('attachMenu');
      menu?.querySelector('[data-emoji-tab="stickers"]')?.click();
      const section = menu?.querySelector(`[data-pack="${CSS.escape(String(pack.id))}"]`);
      const target = Array.from(section?.querySelectorAll('[data-sticker-url]') || []).find((button) =>
        canonicalUrl(button.dataset.stickerUrl) === canonicalUrl(stickerUrl)
      ) || section?.querySelector('[data-sticker-url]');
      if (!target) return;
      target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      target.classList.add('sticker-cell-target');
      setTimeout(() => target.classList.remove('sticker-cell-target'), 1600);
    }, 140);
  }

  function openStickerFromMessage(packId, stickerUrl, packName = '') {
    const pack = packById(packId);
    if (pack && hasPack(pack)) {
      openStickerLibraryAt(pack, stickerUrl);
      return;
    }
    const title = pack?.name || packName || 'Набор стикеров';
    const count = pack?.count || '';
    const html = `
      <div class="sticker-preview-modal sticker-pack-from-message">
        <div class="sticker-preview-stage"><img src="${esc(stickerUrl)}" alt="Стикер" class="sticker-preview-img"></div>
        <div class="sticker-preview-info"><b>${esc(title)}</b><small>${count ? `${count} стикеров` : 'Набор стикеров'}</small></div>
        <div class="sticker-preview-actions">
          ${pack ? '<button type="button" class="primary-button" data-message-sticker-action="add">Добавить</button>' : ''}
        </div>
      </div>`;
    window.openSimpleModal?.('', html, { resetHistory: false });
    const modal = document.getElementById('simpleModal');
    modal?.querySelector('[data-message-sticker-action="add"]')?.addEventListener('click', () => {
      addPackToAdded(pack.id);
      window.toast?.(`Пак «${pack.name}» добавлен`);
      openStickerLibraryAt(pack, stickerUrl);
    });
  }

  function buildStickersHTML() {
    const packs = visiblePacks();
    return `<div class="onix-stickers-root">${packs.map((pack) => {
      const added = hasPack(pack);
      return `<section class="onix-emoji-section onix-stickers-section" data-pack="${esc(pack.id)}">
        <h4 style="display:flex;align-items:center;justify-content:space-between;gap:8px"><span>${pack.emoji} ${esc(pack.name)}</span><small>${pack.count}${added ? ' • добавлен' : ''}</small></h4>
        <div class="onix-stickers-grid">${pack.files.map((url) => `<button type="button" data-sticker-url="${esc(url)}" data-pack-id="${esc(pack.id)}" class="sticker-cell" title="${esc(pack.name)}"><img src="${esc(url)}" alt="Стикер" loading="lazy"></button>`).join('')}</div>
      </section>`;
    }).join('')}
      <div class="onix-add-own-stickers-wrap">
        <button type="button" class="onix-add-own-stickers" data-add-own-stickers>Добавить свои стикеры</button>
      </div>
    </div>`;
  }

  function activateEmojiTab(menu, target) {
    activeEmojiTab = target === 'stickers' ? 'stickers' : 'emoji';
    const tabs = menu.querySelector('.onix-emoji-tabs');
    tabs?.querySelectorAll('[data-emoji-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.emojiTab === target);
    });
    menu.querySelectorAll('[data-onix-emoji-panel]').forEach((panel) => {
      const active = panel.dataset.onixEmojiPanel === target;
      panel.style.display = active ? '' : 'none';
      panel.classList.toggle('active', active);
    });
  }

  function injectStickers(force = false) {
    const menu = document.getElementById('attachMenu');
    if (!menu || menu.classList.contains('hidden')) return;
    const root = menu.querySelector('.onix-telegram-emoji') || menu;
    let tabs = menu.querySelector('.onix-emoji-tabs');
    const previousTab = tabs?.querySelector('[data-emoji-tab].active')?.dataset.emojiTab
      || menu.querySelector('[data-onix-emoji-panel].active')?.dataset.onixEmojiPanel
      || activeEmojiTab
      || 'emoji';

    if (!tabs) {
      tabs = document.createElement('div');
      tabs.className = 'onix-emoji-tabs';
      const first = root.querySelector('[data-onix-emoji-panel]') || root.firstElementChild;
      if (first?.parentElement) first.parentElement.insertBefore(tabs, first);
      else root.prepend(tabs);
    }
    if (tabs.dataset.stickerTabsVersion !== ASSET_VERSION) {
      tabs.dataset.stickerTabsVersion = ASSET_VERSION;
      tabs.innerHTML = '<button type="button" data-emoji-tab="emoji">Смайлы</button><button type="button" data-emoji-tab="stickers">Стикеры</button>';
      tabs.querySelectorAll('[data-emoji-tab]').forEach((button) => button.addEventListener('click', () => {
        activateEmojiTab(menu, button.dataset.emojiTab || 'emoji');
      }));
    }

    let panel = menu.querySelector('[data-onix-emoji-panel="stickers"]');
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'onix-emoji-scroll';
      panel.dataset.onixEmojiPanel = 'stickers';
      root.appendChild(panel);
    }
    if (force || panel.dataset.stickerPackVersion !== ASSET_VERSION) {
      panel.dataset.stickerPackVersion = ASSET_VERSION;
      panel.innerHTML = buildStickersHTML();
    }
    // Crucial: preserve the Sticker tab after observer callbacks. The old code
    // reset it to emoji on every DOM mutation, so the tab looked unopenable.
    activateEmojiTab(menu, previousTab === 'stickers' ? 'stickers' : 'emoji');
  }


  function upsertCustomPack(pack) {
    if (!pack?.id) return null;
    const nextPack = {
      id: String(pack.id),
      name: `${pack.name || 'Мой пак'} (мой)`,
      emoji: '⭐',
      path: '',
      count: Array.isArray(pack.stickers) ? pack.stickers.length : Number(pack.count || 0),
      files: Array.isArray(pack.stickers) ? pack.stickers.slice() : [],
      isCustom: true
    };
    const index = STICKER_PACKS.findIndex((item) => String(item?.id || '') === nextPack.id);
    if (index >= 0) STICKER_PACKS[index] = nextPack;
    else STICKER_PACKS.push(nextPack);

    const menu = document.getElementById('attachMenu');
    if (menu && !menu.classList.contains('hidden')) {
      activeEmojiTab = 'stickers';
      injectStickers(true);
      activateEmojiTab(menu, 'stickers');
    }
    return nextPack;
  }


  function removeStickerPack(pack) {
    if (!pack?.id) return;
    const id = String(pack.id);
    if (pack.isCustom) {
      try {
        const customPacks = JSON.parse(localStorage.getItem(CUSTOM_PACKS_KEY) || '[]');
        const next = Array.isArray(customPacks)
          ? customPacks.filter((item) => String(item?.id || '') !== id)
          : [];
        localStorage.setItem(CUSTOM_PACKS_KEY, JSON.stringify(next));
      } catch (_) {}
      const index = STICKER_PACKS.findIndex((item) => String(item.id) === id);
      if (index >= 0) STICKER_PACKS.splice(index, 1);
    } else {
      const removed = getRemovedPacks();
      if (!removed.includes(id)) removed.push(id);
      saveRemovedPacks(removed);
      const added = getAddedPacks().map(String).filter((item) => item !== id);
      localStorage.setItem(ADDED_KEY, JSON.stringify(added));
    }

    const menu = document.getElementById('attachMenu');
    if (menu && !menu.classList.contains('hidden')) {
      activeEmojiTab = 'stickers';
      injectStickers(true);
      activateEmojiTab(menu, 'stickers');
    }
    window.toast?.(`Стикерпак «${pack.name || 'Без названия'}» удалён`);
  }

  function requestDeleteStickerPack(pack) {
    if (!pack?.id) {
      window.toast?.('Стикерпак не найден');
      return;
    }
    const remove = () => removeStickerPack(pack);
    const confirmFn = typeof window.confirmAction === 'function'
      ? window.confirmAction
      : (typeof confirmAction === 'function' ? confirmAction : null);
    if (confirmFn) {
      confirmFn(
        'Удалить стикерпак?',
        `Удалить стикерпак «${pack.name || 'Без названия'}»?`,
        remove,
        { confirmText: 'Удалить', cancelText: 'Отмена', danger: true }
      );
      return;
    }
    if (window.confirm(`Удалить стикерпак «${pack.name || 'Без названия'}»?`)) remove();
  }

  function closeStickerContextMenu() {
    document.getElementById('onixStickerContextMenu')?.remove();
    syncStickerInteractionState();
  }

  function openStickerContextMenu(point, url, pack, keepPanelOpen = false) {
    closeStickerContextMenu();
    const menu = document.createElement('div');
    menu.id = 'onixStickerContextMenu';
    menu.className = 'onix-sticker-context-menu';
    menu.dataset.contextStickerUrl = String(url || '');
    menu.dataset.contextPackId = String(pack?.id || '');
    menu.innerHTML = `
      <button type="button" data-sticker-context-action="view">Посмотреть стикер</button>
      <button type="button" data-sticker-context-action="send">Отправить стикер</button>
      <button type="button" class="danger-item" data-sticker-context-action="delete">Удалить стикерпак</button>
    `;
    document.body.appendChild(menu);
    contextMenuOpenedAt = Date.now();
    setStickerInteractionActive(true);

    const rect = menu.getBoundingClientRect();
    const clientX = Number(point?.clientX || 0);
    const clientY = Number(point?.clientY || 0);
    const left = Math.min(Math.max(8, clientX), window.innerWidth - rect.width - 8);
    const top = Math.min(Math.max(8, clientY), window.innerHeight - rect.height - 8);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    const holdMenu = (menuEvent) => {
      menuEvent.stopPropagation();
      menuEvent.stopImmediatePropagation();
    };
    menu.addEventListener('pointerdown', holdMenu, true);
    menu.addEventListener('pointerup', holdMenu, true);
    menu.addEventListener('contextmenu', (menuEvent) => {
      menuEvent.preventDefault();
      holdMenu(menuEvent);
    }, true);
    menu.addEventListener('pointerenter', () => setStickerInteractionActive(true));

    menu.addEventListener('click', (clickEvent) => {
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      clickEvent.stopImmediatePropagation();
      const actionButton = clickEvent.target.closest('[data-sticker-context-action]');
      if (!actionButton) return;
      const action = actionButton.dataset.stickerContextAction;
      closeStickerContextMenu();
      if (action === 'view') openStickerPreview(url, pack, { keepPanelOpen });
      if (action === 'send') sendSticker(url, pack, { keepPanelOpen });
      if (action === 'delete') requestDeleteStickerPack(pack);
    }, true);
  }

  function openOwnStickerPackCreator() {
    const bot = window.__stickerBot;
    if (!bot?.open) {
      window.toast?.('Sticker Bot недоступен');
      return;
    }
    document.getElementById('attachMenu')?.classList.add('hidden');
    bot.open();
    window.setTimeout(() => {
      const input = document.getElementById('messageInput');
      if (!input) return;
      input.value = '/newpack ';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 80);
  }

  document.addEventListener('pointerdown', (event) => {
    if (event.button !== 2) return;
    const info = stickerInfoFromTarget(event.target);
    if (!info) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    closeStickerContextMenu();
    setStickerInteractionActive(true);
    stickerRightPress = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      info,
      previewOpen: false,
      timer: window.setTimeout(() => {
        if (!stickerRightPress) return;
        stickerRightPress.previewOpen = true;
        updateHoldPreviewAtPoint(stickerRightPress.clientX, stickerRightPress.clientY);
      }, STICKER_HOLD_PREVIEW_DELAY)
    };
  }, true);

  document.addEventListener('pointermove', (event) => {
    if (!stickerRightPress || event.pointerId !== stickerRightPress.pointerId) return;
    stickerRightPress.clientX = event.clientX;
    stickerRightPress.clientY = event.clientY;
    if (stickerRightPress.previewOpen) updateHoldPreviewAtPoint(event.clientX, event.clientY);
  }, true);

  function finishStickerRightPress(event, cancelled = false) {
    if (!stickerRightPress || (event.pointerId !== undefined && event.pointerId !== stickerRightPress.pointerId)) return;
    const state = stickerRightPress;
    stickerRightPress = null;
    window.clearTimeout(state.timer);
    suppressContextMenuUntil = Date.now() + 450;
    suppressStickerClickUntil = Date.now() + 300;
    if (state.previewOpen) {
      hideStickerHoldPreview();
    } else if (!cancelled) {
      const hoveredInfo = stickerInfoFromTarget(document.elementFromPoint(event.clientX, event.clientY)) || state.info;
      openStickerContextMenu(event, hoveredInfo.url, hoveredInfo.pack, hoveredInfo.keepPanelOpen);
    } else {
      syncStickerInteractionState();
    }
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  document.addEventListener('pointerup', (event) => finishStickerRightPress(event, false), true);
  document.addEventListener('pointercancel', (event) => finishStickerRightPress(event, true), true);

  // Fallback for browsers that dispatch contextmenu without pointer events.
  document.addEventListener('contextmenu', (event) => {
    const info = stickerInfoFromTarget(event.target);
    if (!info) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if (stickerRightPress || Date.now() < suppressContextMenuUntil) return;
    openStickerContextMenu(event, info.url, info.pack, info.keepPanelOpen);
  }, true);

  document.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-add-own-stickers]');
    if (!addButton) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openOwnStickerPackCreator();
  }, true);

  document.addEventListener('click', (event) => {
    if (Date.now() - contextMenuOpenedAt < 250) return;
    if (event.target.closest('#onixStickerContextMenu')) return;
    closeStickerContextMenu();
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeStickerContextMenu();
    if (stickerRightPress) {
      window.clearTimeout(stickerRightPress.timer);
      stickerRightPress = null;
    }
    hideStickerHoldPreview();
  });

  window.addEventListener('blur', () => {
    if (!stickerRightPress) return;
    window.clearTimeout(stickerRightPress.timer);
    stickerRightPress = null;
    hideStickerHoldPreview();
  });

  document.addEventListener('click', (event) => {
    const sticker = event.target.closest('[data-sticker-message]');
    if (!sticker) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    openStickerFromMessage(sticker.dataset.stickerPackId || '', sticker.dataset.stickerUrl || '', sticker.dataset.stickerPackName || '');
  }, true);

  document.addEventListener('click', (event) => {
    if (event.target.closest('#onixStickerContextMenu, #onixStickerHoldPreview, .sticker-preview-modal')) return;
    const button = event.target.closest('[data-sticker-url]');
    if (!button || Date.now() < suppressStickerClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const pack = packById(button.dataset.packId) || { id: button.dataset.packId, name: 'Стикеры', count: 0 };
    // A tap in the sticker grid sends immediately, and the sticker tab stays open.
    sendSticker(button.dataset.stickerUrl, pack, { keepPanelOpen: true });
  }, true);

  const observer = new MutationObserver(() => {
    const menu = document.getElementById('attachMenu');
    if (!menu?.classList.contains('hidden') && (menu.dataset.menuType === 'emoji' || menu.querySelector('.onix-emoji-grid')) && !menu.querySelector('.onix-stickers-root')) {
      setTimeout(() => injectStickers(false), 60);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-menu-type'] });
  document.addEventListener('click', (event) => {
    if (event.target.closest('#emojiButton')) {
      setTimeout(injectStickers, 180);
      setTimeout(injectStickers, 500);
    }
  });

  window.__onixStickers = { packs: STICKER_PACKS, sendSticker, openPreview: openStickerPreview, openFromMessage: openStickerFromMessage, openAt: openStickerLibraryAt, inject: injectStickers, removePack: removeStickerPack, upsertCustomPack };
})();
