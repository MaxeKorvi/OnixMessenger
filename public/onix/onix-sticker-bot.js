/* Onix Sticker Bot - /newpack, custom stickers like in TG */
(function() {
  const STICKER_BOT_ID = 'sticker-bot';
  const STICKER_BOT_USERNAME = '@stickers';
  const STICKER_BOT_TITLE = 'Sticker Bot';
  const CUSTOM_PACKS_KEY = 'onix_custom_sticker_packs_v2';
  const STICKER_STATE_KEY = 'onix_sticker_bot_state_v1';
  const DELETE_PACK_STATE_KEY = 'onix_sticker_bot_delete_pack_v1';
  const RENAME_PACK_STATE_KEY = 'onix_sticker_bot_rename_pack_v1';

  // State for ongoing pack creation
  let packCreationState = null; // { packName, stickers: [{dataUrl, name}], step: 'awaiting_name' | 'awaiting_photo' }
  let pendingPackDeletionId = '';
  let pendingPackRenameId = '';
  let autoStartInProgress = false;
  let packFinishInProgress = false;

  // Load pack creation state from localStorage
  try {
    const raw = localStorage.getItem(STICKER_STATE_KEY);
    if (raw) packCreationState = JSON.parse(raw);
    pendingPackDeletionId = String(localStorage.getItem(DELETE_PACK_STATE_KEY) || '');
    pendingPackRenameId = String(localStorage.getItem(RENAME_PACK_STATE_KEY) || '');
  } catch {}

  if (packCreationState && !['awaiting_name', 'awaiting_slug', 'awaiting_background', 'awaiting_photo'].includes(packCreationState.step)) {
    packCreationState.step = packCreationState.packName ? 'awaiting_slug' : 'awaiting_name';
  }
  if (packCreationState?.step === 'awaiting_photo' && typeof packCreationState.removeBackground !== 'boolean') {
    packCreationState.step = 'awaiting_background';
    packCreationState.removeBackground = null;
  }

  function savePackState() {
    try {
      if (packCreationState) localStorage.setItem(STICKER_STATE_KEY, JSON.stringify(packCreationState));
      else localStorage.removeItem(STICKER_STATE_KEY);
    } catch {}
  }

  function savePendingPackDeletion() {
    try {
      if (pendingPackDeletionId) localStorage.setItem(DELETE_PACK_STATE_KEY, pendingPackDeletionId);
      else localStorage.removeItem(DELETE_PACK_STATE_KEY);
    } catch {}
  }


  function savePendingPackRename() {
    try {
      if (pendingPackRenameId) localStorage.setItem(RENAME_PACK_STATE_KEY, pendingPackRenameId);
      else localStorage.removeItem(RENAME_PACK_STATE_KEY);
    } catch {}
  }

  function getCustomPacks() {
    try { return JSON.parse(localStorage.getItem(CUSTOM_PACKS_KEY) || '[]'); } catch { return []; }
  }
  function saveCustomPacks(packs) {
    try {
      localStorage.setItem(CUSTOM_PACKS_KEY, JSON.stringify(packs));
      return true;
    } catch (error) {
      console.error('Sticker pack storage error', error);
      return false;
    }
  }

  function ensureStickerBotChat() {
    if (!window.state) return null;
    let chat = state.chats.find(c => c.id === STICKER_BOT_ID);
    if (!chat) {
      chat = {
        id: STICKER_BOT_ID,
        title: STICKER_BOT_TITLE,
        type: 'private',
        status: 'бот стикеров',
        avatar: '🎨',
        avatarData: '',
        username: STICKER_BOT_USERNAME,
        isSupportBot: false,
        isStickerBot: true,
        isPremium: false,
        online: false,
        unread: 0,
        archived: false,
        pinnedChat: true,
        pinnedChatAt: Date.now(),
        description: 'Создавайте свои стикеры как в Telegram',
        messages: []
      };
      state.chats.unshift(chat);
      if (typeof persistChats === 'function') persistChats();
    }
    return chat;
  }

  function stickerBotWelcomeText() {
    return '👋 Привет! Я Sticker Bot. Здесь можно создавать и управлять своими стикерпаками.\n\n'
      + 'Команды:\n'
      + '/start — запустить бота и показать команды\n'
      + '/help — показать команды\n'
      + '/newpack — создать новый стикерпак\n'
      + '/newpack <название> — создать пак с указанным названием\n'
      + '/setname <название> — изменить название создаваемого пака\n'
      + '/setshortname <уникальное_имя> — изменить уникальное имя создаваемого пака\n'
      + '/mypacks — показать мои стикерпаки\n'
      + '/renamepack — изменить уникальное имя готового стикерпака\n'
      + '/deletepack или /delpack — удалить стикерпак\n'
      + '/more — выбрать ещё фотографии\n'
      + '/done — завершить и сохранить создаваемый пак\n'
      + '/cancel — отменить создание пака\n\n'
      + 'После команды /newpack я спрошу название, уникальное имя и нужно ли удалять фон у фотографий.';
  }

  function stickerBotWelcomeKeyboard() {
    return [
      [{ text: '🎨 Новый пак', command: '/newpack' }, { text: '📦 Мои паки', command: '/mypacks' }],
      [{ text: '✏️ Изменить уникальное имя', command: '/renamepack' }],
      [{ text: '🗑 Удалить стикерпак', command: '/deletepack' }]
    ];
  }

  function addStickerBotMessage(text, keyboard = null, meta = {}) {
    const chat = ensureStickerBotChat();
    if (!chat) return;
    const msg = {
      id: Date.now() + Math.floor(Math.random()*10000),
      from: 'them',
      author: STICKER_BOT_TITLE,
      text: text,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      read: true,
      reactions: [],
      files: [],
      botKeyboard: keyboard || [],
      links: [],
      createdAt: Date.now(),
      ...meta
    };
    chat.messages.push(msg);
    if (typeof persistChats === 'function') persistChats();
    if (state.activeChatId === STICKER_BOT_ID && typeof renderActiveChat === 'function') {
      renderActiveChat({ animate: false, focusComposer: false });
      setTimeout(() => { if (typeof scrollActiveChatToBottom === 'function') scrollActiveChatToBottom(true); }, 50);
    } else {
      chat.unread = (chat.unread || 0) + 1;
      if (typeof renderChats === 'function') renderChats();
    }
  }

  function addStickerBotUserCommand(text) {
    const chat = ensureStickerBotChat();
    if (!chat) return;
    const command = String(text || '').trim();
    if (!command) return;
    chat.messages.push({
      id: `sticker-command-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      from: 'me',
      author: 'Вы',
      text: command,
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      read: true,
      reactions: [],
      files: [],
      links: [],
      createdAt: Date.now()
    });
    if (typeof persistChats === 'function') persistChats();
    if (state.activeChatId === STICKER_BOT_ID && typeof renderActiveChat === 'function') {
      renderActiveChat({ animate: false, forceScrollToBottom: true, focusComposer: false });
    }
  }

  function imageToStickerDataUrl(imgSrc, maxSize = 512, removeBackground = true) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = maxSize;
        canvas.height = maxSize;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, maxSize, maxSize);

        // Step 1: рисуем оригинал в отдельный canvas, чтобы проанализировать пиксели
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = img.width;
        tmpCanvas.height = img.height;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(img, 0, 0);
        const imgData = tmpCtx.getImageData(0, 0, img.width, img.height);
        const pixels = imgData.data;

        // Step 2: определяем цвет фона по 4 углам + центру
        const cornerSamples = [
          [0, 0],
          [img.width - 1, 0],
          [0, img.height - 1],
          [img.width - 1, img.height - 1],
          [Math.floor(img.width / 2), Math.floor(img.height / 2)]
        ];
        const cornerColors = cornerSamples.map(([x, y]) => {
          const i = (y * img.width + x) * 4;
          return [pixels[i], pixels[i + 1], pixels[i + 2]];
        });
        // Если углы и центр сильно отличаются — фон НЕ однотонный
        const allClose = cornerColors.every((c) => {
          return cornerColors.every((other) => {
            return Math.abs(c[0] - other[0]) < 30 && Math.abs(c[1] - other[1]) < 30 && Math.abs(c[2] - other[2]) < 30;
          });
        });
        const bgColor = allClose ? cornerColors[0] : null;

        // Step 3: если фон однотонный — делаем его прозрачным
        if (removeBackground && bgColor) {
          const tolerance = 35;
          for (let i = 0; i < pixels.length; i += 4) {
            const dr = Math.abs(pixels[i] - bgColor[0]);
            const dg = Math.abs(pixels[i + 1] - bgColor[1]);
            const db = Math.abs(pixels[i + 2] - bgColor[2]);
            if (dr < tolerance && dg < tolerance && db < tolerance) {
              pixels[i + 3] = 0; // alpha = 0
            }
          }
          tmpCtx.putImageData(imgData, 0, 0);
        }

        // Step 4: центрируем и масштабируем
        let w = tmpCanvas.width, h = tmpCanvas.height;
        const ratio = Math.min(maxSize * 0.78 / w, maxSize * 0.78 / h);
        w *= ratio;
        h *= ratio;
        const x = (maxSize - w) / 2;
        const y = (maxSize - h) / 2;

        // Step 5: белая обводка (рисуем 8 копий со смещением)
        ctx.save();
        const offsets = [
          [-1, 0], [1, 0], [0, -1], [0, 1],
          [-1, -1], [1, -1], [-1, 1], [1, 1]
        ];
        const strokeWidth = 10;
        offsets.forEach(([ox, oy]) => {
          ctx.drawImage(tmpCanvas, x + ox * strokeWidth, y + oy * strokeWidth, w, h);
        });
        ctx.restore();

        // Step 6: основное изображение поверх
        ctx.drawImage(tmpCanvas, x, y, w, h);

        try {
          const webp = canvas.toDataURL('image/webp', 0.86);
          const dataUrl = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
          resolve(dataUrl);
        } catch (e) { reject(e); }
      };
      img.onerror = reject;
      if (imgSrc.startsWith('data:')) img.src = imgSrc;
      else img.src = imgSrc;
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsDataURL(blob);
    });
  }


  function compressStickerDataUrl(source, maxSize = 512, quality = 0.82) {
    return new Promise((resolve) => {
      const value = String(source || '');
      if (!value.startsWith('data:image/')) {
        resolve(value);
        return;
      }
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = maxSize;
          canvas.height = maxSize;
          const context = canvas.getContext('2d');
          context.clearRect(0, 0, maxSize, maxSize);
          const ratio = Math.min(maxSize / image.naturalWidth, maxSize / image.naturalHeight, 1);
          const width = Math.max(1, Math.round(image.naturalWidth * ratio));
          const height = Math.max(1, Math.round(image.naturalHeight * ratio));
          context.drawImage(image, Math.round((maxSize - width) / 2), Math.round((maxSize - height) / 2), width, height);
          const webp = canvas.toDataURL('image/webp', quality);
          resolve(webp.startsWith('data:image/webp') ? webp : value);
        } catch (_) {
          resolve(value);
        }
      };
      image.onerror = () => resolve(value);
      image.src = value;
    });
  }

  async function handlePhotoForSticker(file) {
    if (!packCreationState) return false;
    if (packCreationState.step !== 'awaiting_photo') return false;

    // file can be File object or our file record with dataUrl/url
    let dataUrl = file.dataUrl || file.url || '';
    if (file instanceof File) {
      dataUrl = await blobToDataUrl(file);
    } else if (file.dataUrl) {
      dataUrl = file.dataUrl;
    } else if (file.url && file.url.startsWith('data:')) {
      dataUrl = file.url;
    } else if (file.url) {
      // Try fetch
      try {
        const resp = await fetch(file.url);
        const blob = await resp.blob();
        dataUrl = await blobToDataUrl(blob);
      } catch {
        dataUrl = file.url;
      }
    }

    if (!dataUrl) {
      addStickerBotMessage('Не удалось прочитать изображение. Попробуйте ещё раз — скиньте фото в любом формате (jpg, png, webp).');
      return true;
    }

    // Show processing
    addStickerBotMessage('Обрабатываю фото... Делаю из него стикер ✨');

    try {
      const stickerDataUrl = await imageToStickerDataUrl(dataUrl, 512, packCreationState.removeBackground === true);
      packCreationState.stickers.push({
        dataUrl: stickerDataUrl,
        name: file.name || `sticker_${packCreationState.stickers.length + 1}.png`,
        originalName: file.name || ''
      });
      savePackState();

      const count = packCreationState.stickers.length;
      addStickerBotMessage(
        `✅ Стикер #${count} добавлен в пак "${packCreationState.packName}"!\n\n` +
        `Прикрепил превью ниже.\n` +
        `Скиньте ещё фото, чтобы добавить ещё стикеров, или напишите /done чтобы завершить пак, /cancel чтобы отменить.`,
        [
          [{ text: '➕ Ещё стикер', command: '/more' }, { text: '✅ Готово /done', command: '/done' }],
          [{ text: '❌ Отмена /cancel', command: '/cancel' }]
        ]
      );

      // Also send the generated sticker as message in bot chat for preview
      const chat = ensureStickerBotChat();
      if (chat) {
        const previewMsg = {
          id: Date.now() + Math.floor(Math.random()*1000),
          from: 'them',
          author: STICKER_BOT_TITLE,
          text: '',
          time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
          read: true,
          reactions: [],
          files: [{
            id: `sticker-preview-${Date.now()}`,
            name: `sticker_${count}.png`,
            type: 'image/png',
            size: 0,
            url: stickerDataUrl,
            dataUrl: stickerDataUrl,
            sticker: true,
            mediaStyle: { displayWidth: 180, radius: 12 }
          }],
          links: [],
          createdAt: Date.now()
        };
        chat.messages.push(previewMsg);
        if (typeof persistChats === 'function') persistChats();
        if (state.activeChatId === STICKER_BOT_ID && typeof renderActiveChat === 'function') {
          renderActiveChat({ animate: false });
        }
      }

      return true;
    } catch (e) {
      console.error('Sticker conversion error', e);
      addStickerBotMessage('Ошибка обработки фото. Попробуйте другое изображение.');
      return true;
    }
  }

  function transliteratePackSlug(value = '') {
    const map = {
      а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'y',
      к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f',
      х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya'
    };
    return String(value || '').toLowerCase().split('').map((char) => map[char] ?? char).join('');
  }

  function normalizePackSlug(value = '') {
    return transliteratePackSlug(value)
      .replace(/^@+/, '')
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 32);
  }

  function packSlugTaken(slug, excludePackId = '') {
    const normalized = String(slug || '').toLowerCase();
    return getCustomPacks().some((pack) => {
      if (excludePackId && String(pack.id) === String(excludePackId)) return false;
      return String(pack.slug || pack.shortName || '').toLowerCase() === normalized;
    });
  }

  function validatePackSlug(value, excludePackId = '') {
    const slug = normalizePackSlug(value);
    if (slug.length < 3) {
      return { ok: false, slug, message: 'Уникальное имя должно содержать минимум 3 символа: латинские буквы, цифры или знак подчёркивания.' };
    }
    if (packSlugTaken(slug, excludePackId)) {
      return { ok: false, slug, message: `Уникальное имя @${slug} уже занято. Введите другое.` };
    }
    return { ok: true, slug, message: '' };
  }

  function uniquePackSlug(value = '') {
    const base = normalizePackSlug(value) || `sticker_pack_${Date.now().toString(36)}`;
    if (!packSlugTaken(base)) return base;
    let suffix = 2;
    while (packSlugTaken(`${base}_${suffix}`)) suffix += 1;
    return `${base}_${suffix}`.slice(0, 32);
  }

  function askPackUniqueName() {
    if (!packCreationState) return;
    packCreationState.step = 'awaiting_slug';
    savePackState();
    addStickerBotMessage(
      `Название пака: «${packCreationState.packName}».\n\nТеперь введите уникальное имя латинскими буквами, цифрами или знаком подчёркивания. Например: my_stickers.`,
      [[{ text: '❌ Отмена', command: '/cancel' }]]
    );
  }

  function askBackgroundRemoval() {
    if (!packCreationState) return;
    packCreationState.step = 'awaiting_background';
    savePackState();
    addStickerBotMessage(
      'Удалять фон у загружаемых фотографий перед созданием стикеров?',
      [[
        { text: 'Да, удалить фон', command: '/background_yes' },
        { text: 'Нет, оставить фон', command: '/background_no' }
      ], [{ text: '❌ Отмена', command: '/cancel' }]]
    );
  }

  function beginPhotoUpload() {
    if (!packCreationState) return;
    packCreationState.step = 'awaiting_photo';
    savePackState();
    addStickerBotMessage(
      `Готово. Фон: ${packCreationState.removeBackground ? 'удалять' : 'оставлять'}.\n\nВыберите одну или сразу несколько фотографий. Все выбранные изображения будут добавлены в стикерпак.`,
      [
        [{ text: '📎 Выбрать фотографии', command: '/more' }],
        [{ text: '✅ Завершить /done', command: '/done' }, { text: '❌ Отмена', command: '/cancel' }]
      ]
    );
  }

  function setActivePackName(value = '') {
    if (!packCreationState) {
      addStickerBotMessage('Сейчас стикерпак не создаётся. Сначала используйте /newpack.');
      return false;
    }
    const name = String(value || '').trim().slice(0, 64);
    if (!name) {
      addStickerBotMessage('Введите название стикерпака. Например: Мои коты');
      return false;
    }
    packCreationState.packName = name;
    savePackState();
    if (packCreationState.step === 'awaiting_name') askPackUniqueName();
    else addStickerBotMessage(`Название создаваемого стикерпака изменено на «${name}».`);
    return true;
  }

  function setActivePackSlug(value = '') {
    if (!packCreationState) {
      addStickerBotMessage('Сейчас стикерпак не создаётся. Сначала используйте /newpack.');
      return false;
    }
    const result = validatePackSlug(value);
    if (!result.ok) {
      addStickerBotMessage(result.message);
      return false;
    }
    packCreationState.packSlug = result.slug;
    savePackState();
    if (packCreationState.step === 'awaiting_slug') {
      addStickerBotMessage(`Уникальное имя сохранено: @${result.slug}.`);
      askBackgroundRemoval();
    } else {
      addStickerBotMessage(`Уникальное имя создаваемого стикерпака изменено на @${result.slug}.`);
    }
    return true;
  }

  function setBackgroundRemoval(removeBackground) {
    if (!packCreationState) {
      addStickerBotMessage('Сейчас стикерпак не создаётся. Сначала используйте /newpack.');
      return false;
    }
    packCreationState.removeBackground = Boolean(removeBackground);
    beginPhotoUpload();
    return true;
  }

  function startNewPack(packName = '') {
    const requested = String(packName || '').trim().slice(0, 64);
    packCreationState = {
      packName: requested,
      packSlug: '',
      removeBackground: null,
      stickers: [],
      step: requested ? 'awaiting_slug' : 'awaiting_name',
      createdAt: Date.now()
    };
    savePackState();
    ensureStickerBotChat();

    if (requested) {
      addStickerBotMessage(`Создаю новый стикерпак «${requested}».`);
      askPackUniqueName();
    } else {
      addStickerBotMessage(
        'Введите обычное название нового стикерпака. Например: Мои коты.\n\nПосле этого я отдельно попрошу уникальное имя.',
        [[{ text: '❌ Отмена', command: '/cancel' }]]
      );
    }

    if (state) {
      state.activeChatId = STICKER_BOT_ID;
      if (typeof renderChats === 'function') renderChats();
      if (typeof renderActiveChat === 'function') renderActiveChat({ animate: true });
    }
  }

  function stickerImageFiles(files = []) {
    return Array.from(files || []).filter((file) => {
      const type = String(file?.type || file?.mime || '');
      return type.startsWith('image/') || String(file?.name || '').match(/\.(jpg|jpeg|png|webp|gif|bmp)$/i);
    });
  }

  async function handlePhotosForSticker(files = []) {
    const images = stickerImageFiles(files);
    if (!images.length) return false;
    if (!packCreationState) {
      addStickerBotMessage('Сначала создайте стикерпак командой /newpack.');
      return true;
    }
    if (packCreationState.step === 'awaiting_background') {
      addStickerBotMessage('Сначала выберите, удалять ли фон: «Да, удалить фон» или «Нет, оставить фон».');
      return true;
    }
    if (packCreationState.step === 'awaiting_name') {
      addStickerBotMessage('Сначала введите название стикерпака.');
      return true;
    }
    if (packCreationState.step === 'awaiting_slug') {
      addStickerBotMessage('Сначала введите уникальное имя стикерпака.');
      return true;
    }
    if (packCreationState.step !== 'awaiting_photo') return true;
    for (const image of images) {
      await handlePhotoForSticker(image);
    }
    return true;
  }

  async function finishPack() {
    if (packFinishInProgress) return false;
    if (!packCreationState || packCreationState.stickers.length === 0) {
      addStickerBotMessage('В паке нет стикеров! Скиньте хотя бы одно фото, или /cancel для отмены.');
      return false;
    }

    packFinishInProgress = true;
    const stateSnapshot = packCreationState;
    try {
      const compactStickers = [];
      for (const sticker of stateSnapshot.stickers) {
        compactStickers.push(await compressStickerDataUrl(sticker.dataUrl, 512, 0.82));
      }

      const newPack = {
        id: 'custom_' + Date.now(),
        name: String(stateSnapshot.packName || 'Мой стикерпак').trim() || 'Мой стикерпак',
        slug: stateSnapshot.packSlug || uniquePackSlug(stateSnapshot.packName),
        count: compactStickers.length,
        stickers: compactStickers,
        createdAt: Date.now()
      };

      // The draft contains the same images. Remove it before saving the finished pack
      // so localStorage does not need to hold two copies at the same time.
      try { localStorage.removeItem(STICKER_STATE_KEY); } catch (_) {}

      const packs = getCustomPacks().filter((pack) => String(pack?.id || '') !== String(newPack.id));
      packs.push(newPack);
      let saved = saveCustomPacks(packs);

      // One more compact retry for browsers with a smaller localStorage limit.
      if (!saved) {
        newPack.stickers = [];
        for (const sticker of compactStickers) {
          newPack.stickers.push(await compressStickerDataUrl(sticker, 384, 0.68));
        }
        newPack.count = newPack.stickers.length;
        saved = saveCustomPacks(packs);
      }

      if (!saved) {
        packCreationState = stateSnapshot;
        savePackState();
        addStickerBotMessage('Не удалось сохранить стикерпак: в хранилище браузера недостаточно места. Удалите ненужный стикерпак и нажмите /done ещё раз.');
        return false;
      }

      if (typeof window.__onixStickers?.upsertCustomPack === 'function') {
        window.__onixStickers.upsertCustomPack(newPack);
      } else if (window.__onixStickers?.packs) {
        const uiPack = {
          id: newPack.id,
          name: newPack.name + ' (мой)',
          emoji: '⭐',
          path: '',
          count: newPack.count,
          files: newPack.stickers,
          isCustom: true
        };
        const index = window.__onixStickers.packs.findIndex((pack) => String(pack?.id || '') === String(newPack.id));
        if (index >= 0) window.__onixStickers.packs[index] = uiPack;
        else window.__onixStickers.packs.push(uiPack);
      }

      packCreationState = null;
      savePackState();

      addStickerBotMessage(
        `🎉 Поздравляем! Ваш стикерпак «${newPack.name}» готов.\n\n` +
        `Уникальное имя: @${newPack.slug}\n` +
        `Стикеров в наборе: ${newPack.count}\n\n` +
        'Стикерпак сохранён и уже доступен во вкладке «Стикеры».',
        [
          [{ text: '📦 Мои паки', command: '/mypacks' }],
          [{ text: '🎨 Создать ещё один', command: '/newpack' }]
        ]
      );

      window.setTimeout(() => {
        window.__onixStickers?.inject?.(true);
      }, 80);
      return true;
    } finally {
      packFinishInProgress = false;
    }
  }


  function cancelPack() {
    if (!packCreationState) {
      addStickerBotMessage('Нет активного создания пака. Напишите /newpack чтобы начать.');
      return;
    }
    const name = packCreationState.packName;
    packCreationState = null;
    savePackState();
    addStickerBotMessage(`🚫 Создание пака "${name}" отменено. Если хотите начать заново — /newpack`);
  }

  function listMyPacks() {
    const packs = getCustomPacks();
    if (packs.length === 0) {
      addStickerBotMessage('У вас пока нет кастомных паков. Напишите /newpack чтобы создать первый!');
      return;
    }
    let text = `📦 Ваши паки (${packs.length}):\n\n`;
    packs.forEach((p, i) => {
      text += `${i+1}. "${p.name}" (@${p.slug || normalizePackSlug(p.name)}) — ${p.count || p.stickers?.length || 0} стик.\n`;
    });
    text += `\n/newpack — создать новый пак\n/renamepack — изменить уникальное имя\n/deletepack — удалить пак`;
    addStickerBotMessage(text);
    // Also send previews of each pack first sticker
    packs.slice(-3).forEach(p => {
      if (p.stickers && p.stickers[0]) {
        const chat = ensureStickerBotChat();
        if (chat) {
          chat.messages.push({
            id: Date.now() + Math.floor(Math.random()*1000),
            from: 'them',
            author: STICKER_BOT_TITLE,
            text: `Пак "${p.name}" — ${p.stickers.length} стик.`,
            time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
            read: true,
            reactions: [],
            files: p.stickers.slice(0,3).map((url, idx) => ({
              id: `pack-preview-${p.id}-${idx}`,
              name: `sticker_${idx+1}.png`,
              type: 'image/png',
              url: url,
              dataUrl: url,
              sticker: true,
              stickerPackId: p.id,
              stickerPackName: p.name || 'Мой пак',
              stickerId: `sticker_${idx+1}.png`,
              mediaStyle: { displayWidth: 100, radius: 0 }
            })),
            links: [],
            createdAt: Date.now()
          });
        }
      }
    });
    if (typeof persistChats === 'function') persistChats();
    if (typeof renderActiveChat === 'function') renderActiveChat({ animate: false });
  }

  function openDeletePackPicker() {
    const packs = getCustomPacks();
    pendingPackDeletionId = '';
    savePendingPackDeletion();
    if (!packs.length) {
      addStickerBotMessage('У вас пока нет созданных стикерпаков, которые можно удалить.');
      return;
    }
    addStickerBotMessage(
      '🗑 Выберите стикерпак для удаления. После выбора я обязательно попрошу подтверждение.',
      packs.map((pack) => ([{ text: `🗑 ${pack.name || 'Без названия'}`, command: `/deletepack_select ${pack.id}` }]))
        .concat([[{ text: 'Отмена', command: '/deletepack_cancel' }]])
    );
  }

  function askDeletePack(packId) {
    const pack = getCustomPacks().find((item) => String(item.id) === String(packId));
    if (!pack) {
      addStickerBotMessage('Этот стикерпак уже удалён или не найден.');
      return;
    }
    pendingPackDeletionId = String(pack.id);
    savePendingPackDeletion();
    const count = Array.isArray(pack.stickers) ? pack.stickers.length : Number(pack.count || 0);
    addStickerBotMessage(
      `Удалить стикерпак «${pack.name || 'Без названия'}» (${count} стик.)? Это действие нельзя отменить.`,
      [[
        { text: '🗑 Да, удалить', command: `/deletepack_confirm ${pack.id}` },
        { text: 'Не удалять', command: '/deletepack_cancel' }
      ]]
    );
  }

  function cancelDeletePack() {
    pendingPackDeletionId = '';
    savePendingPackDeletion();
    addStickerBotMessage('Удаление стикерпака отменено.');
  }

  function confirmDeletePack(packId) {
    const id = String(packId || '');
    if (!id || id !== String(pendingPackDeletionId || '')) {
      addStickerBotMessage('Сначала выберите стикерпак и подтвердите удаление.');
      return;
    }
    const packs = getCustomPacks();
    const pack = packs.find((item) => String(item.id) === id);
    if (!pack) {
      pendingPackDeletionId = '';
      savePendingPackDeletion();
      addStickerBotMessage('Стикерпак уже удалён.');
      return;
    }
    const uiPack = window.__onixStickers?.packs?.find((item) => String(item.id) === id) || {
      id: pack.id,
      name: pack.name || 'Без названия',
      isCustom: true
    };
    if (typeof window.__onixStickers?.removePack === 'function') {
      window.__onixStickers.removePack(uiPack);
    } else {
      saveCustomPacks(packs.filter((item) => String(item.id) !== id));
      if (window.__onixStickers?.packs) {
        const index = window.__onixStickers.packs.findIndex((item) => String(item.id) === id);
        if (index >= 0) window.__onixStickers.packs.splice(index, 1);
      }
    }
    pendingPackDeletionId = '';
    savePendingPackDeletion();
    addStickerBotMessage(`✅ Стикерпак «${pack.name || 'Без названия'}» удалён.`);
  }

  function openRenamePackPicker() {
    const packs = getCustomPacks();
    pendingPackRenameId = '';
    savePendingPackRename();
    if (!packs.length) {
      addStickerBotMessage('У вас пока нет готовых стикерпаков, которым можно изменить уникальное имя.');
      return;
    }
    addStickerBotMessage(
      'Выберите стикерпак, которому нужно изменить уникальное имя.',
      packs.map((pack) => ([{
        text: `✏️ ${pack.name || 'Без названия'} (@${pack.slug || normalizePackSlug(pack.name) || 'без_имени'})`,
        command: `/renamepack_select ${pack.id}`
      }])).concat([[{ text: 'Отмена', command: '/renamepack_cancel' }]])
    );
  }

  function askRenamePack(packId) {
    const pack = getCustomPacks().find((item) => String(item.id) === String(packId));
    if (!pack) {
      addStickerBotMessage('Стикерпак не найден.');
      return;
    }
    pendingPackRenameId = String(pack.id);
    savePendingPackRename();
    addStickerBotMessage(
      `Введите новое уникальное имя для стикерпака «${pack.name || 'Без названия'}».\nИспользуйте латинские буквы, цифры и знак подчёркивания.`,
      [[{ text: 'Отмена', command: '/renamepack_cancel' }]]
    );
  }

  function applyRenamePack(value = '') {
    const id = String(pendingPackRenameId || '');
    if (!id) {
      addStickerBotMessage('Сначала выберите стикерпак командой /renamepack.');
      return false;
    }
    const packs = getCustomPacks();
    const pack = packs.find((item) => String(item.id) === id);
    if (!pack) {
      pendingPackRenameId = '';
      savePendingPackRename();
      addStickerBotMessage('Стикерпак не найден.');
      return false;
    }
    const result = validatePackSlug(value, id);
    if (!result.ok) {
      addStickerBotMessage(result.message);
      return false;
    }
    pack.slug = result.slug;
    saveCustomPacks(packs);
    pendingPackRenameId = '';
    savePendingPackRename();
    addStickerBotMessage(`Уникальное имя стикерпака «${pack.name || 'Без названия'}» изменено на @${result.slug}.`);
    return true;
  }

  function cancelRenamePack() {
    pendingPackRenameId = '';
    savePendingPackRename();
    addStickerBotMessage('Изменение уникального имени отменено.');
  }

  function isStickerBotFlowInput(text = '') {
    const raw = String(text || '').trim();
    if (!raw || raw.startsWith('/')) return false;
    if (pendingPackRenameId) return true;
    return Boolean(packCreationState && ['awaiting_name', 'awaiting_slug', 'awaiting_background'].includes(packCreationState.step));
  }

  function isHandledStickerCommand(text = '') {
    const lower = String(text || '').trim().toLowerCase();
    return lower === '/start' || lower === '/start@stickers' || lower === '/help' || lower === '/help@stickers'
      || lower.startsWith('/newpack')
      || lower.startsWith('/setname ')
      || lower.startsWith('/setshortname ')
      || lower === '/background_yes' || lower === '/background_no'
      || lower === 'да' || lower === 'нет'
      || lower === '/done' || lower === '/done@stickers'
      || lower === '/cancel' || lower === '/cancel@stickers'
      || lower.startsWith('❌')
      || lower === '/mypacks' || lower === '/packs' || lower === '/my packs'
      || lower === '/more' || lower.startsWith('➕')
      || lower === '/renamepack'
      || lower.startsWith('/renamepack_select ')
      || lower.startsWith('/renamepack_apply ')
      || lower === '/renamepack_cancel'
      || lower === '/deletepack' || lower === '/delpack'
      || lower.startsWith('/deletepack_select ')
      || lower.startsWith('/deletepack_confirm ')
      || lower === '/deletepack_cancel' || lower === '/deletepack_cancel@stickers'
      || lower === 'удалить стикерпак';
  }

  // Handle commands
  function handleStickerCommand(text, files = []) {
    const raw = String(text || '').trim();
    const lower = raw.toLowerCase();

    const images = stickerImageFiles(files);
    if (images.length) return handlePhotosForSticker(images);

    if (lower === '/start' || lower === '/start@stickers' || lower === '/help' || lower === '/help@stickers') {
      addStickerBotMessage(stickerBotWelcomeText(), stickerBotWelcomeKeyboard(), { stickerBotWelcome: true });
      return true;
    }
    if (lower === '/deletepack' || lower === '/delpack' || lower === 'удалить стикерпак') {
      openDeletePackPicker();
      return true;
    }
    if (lower.startsWith('/deletepack_select ')) {
      askDeletePack(raw.slice('/deletepack_select '.length).trim());
      return true;
    }
    if (lower.startsWith('/deletepack_confirm ')) {
      confirmDeletePack(raw.slice('/deletepack_confirm '.length).trim());
      return true;
    }
    if (lower === '/deletepack_cancel' || lower === '/deletepack_cancel@stickers') {
      cancelDeletePack();
      return true;
    }
    if (lower === '/renamepack') {
      openRenamePackPicker();
      return true;
    }
    if (lower.startsWith('/renamepack_select ')) {
      askRenamePack(raw.slice('/renamepack_select '.length).trim());
      return true;
    }
    if (lower.startsWith('/renamepack_apply ')) {
      applyRenamePack(raw.slice('/renamepack_apply '.length).trim());
      return true;
    }
    if (lower === '/renamepack_cancel') {
      cancelRenamePack();
      return true;
    }
    if (lower.startsWith('/newpack')) {
      const name = raw.slice('/newpack'.length).trim();
      startNewPack(name);
      return true;
    }
    if (lower.startsWith('/setname ')) {
      setActivePackName(raw.slice('/setname '.length).trim());
      return true;
    }
    if (lower.startsWith('/setshortname ')) {
      setActivePackSlug(raw.slice('/setshortname '.length).trim());
      return true;
    }
    if (lower === '/background_yes' || (packCreationState?.step === 'awaiting_background' && lower === 'да')) {
      setBackgroundRemoval(true);
      return true;
    }
    if (lower === '/background_no' || (packCreationState?.step === 'awaiting_background' && lower === 'нет')) {
      setBackgroundRemoval(false);
      return true;
    }
    if (lower === '/done' || lower === '/done@stickers' || lower === '✅ готово /done') {
      return finishPack().then(() => true);
    }
    if (lower === '/cancel' || lower === '/cancel@stickers' || lower.startsWith('❌')) {
      cancelPack();
      return true;
    }
    if (lower === '/mypacks' || lower === '/packs' || lower === '/my packs') {
      listMyPacks();
      return true;
    }
    if (lower === '/more' || lower.startsWith('➕')) {
      if (!packCreationState) {
        addStickerBotMessage('Сначала создайте стикерпак командой /newpack.');
      } else if (packCreationState.step !== 'awaiting_photo') {
        addStickerBotMessage('Сначала завершите настройку названия, уникального имени и удаления фона.');
      } else {
        addStickerBotMessage('Выберите одну или сразу несколько фотографий. Жду 📎');
        if (typeof chooseAttachmentAction === 'function') setTimeout(() => chooseAttachmentAction('photo'), 0);
      }
      return true;
    }

    if (pendingPackRenameId && raw && !raw.startsWith('/')) {
      applyRenamePack(raw);
      return true;
    }
    if (packCreationState?.step === 'awaiting_name' && raw && !raw.startsWith('/')) {
      setActivePackName(raw);
      return true;
    }
    if (packCreationState?.step === 'awaiting_slug' && raw && !raw.startsWith('/')) {
      setActivePackSlug(raw);
      return true;
    }
    if (packCreationState?.step === 'awaiting_background' && raw && !raw.startsWith('/')) {
      addStickerBotMessage('Ответьте «Да» или «Нет», нужно ли удалять фон у фотографий.');
      return true;
    }
    return false;
  }

  // Hook into sendMessage to intercept sticker bot commands
  function stickerBotHasWelcome(chat) {
    return Boolean(chat?.messages?.some((message) => message?.stickerBotWelcome === true || String(message?.text || '').startsWith('👋 Привет! Я Sticker Bot')));
  }

  async function handleStickerBotSubmit(text = '', files = [], options = {}) {
    const raw = String(text || '').trim();
    const images = stickerImageFiles(files);
    if (images.length) {
      return Boolean(await handlePhotosForSticker(images));
    }
    if (!raw) return false;
    if (!isHandledStickerCommand(raw) && !isStickerBotFlowInput(raw)) return false;
    if (options.addUserMessage !== false) addStickerBotUserCommand(raw);
    return Boolean(await handleStickerCommand(raw, files));
  }

  async function executeStickerBotCommand(command = '') {
    return handleStickerBotSubmit(command, [], { addUserMessage: true });
  }

  function ensureStickerBotStarted() {
    if (autoStartInProgress || !window.state || state.activeChatId !== STICKER_BOT_ID) return;
    const chat = ensureStickerBotChat();
    if (!chat || stickerBotHasWelcome(chat)) return;
    autoStartInProgress = true;
    addStickerBotUserCommand('/start');
    addStickerBotMessage(stickerBotWelcomeText(), stickerBotWelcomeKeyboard(), { stickerBotWelcome: true });
    autoStartInProgress = false;
  }

  function installHooks() {
    // Do not auto-create a bot chat. A removed bot must stay removed until the
    // user explicitly finds it, opens it from the drawer, or sends a command.

    if (!document.documentElement.dataset.stickerBotAutoStartBound) {
      document.documentElement.dataset.stickerBotAutoStartBound = 'true';
      document.addEventListener('click', (event) => {
        if (!event.target.closest('.chat-card, [data-add-own-stickers]')) return;
        setTimeout(ensureStickerBotStarted, 0);
      });

      const originalRenderActiveChat = window.renderActiveChat;
      if (typeof originalRenderActiveChat === 'function' && !originalRenderActiveChat.__stickerAutoStartPatched) {
        const patchedRenderActiveChat = function() {
          const result = originalRenderActiveChat.apply(this, arguments);
          setTimeout(ensureStickerBotStarted, 0);
          return result;
        };
        patchedRenderActiveChat.__stickerAutoStartPatched = true;
        window.renderActiveChat = patchedRenderActiveChat;
      }
    }

    // Patch sendMessage to detect commands and photos in sticker bot chat
    if (window.sendMessage && !window.sendMessage.__stickerPatched) {
      const originalSend = window.sendMessage;
      window.sendMessage = function(text, files, extras) {
        const chat = window.state?.activeChatId ? window.state.chats.find(c => c.id === window.state.activeChatId) : null;
        const isStickerBot = chat && chat.id === STICKER_BOT_ID;

        // In Sticker Bot every selected image must be processed, not only the first one.
        if (isStickerBot && files && files.length > 0 && packCreationState) {
          const imgFiles = stickerImageFiles(files);
          if (imgFiles.length > 0) {
            return handlePhotosForSticker(imgFiles);
          }
        }

        // Capture ordinary text while the bot is waiting for a pack name,
        // unique name, background choice, or a saved-pack rename value.
        if (isStickerBot && isStickerBotFlowInput(text)) {
          addStickerBotUserCommand(text);
          handleStickerCommand(text, files);
          return;
        }

        // Check commands
        if (typeof text === 'string' && (text.trim().startsWith('/') || text.trim().toLowerCase() === 'удалить стикерпак')) {
          // Commands that should be handled by sticker bot even outside its chat? Open bot chat
          if (text.trim().toLowerCase().startsWith('/newpack') || text.trim().toLowerCase() === '/mypacks' || text.trim().toLowerCase().startsWith('/deletepack') || text.trim().toLowerCase() === 'удалить стикерпак') {
            // If not in sticker bot chat, open it
            if (!isStickerBot) {
              ensureStickerBotChat();
              state.activeChatId = STICKER_BOT_ID;
              if (typeof renderChats === 'function') renderChats();
              if (typeof renderActiveChat === 'function') renderActiveChat({ animate: true });
            }
            if (isHandledStickerCommand(text)) {
              addStickerBotUserCommand(text);
              handleStickerCommand(text, files);
              return; // Handled
            }
          }
          // Inside sticker bot chat, handle all slash commands
          if (isStickerBot && isHandledStickerCommand(text)) {
            addStickerBotUserCommand(text);
            handleStickerCommand(text, files);
            return;
          }
        }

        // Fallback to original
        return originalSend.apply(this, arguments);
      };
      window.sendMessage.__stickerPatched = true;
    }

    // Sticker Bot is opened only from the sticker panel or search.
    document.querySelectorAll('[data-drawer-action="sticker-bot"]').forEach((button) => button.remove());
  }

  // Load custom packs into stickers UI
  function injectCustomPacksIntoStickers() {
    const packs = getCustomPacks();
    if (!window.__onixStickers || !window.__onixStickers.packs) return;
    packs.forEach(p => {
      if (window.__onixStickers.packs.some(existing => existing.id === p.id)) return;
      window.__onixStickers.packs.push({
        id: p.id,
        name: p.name + ' (мой)',
        emoji: '⭐',
        path: '',
        count: p.stickers.length,
        files: p.stickers,
        isCustom: true
      });
    });
  }

  function openStickerBotChat() {
    const chat = ensureStickerBotChat();
    if (!chat) return null;
    state.activeChatId = STICKER_BOT_ID;
    document.getElementById('messenger')?.classList.add('chat-open');
    if (typeof renderChats === 'function') renderChats();
    if (typeof renderActiveChat === 'function') renderActiveChat({ animate: true, focusComposer: true });
    setTimeout(ensureStickerBotStarted, 0);
    return chat;
  }

  // Init
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        installHooks();
        setTimeout(injectCustomPacksIntoStickers, 800);
      });
    } else {
      installHooks();
      setTimeout(injectCustomPacksIntoStickers, 500);
    }

    // Do not recreate a deleted bot chat. Auto-start runs only after the user opens Sticker Bot.
    setTimeout(ensureStickerBotStarted, 800);

  }

  init();

  window.__stickerBot = {
    ensureChat: ensureStickerBotChat,
    ensure: ensureStickerBotChat,
    open: openStickerBotChat,
    newPack: startNewPack,
    deletePack: openDeletePackPicker,
    renamePack: openRenamePackPicker,
    getPacks: getCustomPacks,
    handleSubmit: handleStickerBotSubmit,
    executeCommand: executeStickerBotCommand,
    canHandleCommand: isHandledStickerCommand,
    isFlowInput: isStickerBotFlowInput
  };
})();
