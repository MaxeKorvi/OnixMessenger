/* Onix advanced features — view-once REMOVED per user request, translation & other features kept */
(function onixAdvancedFeatures() {
  'use strict';

  const PREFS_KEY = 'onix_advanced_preferences_v1';
  const SYNC_SEQ_PREFIX = 'onix_advanced_sync_seq:';
  const ICONS = {
    default: 'assets/onix-logo.png',
    plus: 'assets/onix-plus-icon.png',
    minimal: 'assets/support-icon.png'
  };
  // viewOnce disabled
  let viewOnceNext = false;
  let advancedPrefs = readJson(PREFS_KEY, {
    appIcon: 'default',
    nicknameColor: '#7C5CFF',
    animatedAvatarEnabled: true,
    translationEnabled: true,
    translationTarget: '',
    translationAutoForPremium: true,
    translationOutgoingEnabled: false,
    translationOutgoingTarget: 'en',
    protectedContentEnabled: false,
    notificationTones: {}
  });
  let syncBusy = false;
  const translatorPromises = new Map();
  // One-time heal for older builds that stored translationTarget="auto" (became "au")
  (function healTranslationTargetOnce() {
    try {
      const raw = String(advancedPrefs.translationTarget || '').toLowerCase();
      if (!raw || raw === 'auto' || raw === 'au' || raw === 'und') {
        const ui = String((typeof state !== 'undefined' && state?.settings?.language) || 'ru').toLowerCase().slice(0, 2);
        advancedPrefs.translationTarget = ui || 'ru';
        writeJson(PREFS_KEY, advancedPrefs);
      }
    } catch (_) {}
  })();


const ONIX_TRANSLATE_LANGS = ['ru','en','uk','be','kk','uz','tr','de','fr','es','it','pt','pl','cs','sk','nl','sv','fi','no','da','el','ro','hu','bg','sr','hr','ar','he','fa','hi','bn','zh','ja','ko','vi','th','id','ms','tl','ka','hy','az','sw'];
  const ONIX_LANG_LABELS = {
    ru:'Русский', en:'English', uk:'Українська', be:'Беларуская', kk:'Қазақша', uz:"Oʻzbekcha",
    tr:'Türkçe', de:'Deutsch', fr:'Français', es:'Español', it:'Italiano', pt:'Português',
    pl:'Polski', cs:'Čeština', sk:'Slovenčina', nl:'Nederlands', sv:'Svenska', fi:'Suomi',
    no:'Norsk', da:'Dansk', el:'Ελληνικά', ro:'Română', hu:'Magyar', bg:'Български',
    sr:'Srpski', hr:'Hrvatski', ar:'العربية', he:'עברית', fa:'فارسی', hi:'हिन्दी', bn:'বাংলা',
    zh:'中文', ja:'日本語', ko:'한국어', vi:'Tiếng Việt', th:'ไทย', id:'Indonesia', ms:'Melayu',
    tl:'Filipino', ka:'ქართული', hy:'Հայերեն', az:'Azərbaycan', sw:'Kiswahili'
  };

  function langLabel(code) {
    const c = String(code || '').toLowerCase().slice(0, 2);
    return ONIX_LANG_LABELS[c] ? `${ONIX_LANG_LABELS[c]} (${c})` : String(code || '').toUpperCase();
  }



  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) { return fallback; }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  function currentSyncKey() {
    const id = state?.currentUser?.serverId || state?.currentUser?.id || 'guest';
    return `${SYNC_SEQ_PREFIX}${id}`;
  }

  function messageSyncKey(message) {
    const serverId = Number(message?.serverId || String(message?.id || '').replace(/^srv-/, ''));
    if (serverId > 0) return `srv:${serverId}`;
    return `local:${String(message?.id || '')}`;
  }
  window.onixMessageSyncKey = messageSyncKey;

  function findSavedMessageByKey(key) {
    const chat = typeof getSavedChat === 'function' ? getSavedChat() : state?.chats?.find((item) => item.id === 'saved');
    return (chat?.messages || []).find((message) => messageSyncKey(message) === String(key));
  }

  function updateTagCatalog(tag) {
    const chat = typeof getSavedChat === 'function' ? getSavedChat() : state?.chats?.find((item) => item.id === 'saved');
    if (!chat || !tag || tag.deleted) return;
    const catalog = typeof ensureSavedTagsState === 'function' ? ensureSavedTagsState(chat) : (chat.savedTagCatalog ||= []);
    const existing = catalog.find((item) => String(item.name).toLowerCase() === String(tag.name).toLowerCase());
    if (existing) Object.assign(existing, { id: tag.id, name: tag.name, color: tag.color });
    else catalog.unshift({ id: tag.id, name: tag.name, color: tag.color || '#7C5CFF' });
    chat.savedTagCatalog = catalog.slice(0, 100);
  }

  function applyTagEdge(edge) {
    if (!edge) return false;
    const message = findSavedMessageByKey(edge.messageKey);
    if (!message) return false;
    const name = String(edge.tagName || '').trim();
    if (!name) return false;
    const tags = typeof normalizeMessageTags === 'function' ? normalizeMessageTags(message) : (message.tags || []);
    const key = name.toLowerCase();
    const next = tags.filter((tag) => String(tag).toLowerCase() !== key);
    if (!edge.deleted) next.push(name);
    message.tags = Array.from(new Set(next));
    return true;
  }

  function applySyncPayload(kind, payload) {
    let changed = false;
    if (kind === 'saved_tag.applied') {
      updateTagCatalog(payload?.tag);
      changed = applyTagEdge(payload?.edge) || changed;
    } else if (kind === 'saved_tag.removed') {
      changed = applyTagEdge(payload?.edge) || changed;
    } else if (kind === 'preferences.updated') {
      advancedPrefs = { ...advancedPrefs, ...(payload || {}) };
      writeJson(PREFS_KEY, advancedPrefs);
      applyAdvancedPreferences();
    } else if (kind === 'message.view_once_consumed') {
      // view-once removed — ignore
      return false;
    }
    return changed;
  }

  async function syncAdvancedState(options = {}) {
    if (!state?.currentUser || typeof apiGet !== 'function' || !canUseServerApi?.()) return;
    if (syncBusy && !options.force) return;
    syncBusy = true;
    try {
      let after = Number(localStorage.getItem(currentSyncKey()) || 0);
      // Full snapshot on first sync or when forced with empty local catalog
      if (options.full || after <= 0) after = 0;
      const result = await apiGet(`v2/advanced/sync?after_seq=${after}`);
      if (!result?.ok) return;
      let changed = false;
      const snapshot = result.data?.snapshot;
      if (snapshot) {
        // Many-to-many: rebuild catalog + edges from server truth
        (snapshot.tags || []).forEach(updateTagCatalog);
        (snapshot.edges || []).forEach((edge) => { changed = applyTagEdge(edge) || changed; });
      }
      (result.data?.events || []).forEach((event) => {
        if (String(event.kind || '').includes('view_once')) return;
        changed = applySyncPayload(event.kind, event.payload) || changed;
      });
      const latest = Number(result.data?.latestSeq || after);
      if (latest >= after) localStorage.setItem(currentSyncKey(), String(latest));
      if (changed) {
        persistChats?.();
        renderChats?.();
        if (typeof isSavedChat === 'function' && isSavedChat(activeChat?.())) {
          renderActiveChat?.({ animate: false, focusComposer: false, preserveScroll: true });
        }
      }
      if (options.translate !== false) translateVisibleMessages();
    } finally {
      syncBusy = false;
    }
  }
  window.syncOnixAdvancedState = syncAdvancedState;

  function wrapTagMutations() {
    if (typeof addTagToSavedMessage === 'function' && !addTagToSavedMessage.__onixSynced) {
      const originalAdd = addTagToSavedMessage;
      addTagToSavedMessage = function syncedAddTag(messageId, tagName) {
        const result = originalAdd.apply(this, arguments);
        if (result && canUseServerApi?.()) {
          const chat = getSavedChat?.() || activeChat?.();
          const message = (chat?.messages || []).find((item) => String(item.id) === String(messageId));
          const catalog = ensureSavedTagsState?.(chat) || [];
          const tag = catalog.find((item) => String(item.name).toLowerCase() === String(tagName).trim().toLowerCase());
          apiPost('v2/advanced/tags/apply', {
            messageKey: messageSyncKey(message),
            tagName,
            color: tag?.color || '#7C5CFF'
          }).then((response) => {
            if (response?.data?.syncSeq) localStorage.setItem(currentSyncKey(), String(response.data.syncSeq));
            // Pull soon so other devices (and this one after refresh) converge quickly
            setTimeout(() => syncAdvancedState({ force: true }), 300);
          });
        }
        return result;
      };
      addTagToSavedMessage.__onixSynced = true;
    }
    if (typeof removeTagFromSavedMessage === 'function' && !removeTagFromSavedMessage.__onixSynced) {
      const originalRemove = removeTagFromSavedMessage;
      removeTagFromSavedMessage = function syncedRemoveTag(messageId, tagName) {
        const chat = getSavedChat?.() || activeChat?.();
        const message = (chat?.messages || []).find((item) => String(item.id) === String(messageId));
        const result = originalRemove.apply(this, arguments);
        if (result && message && canUseServerApi?.()) {
          apiPost('v2/advanced/tags/remove', {
            messageKey: messageSyncKey(message),
            tagName
          }).then((response) => {
            if (response?.data?.syncSeq) localStorage.setItem(currentSyncKey(), String(response.data.syncSeq));
            setTimeout(() => syncAdvancedState({ force: true }), 300);
          });
        }
        return result;
      };
      removeTagFromSavedMessage.__onixSynced = true;
    }
  }

  // REMOVED: One-time message toggle – now deletes any existing button
  function ensureViewOnceToggle() {
    viewOnceNext = false;
    const existing = document.getElementById('viewOnceToggle');
    if (existing) existing.remove();
    // Also remove any leftover CSS class
    document.querySelectorAll('.view-once-toggle').forEach(el => el.remove());
    // Remove view-once cards from DOM observer later
  }

  // Wrap sendMessage but WITHOUT viewOnce logic – only translation remains
  function wrapSendMessage() {
    if (typeof sendMessage !== 'function') return;
    if (sendMessage.__onixViewOncePatched) return;
    // If already patched by previous version, we need to unwrap? We just ensure translation still works without viewOnce
    const original = sendMessage.__onixOriginal || sendMessage;
    const patched = function advancedSendMessageNoOnce(text, files = [], extras = {}) {
      // Force-remove any viewOnce flags user might still send
      const cleanedExtras = { ...(extras || {}) };
      delete cleanedExtras.viewOnce;
      // Ensure our button never re-enables
      viewOnceNext = false;
      document.getElementById('viewOnceToggle')?.classList.remove('active');
      // Protected / secret-style messages: no forward + no copy when privacy mode is on
      if (advancedPrefs.protectedContentEnabled && !cleanedExtras.autoreply) {
        cleanedExtras.protectedContent = true;
        cleanedExtras.disableForwarding = true;
      }

      const shouldTranslateOutgoing = Boolean(
        advancedPrefs.translationOutgoingEnabled
        && isPremiumUser?.()
        && String(text || '').trim()
        && !String(text || '').trim().startsWith('/')
        && !cleanedExtras.autoreply
        && !cleanedExtras.translationProcessed
      );
      if (shouldTranslateOutgoing) {
        // silent outgoing translate
        translateText(String(text || ''), advancedPrefs.translationOutgoingTarget || 'en')
          .then((translated) => {
            original.call(this, translated || text, files, {
              ...cleanedExtras,
              translationProcessed: true,
              originalText: String(text || '')
            });
          })
          .catch(() => {
            original.call(this, text, files, { ...cleanedExtras, translationProcessed: true });
            // silent outgoing fallback
          });
        return true;
      }
      return original.call(this, text, files, cleanedExtras);
    };
    patched.__onixOriginal = original;
    patched.__onixViewOncePatched = true;
    // Mark as handled so older wrapper doesn't re-apply viewOnce
    patched.__onixViewOnce = true;
    sendMessage = patched;
  }

  // Instead of a view-once card, show normal message content
  window.renderViewOnceMessage = function renderViewOnceMessage(message) {
    // If message already consumed, show it as regular text (user requested removal)
    const text = message?.text || '';
    if (text) {
      try {
        return `<div class="message-text">${renderMessageText(text)}</div>`;
      } catch(e) {
        return `<div class="message-text">${escapeHtml(text)}</div>`;
      }
    }
    return '<div class="view-once-card is-consumed" style="display:none"></div>';
  };

  function mediaHtmlFromOnce(metadata = {}) {
    // View-once removed – return empty, files will be shown normally via regular attachments
    return '';
  }

  async function consumeOnce(messageId) {
    // Disabled – just show toast that feature removed
    toast?.('Одноразовые сообщения отключены');
    return;
  }

  function applyAdvancedPreferences() {
    const color = advancedPrefs.nicknameColor || '#7C5CFF';
    document.documentElement.style.setProperty('--onix-nickname-color', color);
    document.documentElement.style.setProperty('--sender-name-color', color);
    document.body?.classList.toggle('disable-animated-avatars', advancedPrefs.animatedAvatarEnabled === false);
    document.body?.classList.toggle('protected-content-mode', Boolean(advancedPrefs.protectedContentEnabled));
    document.body?.classList.toggle('onix-custom-nickname', true);
    if (document.body) document.body.dataset.onixAppIcon = advancedPrefs.appIcon || 'default';
    // Prefer custom PWA/app icons
    const icon = ICONS[advancedPrefs.appIcon] || ICONS.default;
    document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((node) => {
      node.href = icon;
    });
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
      favicon.href = icon;
    }
    // Reflect nickname color on own profile labels in groups if present
    document.querySelectorAll('.message-row.mine-left .message-author-name, .message-row.me .message-author-name').forEach((node) => {
      node.style.setProperty('--sender-name-color', color);
    });
  }

  async function savePreferences(patch) {
    advancedPrefs = { ...advancedPrefs, ...patch };
    writeJson(PREFS_KEY, advancedPrefs);
    window.onixAdvancedPrefs = advancedPrefs;
    applyAdvancedPreferences();
    if (canUseServerApi?.()) {
      const result = await apiPost('v2/advanced/preferences', patch);
      if (result?.ok) advancedPrefs = { ...advancedPrefs, ...(result.data?.preferences || {}) };
      if (result?.data?.syncSeq) localStorage.setItem(currentSyncKey(), String(result.data.syncSeq));
      writeJson(PREFS_KEY, advancedPrefs);
      window.onixAdvancedPrefs = advancedPrefs;
    }
  }

  async function loadPreferences() {
    if (!canUseServerApi?.()) {
      applyAdvancedPreferences();
      schedulePremiumAutoTranslate();
      return;
    }
    const result = await apiGet('v2/advanced/preferences');
    if (result?.ok) {
      advancedPrefs = { ...advancedPrefs, ...(result.data?.preferences || {}) };
      // Premium default: auto-translate ON unless user turned it off before
      if (isPremiumUser?.() && advancedPrefs.translationEnabled == null) {
        advancedPrefs.translationEnabled = true;
      }
      // Heal broken translationTarget values like "auto"/"au"
      const healed = preferredTranslationTarget();
      if (!normalizeLangCode(advancedPrefs.translationTarget) || String(advancedPrefs.translationTarget).toLowerCase() === 'auto') {
        advancedPrefs.translationTarget = healed;
      }
      writeJson(PREFS_KEY, advancedPrefs);
    }
    applyAdvancedPreferences();
    schedulePremiumAutoTranslate();
  }

  function openAdvancedSettings() {
    const chat = activeChat?.();
    const toneLabel = chat?.customNotificationSoundName || 'Стандартный звук';
    openSimpleModal?.('Приватность и перевод', `
      <div class="advanced-settings-sheet">
        <section class="advanced-card">
          <h3>Персонализация</h3>
          <label><span>Иконка приложения</span><select id="advancedAppIcon">
            <option value="default" ${advancedPrefs.appIcon === 'default' ? 'selected' : ''}>Onix</option>
            <option value="plus" ${advancedPrefs.appIcon === 'plus' ? 'selected' : ''}>Onix Plus</option>
            <option value="minimal" ${advancedPrefs.appIcon === 'minimal' ? 'selected' : ''}>Минималистичная</option>
          </select></label>
          <label><span>Цвет никнейма</span><input id="advancedNicknameColor" type="color" value="${escapeHtml(advancedPrefs.nicknameColor || '#7C5CFF')}" /></label>
          <label class="advanced-switch"><span><b>Анимированные аватарки</b><small>Видео и GIF в профиле</small></span><input id="advancedAnimatedAvatar" type="checkbox" ${advancedPrefs.animatedAvatarEnabled !== false ? 'checked' : ''}></label>
        </section>
        <section class="advanced-card">
          <h3>Приватность</h3>
          <label class="advanced-switch"><span><b>Защищённый режим</b><small>Запрет копирования и пересылки защищённых сообщений, скрытие при печати и сворачивании.</small></span><input id="advancedProtectedMode" type="checkbox" ${advancedPrefs.protectedContentEnabled ? 'checked' : ''}></label>
          <p class="advanced-warning">Веб-приложение не может на 100% определить, что экран фотографируют другим телефоном. Реализована best-effort защита: скрытие при PrintScreen/сворачивании/печати, запрет копирования и пересылки, blur чувствительного содержимого. Для Premium при срабатывании защиты собеседник может получить уведомление «возможная попытка снимка» (если оба в Onix и защита включена).</p>
        </section>
        <section class="advanced-card">
          <h3>ИИ-переводчик · Premium</h3>
          <label class="advanced-switch"><span><b>Автоперевод входящих (Premium)</b><small>Plus: автоперевод без лимита. Без Plus: только кнопка «Перевести», 3 раза в день.</small></span><input id="advancedTranslation" type="checkbox" ${advancedPrefs.translationEnabled !== false ? 'checked' : ''} ${isPremiumUser?.() ? '' : 'disabled'}></label>
          <label><span>Входящие переводить на</span><select id="advancedTranslationTarget">
            ${ONIX_TRANSLATE_LANGS.map((lang) => `<option value="${lang}" ${preferredTranslationTarget() === lang ? 'selected' : ''}>${langLabel(lang)}</option>`).join('')}
          </select></label>
          <label class="advanced-switch"><span><b>Автоперевод исходящих</b><small>Перед отправкой переводит набранный текст на язык собеседника.</small></span><input id="advancedTranslationOutgoing" type="checkbox" ${advancedPrefs.translationOutgoingEnabled ? 'checked' : ''} ${isPremiumUser?.() ? '' : 'disabled'}></label>
          <label><span>Исходящие переводить на</span><select id="advancedTranslationOutgoingTarget">
            ${ONIX_TRANSLATE_LANGS.map((lang) => `<option value="${lang}" ${advancedPrefs.translationOutgoingTarget === lang ? 'selected' : ''}>${langLabel(lang)}</option>`).join('')}
          </select></label>
        </section>
        <section class="advanced-card">
          <h3>Текущий чат</h3>
          <button type="button" class="simple-option" id="advancedCustomSound"><span><b>Свой звук уведомления</b><small>${escapeHtml(toneLabel)} · MP3/OGG/WAV до 1,5 МБ</small></span></button>
          <input id="advancedSoundInput" type="file" accept="audio/mpeg,audio/ogg,audio/wav,audio/mp4" hidden>
          <div class="shared-theme-row">
            ${['default','violet','ocean','sunset'].map((theme) => `<button type="button" data-shared-theme="${theme}" class="theme-dot theme-${theme}" title="${theme}"></button>`).join('')}
            <span>Тема для обоих собеседников</span>
          </div>
        </section>
        <button class="primary-button" id="advancedSaveSettings" type="button">Сохранить</button>
      </div>
    `);
  }

  window.openOnixAdvancedSettings = openAdvancedSettings;

  async function setOutgoingTranslation(targetLang, enabled = true) {
    const code = normalizeLangCode(targetLang) || preferredTranslationTarget() || 'en';
    await savePreferences({
      translationOutgoingEnabled: Boolean(enabled),
      translationOutgoingTarget: code
    });
    advancedPrefs.translationOutgoingEnabled = Boolean(enabled);
    advancedPrefs.translationOutgoingTarget = code;
    writeJson(PREFS_KEY, advancedPrefs);
    window.onixAdvancedPrefs = advancedPrefs;
    return code;
  }
  window.onixSetOutgoingTranslation = setOutgoingTranslation;

  async function setIncomingAutoTranslate(enabled) {
    advancedPrefs.translationEnabled = Boolean(enabled);
    advancedPrefs.translationAutoForPremium = Boolean(enabled);
    writeJson(PREFS_KEY, advancedPrefs);
    window.onixAdvancedPrefs = advancedPrefs;
    if (canUseServerApi?.()) {
      try { await savePreferences({ translationEnabled: Boolean(enabled), translationAutoForPremium: Boolean(enabled) }); } catch (_) {}
    }
    if (enabled) {
      try { schedulePremiumAutoTranslate?.(200); } catch (_) {}
    }
    return Boolean(enabled);
  }
  window.onixSetIncomingAutoTranslate = setIncomingAutoTranslate;

  window.onixAdvancedPrefs = advancedPrefs;


    function userUiLanguage() {
    try {
      const fromSettings = String(state?.settings?.language || '').toLowerCase();
      if (fromSettings) return fromSettings.slice(0, 2);
    } catch (_) {}
    try {
      const nav = String(navigator.language || 'ru').toLowerCase();
      if (nav) return nav.slice(0, 2);
    } catch (_) {}
    return 'ru';
  }

  // Languages accepted by MyMemory / common ISO 639-1 translators
  const ONIX_API_LANGS = new Set([
    'ru','en','uk','be','kk','uz','tr','de','fr','es','it','pt','pl','cs','sk','nl','sv','fi','no','da',
    'el','ro','hu','bg','sr','hr','ar','he','fa','hi','bn','zh','ja','ko','vi','th','id','ms','tl','ka','hy','az','sw',
    'ky','tg','et','lv','lt','sl','mk','sq','bs','is','ga','cy','mt','eu','ca','gl','af','sw','ur','ne','si','my','km','lo'
  ]);

  // Map UI language codes / broken values to valid translator codes
  const ONIX_LANG_ALIASES = {
    auto: '',
    au: '',          // broken leftover from slice('auto'->'au')
    und: '',
    ua: 'uk',
    nb: 'no',
    nn: 'no',
    iw: 'he',
    jv: 'id',
    in: 'id',
    cn: 'zh',
    tw: 'zh',
    jp: 'ja',
    kr: 'ko',
    br: 'pt',
    la: 'es',
    se: 'sv',
    dk: 'da',
    gr: 'el',
    ir: 'fa',
    pk: 'ur',
    vn: 'vi',
    cz: 'cs'
  };

  function preferredTranslationTarget() {
    // Never send "auto"/"au" as target language to the API.
    let raw = String(advancedPrefs.translationTarget || '').trim().toLowerCase();
    if (!raw || raw === 'auto') raw = userUiLanguage();
    let code = normalizeLangCode(raw);
    if (!code || !ONIX_API_LANGS.has(code)) {
      code = normalizeLangCode(userUiLanguage()) || 'ru';
    }
    if (!ONIX_API_LANGS.has(code)) code = 'ru';
    // Self-heal persisted broken value ('auto' / 'au')
    if (String(advancedPrefs.translationTarget || '').toLowerCase() in { auto:1, au:1, und:1, '':1 }) {
      advancedPrefs.translationTarget = code;
      try { writeJson(PREFS_KEY, advancedPrefs); } catch (_) {}
    }
    return code;
  }

  function userLooksPremium() {
    try {
      if (typeof isPremiumUser === 'function' && isPremiumUser()) return true;
    } catch (_) {}
    try {
      const u = state?.currentUser;
      if (!u) return false;
      if (u.isPremium || u.premium || u.is_premium) return true;
      const renew = Number(u.premiumRenewAt || u.premiumUntil || 0);
      if (renew > Date.now()) return true;
    } catch (_) {}
    return false;
  }

  function isPremiumAutoTranslateEnabled() {
    // Premium only. Free users never auto-translate — they use the manual «Перевести» button.
    if (!userLooksPremium()) return false;
    // Onix Plus tumbler
    try {
      if (typeof isPlusFeatureEnabled === 'function' && !isPlusFeatureEnabled('autoTranslate')) return false;
    } catch (_) {}
    // Off only if user explicitly disabled the switch.
    if (advancedPrefs.translationEnabled === false) return false;
    if (advancedPrefs.translationAutoForPremium === false) return false;
    // Also respect settings flag if present
    try {
      if (state?.settings && state.settings.plusAutoTranslateEnabled === false) return false;
    } catch (_) {}
    return true;
  }
  window.isPremiumAutoTranslateEnabled = isPremiumAutoTranslateEnabled;

  function normalizeLangCode(code) {
    let c = String(code || '').trim().toLowerCase().replace(/_/g, '-');
    if (!c) return '';
    // full tags first
    if (c.startsWith('zh')) return 'zh';
    if (c === 'auto' || c === 'au' || c === 'und') return '';
    // take primary subtag
    c = c.split('-')[0];
    if (ONIX_LANG_ALIASES[c] !== undefined) {
      c = ONIX_LANG_ALIASES[c];
    }
    if (!c) return '';
    c = c.slice(0, 2);
    // reject non-alpha garbage
    if (!/^[a-z]{2}$/.test(c)) return '';
    return c;
  }

  function scriptHints(text) {
    const value = String(text || '');
    return {
      cyrillic: /[\u0400-\u04FF]/.test(value),
      latin: /[A-Za-z]/.test(value),
      arabic: /[\u0600-\u06FF]/.test(value),
      hebrew: /[\u0590-\u05FF]/.test(value),
      cjk: /[\u4E00-\u9FFF]/.test(value),
      japanese: /[\u3040-\u30FF]/.test(value),
      korean: /[\uAC00-\uD7AF]/.test(value),
      greek: /[\u0370-\u03FF]/.test(value),
      thai: /[\u0E00-\u0E7F]/.test(value),
      devanagari: /[\u0900-\u097F]/.test(value),
      georgian: /[\u10A0-\u10FF]/.test(value),
      armenian: /[\u0530-\u058F]/.test(value)
    };
  }

  function heuristicLanguage(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    const h = scriptHints(value);
    // Strong script signals first (fixes Arabic etc. being misread as EN layout)
    if (h.arabic) return 'ar';
    if (h.hebrew) return 'he';
    if (h.japanese) return 'ja';
    if (h.korean) return 'ko';
    if (h.cjk) return 'zh';
    if (h.thai) return 'th';
    if (h.devanagari) return 'hi';
    if (h.greek) return 'el';
    if (h.georgian) return 'ka';
    if (h.armenian) return 'hy';
    if (h.cyrillic) {
      // crude uk/be/kk hints
      if (/[іїєґІЇЄҐ]/.test(value)) return 'uk';
      if (/[ўЎіІ]/.test(value) && !/[ыэёЫЭЁ]/.test(value)) return 'be';
      if (/[әғқңөұүһӘҒҚҢӨҰҮҺ]/.test(value)) return 'kk';
      return 'ru';
    }
    if (h.latin) {
      // very light keyword hints; default english for latin
      if (/\b(el|la|los|las|hola|gracias|por)\b/i.test(value)) return 'es';
      if (/\b(le|la|les|bonjour|merci|avec)\b/i.test(value)) return 'fr';
      if (/\b(der|die|das|und|nicht|danke)\b/i.test(value)) return 'de';
      if (/\b(ve|bir|için|teşekkür|merhaba)\b/i.test(value)) return 'tr';
      return 'en';
    }
    return '';
  }

  async function detectSourceLanguage(text, targetLanguage) {
    const value = String(text || '').trim();
    if (!value) return '';
    const target = normalizeLangCode(targetLanguage || preferredTranslationTarget());

    // 1) Script heuristics are reliable for ar/he/cjk/cyrillic — prefer them
    const hinted = heuristicLanguage(value);
    if (hinted && ['ar','he','zh','ja','ko','th','hi','el','ka','hy','fa'].includes(hinted)) {
      return hinted;
    }

    // 2) Browser LanguageDetector when available
    try {
      if (window.LanguageDetector?.create) {
        const detector = await window.LanguageDetector.create();
        const candidates = await detector.detect(value);
        const detected = normalizeLangCode(candidates?.[0]?.detectedLanguage || candidates?.[0]?.language || '');
        if (detected) return detected;
      }
    } catch (_) {}

    if (hinted) return hinted;
    // unknown latin-ish text: treat as not-target so user can still translate
    return target === 'en' ? 'und' : 'en';
  }

  function isSameLanguage(sourceLang, targetLang) {
    const s = normalizeLangCode(sourceLang);
    const t = normalizeLangCode(targetLang);
    if (!s || !t) return false;
    if (s === 'und' || s === 'auto') return false;
    return s === t;
  }

  async function getTranslator(sourceLanguage, targetLanguage) {
    const source = normalizeLangCode(sourceLanguage) || 'en';
    const target = normalizeLangCode(targetLanguage) || preferredTranslationTarget();
    if (source === target) return null;
    const key = `${source}:${target}`;
    if (translatorPromises.has(key)) return translatorPromises.get(key);
    const promise = (async () => {
      try {
        if (window.Translator?.create) {
          return await window.Translator.create({ sourceLanguage: source, targetLanguage: target });
        }
        if (window.translation?.createTranslator) {
          return await window.translation.createTranslator({ sourceLanguage: source, targetLanguage: target });
        }
      } catch (_) {}
      return null;
    })();
    translatorPromises.set(key, promise);
    return promise;
  }


  function decodeTranslationEntities(value) {
    const raw = String(value ?? '');
    if (!raw) return '';
    // MyMemory often returns HTML entities and literal \n sequences
    let out = raw
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, n) => {
        try { return String.fromCodePoint(Number(n)); } catch { return _; }
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => {
        try { return String.fromCodePoint(parseInt(n, 16)); } catch { return _; }
      });
    try {
      const ta = document.createElement('textarea');
      ta.innerHTML = out;
      out = ta.value;
    } catch (_) {}
    return out;
  }

  function isBadTranslationResult(source, translated) {
    const src = String(source || '');
    const out = String(translated || '').trim();
    if (!out) return true;
    if (/invalid\s+target\s+language|invalid\s+source\s+language|langpair|example:\s*langpair|query length|please select|is an invalid|MYMEMORY WARNING|YOU USED ALL AVAILABLE/i.test(out)) {
      return true;
    }
    // Completely collapsed huge article into a few words — suspicious
    if (src.length > 400 && out.length < Math.max(40, src.length * 0.08)) return true;
    return false;
  }

  /**
   * Split text into translatable chunks while KEEPING original separators
   * (blank lines, single newlines, spaces). Critical for articles.
   * Returns [{type:'text'|'sep', value}]
   */
  function splitTranslationStructure(text) {
    const value = String(text ?? '');
    if (!value) return [];
    // Split on runs of newlines first (preserve paragraph breaks)
    const parts = value.split(/(\n+)/);
    const units = [];
    for (const part of parts) {
      if (!part) continue;
      if (/^\n+$/.test(part)) {
        units.push({ type: 'sep', value: part });
        continue;
      }
      // Further split very long paragraphs into ~420 char soft chunks on sentence/space boundaries
      if (part.length <= 420) {
        units.push({ type: 'text', value: part });
        continue;
      }
      let rest = part;
      while (rest.length > 420) {
        let cut = 420;
        const window = rest.slice(0, 420);
        const sentence = Math.max(
          window.lastIndexOf('. '),
          window.lastIndexOf('! '),
          window.lastIndexOf('? '),
          window.lastIndexOf('。'),
          window.lastIndexOf('\u05BE'), // Hebrew maqaf-ish soft points rarely
          window.lastIndexOf(' ')
        );
        if (sentence >= 120) cut = sentence + 1;
        units.push({ type: 'text', value: rest.slice(0, cut) });
        rest = rest.slice(cut);
      }
      if (rest) units.push({ type: 'text', value: rest });
    }
    return units;
  }

  function mapSourceLangForApi(code) {
    const c = normalizeLangCode(code) || 'auto';
    // MyMemory historically accepts "iw" for Hebrew; try "he" first in caller
    if (c === 'he') return 'he';
    if (c === 'zh') return 'zh-CN';
    if (c === 'nb' || c === 'nn') return 'no';
    return c === 'und' ? 'auto' : c;
  }

  async function translateViaMyMemory(text, sourceLanguage, targetLanguage) {
    let source = mapSourceLangForApi(sourceLanguage);
    if (!source || source === 'und') source = 'auto';
    let target = normalizeLangCode(targetLanguage) || preferredTranslationTarget();
    if (!target || target === 'auto' || target === 'au' || !ONIX_API_LANGS.has(target)) {
      target = preferredTranslationTarget();
    }
    if (!target || !ONIX_API_LANGS.has(target)) target = 'ru';
    if (source !== 'auto' && source !== 'zh-CN' && !ONIX_API_LANGS.has(source) && source !== 'he') {
      source = 'auto';
    }

    const attempts = [];
    // Primary pair
    attempts.push(`${source}|${target}`);
    // Hebrew alias fallback for older MyMemory catalogs
    if (source === 'he') attempts.push(`iw|${target}`);
    // Auto detect fallback
    if (source !== 'auto') attempts.push(`auto|${target}`);

    let lastError = null;
    for (const pair of attempts) {
      const url = 'https://api.mymemory.translated.net/get?q='
        + encodeURIComponent(text)
        + '&langpair=' + encodeURIComponent(pair);
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 16000);
      try {
        const response = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!response.ok) {
          lastError = new Error('Сервис перевода недоступен');
          continue;
        }
        const data = await response.json();
        const translated = decodeTranslationEntities(data?.responseData?.translatedText || '');
        if (!translated) {
          lastError = new Error('Пустой ответ перевода');
          continue;
        }
        if (isBadTranslationResult(text, translated)) {
          lastError = new Error('INVALID_LANGPAIR');
          continue;
        }
        return translated;
      } catch (e) {
        clearTimeout(timer);
        lastError = e;
      }
    }
    throw lastError || new Error('Не удалось перевести');
  }

  async function translatePlainChunk(text, sourceLanguage, targetLanguage) {
    const value = String(text ?? '');
    if (!value.trim()) return value; // keep pure whitespace chunks as-is

    // Prefer on-device Translator API for the chunk
    const source = normalizeLangCode(sourceLanguage) || 'auto';
    const target = normalizeLangCode(targetLanguage) || preferredTranslationTarget();
    const translator = await getTranslator(source === 'und' || source === 'auto' ? 'en' : source, target);
    if (translator?.translate) {
      try {
        const out = decodeTranslationEntities(await translator.translate(value));
        if (out && !isBadTranslationResult(value, out)) {
          // Preserve leading/trailing spaces from original chunk
          const lead = value.match(/^\s*/)?.[0] || '';
          const trail = value.match(/\s*$/)?.[0] || '';
          const core = out.replace(/^\s+|\s+$/g, '');
          return `${lead}${core}${trail}`;
        }
      } catch (_) {}
    }

    const translated = await translateViaMyMemory(value, sourceLanguage, target);
    // Preserve edge whitespace so article indentation/newlines around chunks stay intact
    const lead = value.match(/^\s*/)?.[0] || '';
    const trail = value.match(/\s*$/)?.[0] || '';
    const core = String(translated).replace(/^\s+|\s+$/g, '');
    return `${lead}${core}${trail}`;
  }

  /**
   * Structure-preserving translation:
   * - keeps blank lines / single newlines
   * - translates paragraph chunks separately
   * - does not collapse an article into one blob
   */
  async function translateText(text, targetLanguage = preferredTranslationTarget()) {
    const value = String(text ?? '');
    if (!value.trim()) return value;

    let target = normalizeLangCode(targetLanguage) || preferredTranslationTarget();
    if (!target || !ONIX_API_LANGS.has(target)) target = preferredTranslationTarget() || 'ru';

    // Detect on the full text (better for short Hebrew/Arabic phrases)
    const sourceLanguage = await detectSourceLanguage(value, target);

    if (isSameLanguage(sourceLanguage, target)) {
      const err = new Error('ALREADY_TARGET_LANGUAGE');
      err.code = 'ALREADY_TARGET_LANGUAGE';
      err.sourceLanguage = sourceLanguage;
      err.targetLanguage = target;
      throw err;
    }

    const units = splitTranslationStructure(value);
    // If only one small chunk — translate directly
    const textUnits = units.filter((u) => u.type === 'text' && u.value.trim());
    if (textUnits.length <= 1 && value.length <= 420) {
      return await translatePlainChunk(value, sourceLanguage, target);
    }

    const out = [];
    for (const unit of units) {
      if (unit.type === 'sep') {
        out.push(unit.value); // exact original newlines
        continue;
      }
      if (!unit.value.trim()) {
        out.push(unit.value);
        continue;
      }
      try {
        // Re-detect per chunk for mixed-language articles
        let chunkSource = sourceLanguage;
        try {
          const local = await detectSourceLanguage(unit.value, target);
          if (local) chunkSource = local;
        } catch (_) {}
        if (isSameLanguage(chunkSource, target)) {
          out.push(unit.value); // leave already-target paragraphs alone
        } else {
          out.push(await translatePlainChunk(unit.value, chunkSource, target));
        }
      } catch (e) {
        // On chunk failure keep original paragraph instead of breaking the whole article
        out.push(unit.value);
      }
    }
    const joined = out.join('');
    if (isBadTranslationResult(value, joined) && joined.replace(/\s+/g, '') === value.replace(/\s+/g, '')) {
      // nothing useful happened
      return joined;
    }
    return joined;
  }
  // expose for app.js context actions
  window.onixTranslateText = translateText;
  window.onixDetectLanguage = detectSourceLanguage;
  window.onixPreferredTranslationTarget = preferredTranslationTarget;
  window.onixIsSameLanguage = isSameLanguage;

  async function translateMessageInline(message, targetLanguage = preferredTranslationTarget()) {
    if (!message || message.viewOnce) return { ok: false, reason: 'unsupported' };
    if (message._translationBusy) return { ok: false, reason: 'busy' };
    let target = normalizeLangCode(targetLanguage) || preferredTranslationTarget();
    if (!target || !ONIX_API_LANGS.has(target)) target = preferredTranslationTarget() || 'ru';
    const source = String(message.translationOriginalText || message.originalText || message.text || '');
    if (!source.trim()) return { ok: false, reason: 'empty' };

    // Already translated to this target
    if (message.translated && String(message.translationTarget || '') === target && String(message.text || '').trim()) {
      return { ok: true, reason: 'already', skipped: false };
    }

    // Skip if original is already user's language
    const detected = await detectSourceLanguage(source, target);
    if (isSameLanguage(detected, target)) {
      return { ok: false, reason: 'same_language', sourceLanguage: detected, targetLanguage: target, skipped: true };
    }

    message._translationBusy = true;
    try {
      // If a previous bug stored MyMemory error text as the message, restore original first
      const looksLikeApiError = /invalid\s+target\s+language|langpair|is an invalid|MYMEMORY WARNING/i.test(source);
      const realSource = looksLikeApiError && message.translationOriginalText
        ? String(message.translationOriginalText)
        : source;
      if (looksLikeApiError && message.translationOriginalText) {
        message.text = message.translationOriginalText;
        message.translated = false;
      }

      const translated = await translateText(realSource, target);
      const clean = String(translated ?? '');
      if (!clean.trim()) {
        delete message._translationBusy;
        return { ok: false, reason: 'empty_result' };
      }
      if (isBadTranslationResult(realSource, clean)) {
        delete message._translationBusy;
        return { ok: false, reason: 'bad_api' };
      }
      // Avoid nonsense: if API returns identical text, don't mark translated
      if (clean.replace(/\s+/g, ' ').trim() === realSource.replace(/\s+/g, ' ').trim()) {
        delete message._translationBusy;
        return { ok: false, reason: 'same_language', skipped: true };
      }
      // Don't apply translation that clearly destroyed RTL short phrases into garbage symbols only
      if (detected === 'he' || detected === 'ar' || detected === 'fa' || detected === 'ur') {
        const srcLetters = (realSource.match(/[\p{L}]/gu) || []).length;
        const outLetters = (clean.match(/[\p{L}]/gu) || []).length;
        if (srcLetters >= 2 && outLetters === 0) {
          delete message._translationBusy;
          return { ok: false, reason: 'bad_api' };
        }
      }

      if (!message.translationOriginalText) message.translationOriginalText = String(realSource);
      // Keep structure: do not collapse whitespace
      message.text = clean;
      message.translated = true;
      message.translationTarget = target;
      message.translationSourceLang = detected;
      message.translatedAt = new Date().toISOString();
      message.preserveWhitespace = true;
      delete message._translationBusy;
      persistChats?.();
      return { ok: true, reason: 'done', sourceLanguage: detected, targetLanguage: target };
    } catch (error) {
      delete message._translationBusy;
      if (error?.code === 'ALREADY_TARGET_LANGUAGE') {
        return { ok: false, reason: 'same_language', skipped: true, sourceLanguage: error.sourceLanguage, targetLanguage: target };
      }
      throw error;
    }
  }

  window.translateMessageInline = translateMessageInline;
  window.translateText = translateText;

  // In-flight guards for premium auto-translate
  let autoTranslateRunning = false;
  const autoTranslateAttempted = new Set(); // message keys already handled for current target

  function autoTranslateMessageKey(message, target) {
    const id = String(message?.id || message?.serverId || '');
    return `${id}::${target}`;
  }

  function shouldAutoTranslateMessage(message, chat, target) {
    if (!message || message.system) return false;
    if (!String(message.text || '').trim()) return false;
    if (message.viewOnce || message.protectedContent || message.poll || message.voice) return false;
    if (message.autoreply || message.xAutoreply) return false;
    // Already translated to the desired language
    if (message.translated && String(message.translationTarget || '') === String(target)) return false;
    // Skip pure service/bot command noise
    const text = String(message.text || '').trim();
    if (text.startsWith('/') && text.length < 40) return false;
    // In private chats: auto-translate only incoming
    const chatType = String(chat?.type || 'private').toLowerCase();
    if (chatType === 'private' || chatType === 'saved' || !chatType) {
      if (message.from === 'me') return false;
    }
    return true;
  }

  function chatHasForeignLanguageSignal(chat, target) {
    const list = Array.isArray(chat?.messages) ? chat.messages : [];
    if (!list.length) return false;
    const sample = list
      .filter((m) => m && !m.system && !m.voice && !m.poll && m.from !== 'me')
      .slice(-12)
      .map((m) => String(m.translationOriginalText || m.originalText || m.text || ''))
      .join('\n');
    if (!sample.trim()) return false;
    // Use app.js detector if available
    try {
      if (typeof heuristicDialogLanguageFromSample === 'function') {
        const code = heuristicDialogLanguageFromSample(sample, target);
        return Boolean(code && code !== target);
      }
    } catch (_) {}
    // Local script heuristic
    const he = (sample.match(/[\u0590-\u05FF]/g) || []).length;
    const ar = (sample.match(/[\u0600-\u06FF]/g) || []).length;
    const cyr = (sample.match(/[\u0400-\u04FF]/g) || []).length;
    const lat = (sample.match(/[A-Za-z]/g) || []).length;
    const letters = he + ar + cyr + lat;
    if (letters < 8) return false;
    const targetIsCyr = target === 'ru' || target === 'uk' || target === 'be' || target === 'kk';
    const targetIsLat = ['en','de','fr','es','it','pt','tr','pl','nl'].includes(target);
    if (targetIsCyr && (he >= 4 || ar >= 4 || (lat >= 8 && lat > cyr))) return true;
    if (targetIsLat && (he >= 4 || ar >= 4 || (cyr >= 8 && cyr > lat))) return true;
    if (!targetIsCyr && !targetIsLat && (he >= 4 || ar >= 4 || cyr >= 8 || lat >= 8)) return true;
    return false;
  }

  async function translateVisibleMessages(options = {}) {
    // FREE users: no automatic translation at all (manual «Перевести» only).
    if (!isPremiumAutoTranslateEnabled()) return { ok: false, reason: 'not_premium_or_disabled' };
    if (autoTranslateRunning && !options.force) return { ok: false, reason: 'busy' };

    const chat = typeof activeChat === 'function' ? activeChat() : null;
    if (!chat || !Array.isArray(chat.messages) || !chat.messages.length) return { ok: false, reason: 'no_chat' };

    const target = preferredTranslationTarget();
    if (!target || !ONIX_API_LANGS.has(target)) return { ok: false, reason: 'bad_target' };

    // Do not auto-translate empty/new chats or chats without a clear foreign language
    if (!chatHasForeignLanguageSignal(chat, target)) {
      return { ok: false, reason: 'no_foreign_language' };
    }

    autoTranslateRunning = true;
    let changed = false;
    let translatedCount = 0;
    let skippedSame = 0;
    let failed = 0;

    try {
      // Walk recent messages in chat model (more reliable than DOM classes)
      const list = chat.messages.slice(-60);
      for (const message of list) {
        if (!shouldAutoTranslateMessage(message, chat, target)) continue;
        const key = autoTranslateMessageKey(message, target);
        if (!options.force && autoTranslateAttempted.has(key) && !message._autoTranslateRetry) continue;
        autoTranslateAttempted.add(key);

        try {
          const result = await translateMessageInline(message, target);
          if (result?.skipped || result?.reason === 'same_language') {
            skippedSame += 1;
            message._autoTranslatedSame = target;
            continue;
          }
          if (result?.ok) {
            translatedCount += 1;
            changed = true;
            message._autoTranslatedAt = Date.now();
            delete message._autoTranslateRetry;
          } else {
            failed += 1;
            message._autoTranslateRetry = true;
            autoTranslateAttempted.delete(key);
          }
        } catch (error) {
          failed += 1;
          message._autoTranslateRetry = true;
          autoTranslateAttempted.delete(key);
        }
      }

      // Also mark DOM rows for UX consistency
      try {
        document.querySelectorAll('#messages .message-row[data-message-id]').forEach((row) => {
          const message = getMessageById?.(row.dataset.messageId || '');
          if (!message) return;
          if (message.translated && String(message.translationTarget || '') === target) {
            row.dataset.autoTranslated = 'true';
          } else if (message._autoTranslatedSame === target) {
            row.dataset.autoTranslated = 'same';
          }
        });
      } catch (_) {}

      if (changed) {
        persistChats?.();
        const scrollTop = document.getElementById('messages')?.scrollTop || 0;
        renderActiveChat?.({
          animate: false,
          preserveScroll: true,
          scrollTop,
          focusComposer: false
        });
      }
      return { ok: true, translatedCount, skippedSame, failed, target };
    } finally {
      autoTranslateRunning = false;
    }
  }
  window.translateVisibleMessages = translateVisibleMessages;

  function bindEvents() {
    document.addEventListener('click', async (event) => {
      // consume once disabled – intercept and prevent
      const consume = event.target.closest('[data-consume-once]');
      if (consume) {
        event.preventDefault();
        event.stopPropagation();
        toast?.('Одноразовые сообщения отключены');
        return;
      }
      if (event.target.closest('[data-drawer-action="advanced-features"]')) {
        closeDrawer?.();
        openAdvancedSettings();
        return;
      }
      if (event.target.closest('[data-drawer-action="create-guest-free"]')) {
        closeDrawer?.();
        openCreateGuestChatModal?.();
        return;
      }
      const translate = event.target.closest('[data-advanced-translate]');
      if (translate) {
        // Legacy path — prefer app.js data-message-action="translate"
        event.preventDefault();
        event.stopPropagation();
        const message = getMessageById?.(translate.dataset.advancedTranslate);
        if (!message?.text) return;
        const gate = (typeof ensureCanManualTranslate === 'function')
          ? ensureCanManualTranslate()
          : { ok: Boolean(isPremiumUser?.()), message: 'Перевод недоступен' };
        if (!gate.ok) {
          toast?.(gate.message || 'Лимит бесплатных переводов на сегодня исчерпан');
          openOnixPlusChat?.('/buy');
          return;
        }
        const scrollTop = document.getElementById('messages')?.scrollTop || 0;
        const oldHtml = translate.innerHTML;
        try {
          translate.disabled = true;
          translate.innerHTML = `<span>${iconSvg('language')}</span><span>Перевожу...</span>`;
          const target = preferredTranslationTarget();
          const result = await translateMessageInline(message, target);
          closeMessageContextMenu?.();
          renderActiveChat?.({ animate: false, preserveScroll: true, scrollTop });
          if (result?.skipped || result?.reason === 'same_language') {
            // silent
          } else if (result?.ok) {
            const spent = (typeof consumeFreeTranslateQuota === 'function')
              ? consumeFreeTranslateQuota()
              : { premium: true };
            if (!spent.premium) toast?.(`Осталось бесплатных переводов: ${spent.remaining}/${spent.limit}`);
          } else {
            toast?.('Не удалось перевести сообщение');
          }
        } catch (error) {
          toast?.(error?.message || 'Перевод недоступен (нужен интернет)');
          translate.innerHTML = oldHtml;
          translate.disabled = false;
        }
        return;
      }
      if (event.target.id === 'advancedSaveSettings') {
        const patch = {
          appIcon: document.getElementById('advancedAppIcon')?.value || 'default',
          nicknameColor: document.getElementById('advancedNicknameColor')?.value || '#7C5CFF',
          animatedAvatarEnabled: Boolean(document.getElementById('advancedAnimatedAvatar')?.checked),
          protectedContentEnabled: Boolean(document.getElementById('advancedProtectedMode')?.checked),
          translationEnabled: Boolean(document.getElementById('advancedTranslation')?.checked),
          translationAutoForPremium: Boolean(document.getElementById('advancedTranslation')?.checked),
          translationTarget: document.getElementById('advancedTranslationTarget')?.value || preferredTranslationTarget(),
          translationOutgoingEnabled: Boolean(document.getElementById('advancedTranslationOutgoing')?.checked),
          translationOutgoingTarget: document.getElementById('advancedTranslationOutgoingTarget')?.value || 'en'
        };
        translatorPromises.clear();
        await savePreferences(patch);
        closeSimpleModal?.();
        toast?.('Настройки сохранены');
        translateVisibleMessages();
      }
      if (event.target.closest('#advancedCustomSound')) {
        document.getElementById('advancedSoundInput')?.click();
      }
      const theme = event.target.closest('[data-shared-theme]');
      if (theme) {
        const chat = activeChat?.();
        if (!chat) return;
        chat.theme = theme.dataset.sharedTheme || 'default';
        persistChats?.();
        window.applyChatWallpaper?.(chat);
        renderActiveChat?.({ animate: false, focusComposer: false });
        if (chat.serverConversationId && canUseServerApi?.()) {
          apiPost('v2/conversations/update', { conversation_id: Number(chat.serverConversationId), theme: chat.theme });
        }
        toast?.('Тема синхронизируется для собеседников');
      }
    }, true);

    document.addEventListener('change', (event) => {
      if (event.target.id !== 'advancedSoundInput') return;
      const file = event.target.files?.[0];
      const chat = activeChat?.();
      if (!file || !chat) return;
      if (file.size > 1.5 * 1024 * 1024) {
        toast?.('Звук должен быть меньше 1,5 МБ');
        event.target.value = '';
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        chat.customNotificationSoundData = String(reader.result || '');
        chat.customNotificationSoundName = file.name;
        advancedPrefs.notificationTones = { ...(advancedPrefs.notificationTones || {}), [String(chat.serverConversationId || chat.id)]: file.name };
        persistChats?.();
        await savePreferences({ notificationTones: advancedPrefs.notificationTones });
        toast?.(`Звук «${file.name}» установлен`);
        openAdvancedSettings();
      };
      reader.readAsDataURL(file);
    }, true);

    // Single "Перевести" button is rendered by app.js message menu.
    // Do NOT inject a second data-advanced-translate button here.
    document.addEventListener('contextmenu', () => {
      setTimeout(() => {
        const menu = document.querySelector('.message-context .message-context-menu');
        if (!menu) return;
        // Clean any legacy duplicate translate buttons from older builds
        menu.querySelectorAll('[data-advanced-translate]').forEach((node) => node.remove());
      }, 0);
    }, true);

    document.addEventListener('copy', (event) => {
      if (event.target?.closest?.('.protected-message, [data-protected-view="true"]')) {
        event.preventDefault();
        toast?.('Копирование защищённого содержимого отключено');
      }
    }, true);
    document.addEventListener('dragstart', (event) => {
      if (event.target?.closest?.('.protected-message, [data-protected-view="true"]')) event.preventDefault();
    }, true);
    document.addEventListener('keydown', (event) => {
      if (!advancedPrefs.protectedContentEnabled) return;
      const key = String(event.key || '');
      const isPrint = key === 'PrintScreen';
      const isSavePage = (event.ctrlKey || event.metaKey) && key.toLowerCase() === 's';
      const isPrintDialog = (event.ctrlKey || event.metaKey) && key.toLowerCase() === 'p';
      if (isPrint || isSavePage || isPrintDialog) {
        event.preventDefault();
        document.body.classList.add('screen-capture-warning');
        toast?.('Защищённый режим: снимок/сохранение экрана ограничено браузером. Содержимое временно скрыто.');
        setTimeout(() => document.body.classList.remove('screen-capture-warning'), 1800);
      }
    });
    document.addEventListener('visibilitychange', () => {
      document.body.classList.toggle('protected-window-hidden', document.hidden && advancedPrefs.protectedContentEnabled);
    });
    // Best-effort: Screen Capture API / display-media start often blurs the page via visibility; also watch media devices.
    if (navigator.mediaDevices?.addEventListener) {
      try {
        navigator.mediaDevices.addEventListener('devicechange', () => {
          if (!advancedPrefs.protectedContentEnabled) return;
          document.body.classList.add('screen-capture-warning');
          setTimeout(() => document.body.classList.remove('screen-capture-warning'), 1200);
        });
      } catch (_) {}
    }
    // Block context menu copy on protected messages
    document.addEventListener('copy', (event) => {
      if (!advancedPrefs.protectedContentEnabled) return;
      const sel = window.getSelection?.()?.toString?.() || '';
      if (!sel) return;
      const protectedRow = document.querySelector('#messages .protected-message, #messages .message-row.protected-message');
      if (protectedRow || document.body.classList.contains('protected-content-mode')) {
        event.preventDefault();
        toast?.('Копирование отключено в защищённом режиме');
      }
    });
    document.addEventListener('dragstart', (event) => {
      if (!advancedPrefs.protectedContentEnabled) return;
      if (event.target?.closest?.('#messages .protected-message, #messages')) {
        event.preventDefault();
      }
    }, true);
  }

  function enhanceDrawer() {
    const menu = document.querySelector('.drawer-menu');
    if (!menu) return;
    menu.querySelectorAll('[data-drawer-action="advanced-features"]').forEach((button) => button.remove());
  }

  let autoTranslateTimer = 0;
  function schedulePremiumAutoTranslate(delay = 250, options = {}) {
    // Even if premium flag is briefly unavailable at boot, retry a few times.
    window.clearTimeout(autoTranslateTimer);
    autoTranslateTimer = window.setTimeout(() => {
      try {
        if (!isPremiumAutoTranslateEnabled()) return;
        translateVisibleMessages(options);
      } catch (_) {}
    }, Math.max(50, Number(delay) || 250));
  }
  window.schedulePremiumAutoTranslate = schedulePremiumAutoTranslate;

  // Re-run auto-translate after chat re-renders / new messages arrive
  function wrapRenderForAutoTranslate() {
    if (typeof renderActiveChat === 'function' && !renderActiveChat.__onixAutoTranslateWrapped) {
      const original = renderActiveChat;
      const wrapped = function () {
        const result = original.apply(this, arguments);
        schedulePremiumAutoTranslate(220);
        return result;
      };
      wrapped.__onixAutoTranslateWrapped = true;
      try {
        Object.keys(original).forEach((k) => { wrapped[k] = original[k]; });
      } catch (_) {}
      // preserve function name-ish
      try { Object.defineProperty(wrapped, 'name', { value: 'renderActiveChat' }); } catch (_) {}
      renderActiveChat = wrapped;
      window.renderActiveChat = wrapped;
    }
    // Also wrap openChat / selectChat if present
    ['openChat', 'selectChat', 'setActiveChat'].forEach((name) => {
      try {
        const fn = window[name] || (typeof eval === 'function' ? null : null);
      } catch (_) {}
    });
    if (typeof window.openChat === 'function' && !window.openChat.__onixAutoTranslateWrapped) {
      // no-op if not global
    }
  }

  function init() {
    ensureViewOnceToggle();
    wrapSendMessage();
    wrapTagMutations();
    wrapRenderForAutoTranslate();
    // Re-wrap after app finishes boot (premium flag / chat list ready)
    setTimeout(wrapRenderForAutoTranslate, 800);
    setTimeout(wrapRenderForAutoTranslate, 2000);
    enhanceDrawer();
    applyAdvancedPreferences();
    loadPreferences();
    syncAdvancedState({ force: true });
    schedulePremiumAutoTranslate(500);
    schedulePremiumAutoTranslate(1500);
    schedulePremiumAutoTranslate(3500);
    // Near-instant multi-device tag/prefs sync while online
    setInterval(() => syncAdvancedState(), 4000);
    // Premium auto-translate periodic pass (picks up new messages without full re-render hooks)
    setInterval(() => {
      if (isPremiumAutoTranslateEnabled()) schedulePremiumAutoTranslate(50);
    }, 6000);
    window.addEventListener('focus', () => {
      syncAdvancedState({ force: true });
      schedulePremiumAutoTranslate(200);
    });
    window.addEventListener('online', () => {
      syncAdvancedState({ force: true });
      schedulePremiumAutoTranslate(200, { force: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        syncAdvancedState({ force: true });
        schedulePremiumAutoTranslate(200);
      }
    });
    // Also clean any leftover view-once toggles periodically
    setInterval(ensureViewOnceToggle, 2000);
    let moTimer = 0;
    const observer = new MutationObserver((mutations) => {
      ensureViewOnceToggle();
      enhanceDrawer();
      // Only react to message list changes, debounced
      const interesting = mutations.some((m) => {
        const node = m.target;
        if (!node) return false;
        if (node.id === 'messages' || node.closest?.('#messages')) return true;
        return Array.from(m.addedNodes || []).some((n) => n.id === 'messages' || n.classList?.contains?.('message-row') || n.querySelector?.('.message-row'));
      });
      if (!interesting) return;
      window.clearTimeout(moTimer);
      moTimer = window.setTimeout(() => schedulePremiumAutoTranslate(300), 120);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    // Extra cleanup of old view-once messages – convert them to normal
    try {
      (state?.chats || []).forEach(chat => {
        (chat.messages || []).forEach(m => {
          if (m.viewOnce) {
            m.viewOnce = false;
            m.protectedContent = false;
            m.disableForwarding = false;
          }
        });
      });
    } catch(e){}
  }

  bindEvents();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
