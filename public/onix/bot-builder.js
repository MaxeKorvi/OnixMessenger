/* =========================================================
 * Onix — No-code Bot Constructor (Telegram-style)
 * Визуальный редактор ботов для каналов.
 * ========================================================= */
(function () {
  'use strict';

  // CRITICAL: expose globals FIRST — inline onclick in HTML must work even if
  // anything else below throws for any reason.
  const $ = (s, r = document) => r ? r.querySelector(s) : null;
  const $$ = (s, r = document) => r ? Array.from(r.querySelectorAll(s)) : [];

  // Lazy helpers that always resolve fresh from DOM
  function el(id) { return document.getElementById(id); }

  // Public API is populated after function declarations; forward-stubbed here.
  window.__bb = {};
  window.openBotBuilder = function () { window.__bb.openBuilder && window.__bb.openBuilder(); };
  window.bbStartTour = function () { window.__bb.startTour && window.__bb.startTour(); };
  window.bbCreateBot = function (n) { window.__bb.createBot && window.__bb.createBot(n || 'Новый бот'); };

  const STORAGE_KEY = 'onix.bots.v1';
  const TOUR_KEY = 'onix.botfilter.tour.v1';

  // ---- Block types --------------------------------------------------------
  const BLOCK_TYPES = {
    command:  { label: 'Команда',     icon: '#i-at',    placeholder: 'Например: /start, /help, /menu' },
    keyword:  { label: 'Ключевое слово', icon: '#i-tag', placeholder: 'Слово, на которое бот ответит' },
    message:  { label: 'Сообщение',   icon: '#i-chat',  placeholder: 'Текст ответа бота' },
    buttons:  { label: 'Кнопки',      icon: '#i-menu',  placeholder: 'Текст над кнопками' },
    media:    { label: 'Медиа',       icon: '#i-image', placeholder: 'Подпись к медиа' },
    question: { label: 'Вопрос',      icon: '#i-summary', placeholder: 'Вопрос пользователю' },
  };

  function genId(p = 'b') { return p + '_' + Math.random().toString(36).slice(2, 9); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function saveBots(bots) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bots)); } catch(e){} }
  function loadBots() {
    try {
      const r = localStorage.getItem(STORAGE_KEY);
      if (r) {
        let parsed = JSON.parse(r);
        if (Array.isArray(parsed)) {
          // Deduplicate by (name+username) to stop "Новый бот" accumulation
          const seen = new Set();
          parsed = parsed.filter((b) => {
            const key = String(b.name || '').trim().toLowerCase() + '|' + String(b.username || '').trim().toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key); return true;
          });
          // Keep at most one "Новый бот"
          let keptNew = false;
          parsed = parsed.filter((b) => {
            if (String(b.name || '').trim().toLowerCase() !== 'новый бот') return true;
            if (!keptNew) { keptNew = true; return true; }
            return false;
          });
          return parsed;
        }
      }
    } catch(e){}
    return [];
  }
  function tourMarkSeen() { try { localStorage.setItem(TOUR_KEY, '1'); } catch(e){} }
  function tourIsSeen() { try { return localStorage.getItem(TOUR_KEY) === '1'; } catch(e){ return false; } }

  function toast(msg) {
    try {
      const t = document.getElementById('toast');
      if (!t) return;
      t.textContent = msg; t.classList.remove('hidden');
      clearTimeout(toast._t);
      toast._t = setTimeout(() => t.classList.add('hidden'), 1800);
    } catch(e){}
  }

  const FREE_BOT_LIMIT = 3;
  function isPremium() {
    try { return typeof window.isPremiumUser === 'function' && window.isPremiumUser(); } catch(e) { return false; }
  }
  function canCreateBot() {
    if (isPremium()) return true;
    return bots.length < FREE_BOT_LIMIT;
  }
  function showBotLimitToast() {
    toast('Без Onix Plus можно создать только 3 бота');
  }
  function customConfirm(title, text, okText, onConfirm) {
    if (typeof window.confirmAction === 'function') {
      try { window.confirmAction(title, text, onConfirm); return; } catch(e) {}
    }
    if (window.confirm(`${title}

${text}`)) onConfirm();
  }
  function normalizeUsernameInput(value, fallback = 'bot') {
    let raw = String(value || fallback || 'bot').trim().replace(/^@+/, '').toLowerCase();
    raw = raw.replace(/[^a-z0-9а-я_]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 28);
    return '@' + (raw || 'bot');
  }
  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---- Sample bots --------------------------------------------------------
  function sampleWelcomeBot() {
    return { id: genId('bot'), name: 'Приветственный бот', username: '@welcome_bot', token: '', attachedTo: '',
      blocks: [
        { id: genId('blk'), type: 'command', trigger: '/start',
          text: '👋 Добро пожаловать!\nЯ — бот этого канала. Выберите, что вас интересует:',
          buttons: ['О канале', 'Правила', 'Контакты'] },
        { id: genId('blk'), type: 'keyword', trigger: 'О канале',
          text: '📢 Это официальный канал Onix. Здесь публикуются новости, обновления и анонсы.' },
        { id: genId('blk'), type: 'keyword', trigger: 'Правила',
          text: '📌 Правила канала:\n1. Уважайте друг друга\n2. Не спамьте\n3. По вопросам — пишите администратору' },
        { id: genId('blk'), type: 'keyword', trigger: 'Контакты',
          text: '✉️ Контакты:\nПоддержка: @support\nПочта: support@onix' },
      ], createdAt: Date.now() };
  }
  function sampleFAQBot() {
    return { id: genId('bot'), name: 'FAQ-бот', username: '@faq_bot', token: '', attachedTo: '',
      blocks: [
        { id: genId('blk'), type: 'command', trigger: '/start', text: '❓ Бот часто задаваемых вопросов.\nВыберите тему:', buttons: ['Доставка', 'Оплата', 'Гарантия'] },
        { id: genId('blk'), type: 'keyword', trigger: 'Доставка', text: '🚚 Доставка по городу — 1-2 дня, по стране — 3-5 дней.' },
        { id: genId('blk'), type: 'keyword', trigger: 'Оплата', text: '💳 Мы принимаем карты, СБП и криптовалюту.' },
        { id: genId('blk'), type: 'keyword', trigger: 'Гарантия', text: '🛡 Гарантия на все товары — 1 год.' },
      ], createdAt: Date.now() };
  }
  function sampleShopBot() {
    return { id: genId('bot'), name: 'Бот магазина', username: '@shop_bot', token: '', attachedTo: '',
      blocks: [
        { id: genId('blk'), type: 'command', trigger: '/start', text: '🛒 Добро пожаловать в магазин! Что желаете посмотреть?', buttons: ['Каталог', 'Акции', 'Мой заказ'] },
        { id: genId('blk'), type: 'keyword', trigger: 'Каталог', text: '📦 Наш каталог:\n• Товар 1 — 990₽\n• Товар 2 — 1490₽\n• Товар 3 — 2490₽' },
        { id: genId('blk'), type: 'keyword', trigger: 'Акции', text: '🔥 Сейчас идёт распродажа: скидки до 50%!' },
        { id: genId('blk'), type: 'keyword', trigger: 'Мой заказ', text: '📋 Отправьте номер вашего заказа, и я проверю статус.' },
      ], createdAt: Date.now() };
  }
  function sampleFeedbackBot() {
    return { id: genId('bot'), name: 'Бот обратной связи', username: '@feedback_bot', token: '', attachedTo: '',
      blocks: [
        { id: genId('blk'), type: 'command', trigger: '/start', text: '📝 Здравствуйте! Оставьте ваше сообщение — мы ответим в ближайшее время.', buttons: ['Оставить заявку'] },
        { id: genId('blk'), type: 'keyword', trigger: 'Оставить заявку', text: '✍️ Пожалуйста, опишите вашу проблему или вопрос одним сообщением.' },
      ], createdAt: Date.now() };
  }

  // ---- State --------------------------------------------------------------
  // One-shot migration: wipe out old "Новый бот" clutter and default to just FAQ bot
  // for users who already have piles of duplicates in localStorage.
  (function migrateBotList() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      // Count "Новый бот" clones
      const newBots = parsed.filter(b => String(b.name||'').trim().toLowerCase() === 'новый бот');
      const total = parsed.length;
      const duplicates = parsed.length - new Set(parsed.map(b => String(b.name||'').trim().toLowerCase()+'|'+String(b.username||'').trim().toLowerCase())).size;
      // If there are piles of duplicates (>=3 new bots or total >=8), reset to single FAQ bot
      if (newBots.length >= 3 || total >= 8 || duplicates >= 3) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([sampleFAQBot()]));
      }
    } catch(e){}
  })();

  let bots = loadBots();
  let currentBotId = null;
  let selectedBlockId = null;
  let tourStep = 0;

  // ---- Tour ---------------------------------------------------------------
  const tourSteps = [
    { emoji: '🤖', title: 'Добро пожаловать в Bot Filter!',
      text: 'Здесь вы можете создать своего бота для канала — без единой строчки кода. Это как конструктор Lego: соединяете блоки мышкой, и бот готов.',
      list: [
        { emoji: '🛒', b: 'Свой магазин', t: 'Каталог товаров, акции, приём заказов.' },
        { emoji: '❓', b: 'FAQ и поддержка', t: 'Автоответы на частые вопросы 24/7.' },
        { emoji: '📝', b: 'Сбор заявок', t: 'Обратная связь, анкеты, опросы.' },
        { emoji: '👋', b: 'Приветствие', t: 'Автоответ новым подписчикам канала.' },
      ]},
    { emoji: '🧱', title: 'Из чего состоит бот',
      text: 'Бот собирается из блоков — как цепочка. Сверху вниз идёт логика: с чего начать, что ответить, какие кнопки показать.',
      list: [
        { emoji: '🎯', b: 'Команда', t: 'Блок, срабатывающий на команду вроде /start или /help.' },
        { emoji: '🔑', b: 'Ключевое слово', t: 'Ответ, если пользователь напишет определённое слово.' },
        { emoji: '💬', b: 'Сообщение', t: 'Любой текст, который бот отправит в ответ.' },
        { emoji: '🔘', b: 'Кнопки', t: 'Инлайн-кнопки под сообщением для быстрых ответов.' },
      ]},
    { emoji: '🛒', title: 'Пример: бот-магазин',
      text: 'Давайте соберём простого бота для магазина за 3 блока. Это займёт 30 секунд.',
      mock: { msg: '🛒 Добро пожаловать в магазин! Что желаете посмотреть?', buttons: ['Каталог', 'Акции', 'Мой заказ'] },
      list: [
        { emoji: '1️⃣', b: 'Команда /start', t: 'Пишем приветствие и добавляем 3 кнопки: Каталог, Акции, Мой заказ.' },
        { emoji: '2️⃣', b: 'Триггер «Каталог»', t: 'На ключевое слово «Каталог» бот отвечает списком товаров и ценами.' },
        { emoji: '3️⃣', b: 'Триггер «Акции»', t: 'На слово «Акции» присылает сообщение о скидках.' },
      ]},
    { emoji: '✏️', title: 'Как создать своего бота',
      text: 'Всё делается в несколько кликов — никакого программирования.',
      list: [
        { emoji: '➕', b: '1. Нажмите «Новый бот»', t: 'Кнопка в левой панели сразу создаёт карточку бота.' },
        { emoji: '🧩', b: '2. Добавляйте блоки', t: 'Клик «Добавить блок» — и выбирайте тип.' },
        { emoji: '⚙️', b: '3. Настраивайте справа', t: 'Выделите блок — справа появятся поля для текста и кнопок.' },
        { emoji: '▶️', b: '4. Протестируйте', t: 'Кнопка «Тест» открывает диалог — пишите боту как в реальном чате.' },
      ]},
    { emoji: '📦', title: 'Готовые шаблоны',
      text: 'Если не хотите собирать с нуля — возьмите готовый шаблон внизу слева. Его можно будет в любой момент переписать под себя.',
      list: [
        { emoji: '👋', b: 'Приветствие', t: 'Готовое меню из /start + кнопок «О канале», «Правила», «Контакты».' },
        { emoji: '❓', b: 'FAQ-бот', t: 'Доставка / Оплата / Гарантия — типовой справочник.' },
        { emoji: '🛍', b: 'Мини-магазин', t: 'Каталог, акции и статус заказа.' },
        { emoji: '📮', b: 'Обратная связь', t: 'Приём заявок от пользователей.' },
      ]},
    { emoji: '🚀', title: 'Готовы начать?',
      text: 'Нажмите «Создать бота» — и через пару минут у вас будет работающий бот для канала. Если что-то забудете — кнопка «Обучение» в тулбаре всегда вернёт этот тур.',
      list: [
        { emoji: '💡', b: 'Совет', t: 'Начните с шаблона — это быстрее, чем с нуля.' },
        { emoji: '🧪', b: 'Не забывайте тест', t: 'После каждого изменения нажимайте «Тест».' },
        { emoji: '💾', b: 'Автосохранение', t: 'Все боты сохраняются в браузере.' },
      ]},
  ];

  function renderTourDots() {
    const p = el('bbTourProgress'); if (!p) return;
    p.innerHTML = tourSteps.map((_, i) => `<span class="bb-tour-dot${i === tourStep ? ' active' : ''}"></span>`).join('');
  }

  function renderTourStep() {
    const body = el('bbTourBody'); if (!body) return;
    const s = tourSteps[tourStep];
    let h = `<div class="bb-tour-step-num">Шаг ${tourStep + 1} из ${tourSteps.length}</div>`;
    h += `<h2><span class="bb-tour-emoji">${s.emoji}</span> ${escapeHtml(s.title)}</h2>`;
    h += `<p>${escapeHtml(s.text)}</p>`;
    if (s.mock) {
      h += `<div class="bb-tour-mock">
        <div class="bb-tour-mock-msg">${escapeHtml(s.mock.msg)}</div>
        ${s.mock.buttons ? `<div class="bb-tour-mock-buttons">${s.mock.buttons.map(b => `<span>${escapeHtml(b)}</span>`).join('')}</div>` : ''}
      </div>`;
    }
    if (s.list) {
      h += `<ul>${s.list.map(it => `<li><span class="bb-li-emoji">${it.emoji}</span><span><b>${escapeHtml(it.b)}</b>${escapeHtml(it.t)}</span></li>`).join('')}</ul>`;
    }
    body.innerHTML = h;
    renderTourDots();
    const prev = el('bbTourPrev'); const next = el('bbTourNext');
    if (prev) prev.disabled = tourStep === 0;
    if (next) next.innerHTML = tourStep === tourSteps.length - 1
      ? 'Начать работать <svg class="svg-icon"><use href="#i-check"></use></svg>'
      : 'Далее <svg class="svg-icon"><use href="#i-chevron"></use></svg>';
  }

  function startTour() {
    try {
      tourStep = 0;
      renderTourStep();
      const ov = el('bbTourOverlay');
      if (ov) ov.classList.remove('hidden');
      // If modal isn't open yet, open it first
      const m = el('botBuilderModal');
      if (m && !m.open) {
        try { m.showModal(); } catch(e) { m.setAttribute('open',''); }
        refreshBuilderView();
      }
    } catch(e) { console.error('startTour failed', e); }
  }
  function closeTour() {
    const ov = el('bbTourOverlay'); if (ov) ov.classList.add('hidden');
    tourMarkSeen();
  }
  function nextTour() {
    if (tourStep < tourSteps.length - 1) { tourStep++; renderTourStep(); }
    else {
      closeTour();
      // Don't auto-create a bot at the end — just show the list / FAQ template already there
      refreshBuilderView();
      bindEditorEvents();
    }
  }
  function prevTour() { if (tourStep > 0) { tourStep--; renderTourStep(); } }

  // ---- Bot rendering ------------------------------------------------------
  function getCurrentBot() { return bots.find((b) => b.id === currentBotId); }
  function persist(options = {}) {
    saveBots(bots);
    renderBotsList();
    try { ensureCustomBotChats({ render: options.renderChats !== false }); } catch(e) {}
  }

  function renderBotsList() {
    const list = el('bbBotsList'); if (!list) return;
    list.innerHTML = '';
    if (bots.length === 0) {
      list.innerHTML = '<p style="color:var(--muted,#8b9299);font-size:13px;text-align:center;padding:20px 8px;">Нет созданных ботов.<br>Нажмите «Новый бот».</p>';
      return;
    }
    bots.forEach((bot) => {
      const btn = document.createElement('button');
      btn.className = 'bb-bot-item' + (bot.id === currentBotId ? ' active' : '');
      btn.innerHTML = `<span class="bb-bot-avatar">${bot.avatarData || bot.customAvatar ? `<img src="${escapeAttr(bot.avatarData || bot.customAvatar)}" alt="" />` : `<svg class="svg-icon"><use href="#i-bot"></use></svg>`}</span>
        <span style="min-width:0;flex:1;">
          <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(bot.name)}</b>
          <small>${escapeHtml(bot.username)}</small>
        </span>`;
      btn.addEventListener('click', () => openBot(bot.id));
      list.appendChild(btn);
    });
  }

  function renderBlockHTML(block) {
    const t = BLOCK_TYPES[block.type] || BLOCK_TYPES.message;
    let body = '';
    if (block.type === 'media') body += `<div class="bb-block-media"><svg class="svg-icon"><use href="${t.icon}"></use></svg> ${block.mediaKind || 'Фото'} (${block.mediaUrl ? 'прикреплено' : 'нет файла'})</div>`;
    if (block.text) body += `<div class="bb-block-text">${escapeHtml(block.text)}</div>`;
    if (block.buttons && block.buttons.length) body += `<div class="bb-block-buttons">${block.buttons.map(b => `<button class="bb-block-btn" type="button">${escapeHtml(b)}</button>`).join('')}</div>`;
    const triggerLabel = block.trigger ? `<span class="bb-block-trigger">${escapeHtml(block.trigger)}</span>` : '';
    return `<div class="bb-block-menu">
        <button class="bb-block-del" title="Удалить блок"><svg class="svg-icon"><use href="#i-trash"></use></svg></button>
      </div>
      <div class="bb-block-head">
        <svg class="svg-icon"><use href="${t.icon}"></use></svg> ${t.label}
        ${triggerLabel}
      </div>
      ${body || `<div class="bb-block-text" style="opacity:.5;">Пусто — настройте в панели справа</div>`}`;
  }

  function renderCanvas() {
    const c = el('bbCanvas'); if (!c) return;
    c.innerHTML = '';
    if (!currentBotId) return;
    const bot = getCurrentBot(); if (!bot) return;
    const s = document.createElement('div'); s.className = 'bb-start';
    s.innerHTML = '<svg class="svg-icon"><use href="#i-play-outline"></use></svg> СТАРТ';
    c.appendChild(s);
    bot.blocks.forEach((block) => {
      const conn = document.createElement('div'); conn.className = 'bb-connector'; c.appendChild(conn);
      const el = document.createElement('div');
      el.className = 'bb-block' + (block.id === selectedBlockId ? ' selected' : '');
      el.dataset.blockId = block.id;
      el.innerHTML = renderBlockHTML(block);
      el.addEventListener('click', (e) => {
        if (e.target.closest('.bb-block-del')) return;
        selectedBlockId = block.id;
        renderCanvas(); renderProps();
      });
      const del = el.querySelector('.bb-block-del');
      if (del) del.addEventListener('click', (e) => {
        e.stopPropagation();
        bot.blocks = bot.blocks.filter((b) => b.id !== block.id);
        if (selectedBlockId === block.id) selectedBlockId = null;
        persist(); renderCanvas(); renderProps();
      });
      c.appendChild(el);
    });
  }

  function renderProps() {
    const p = el('bbProps'); if (!p) return;
    if (!currentBotId || !selectedBlockId) {
      p.innerHTML = `<div class="bb-props-empty"><svg class="svg-icon"><use href="#i-settings"></use></svg><p>Выберите блок, чтобы настроить его содержимое</p></div>`;
      return;
    }
    const bot = getCurrentBot(); const block = bot.blocks.find((b) => b.id === selectedBlockId);
    if (!block) { selectedBlockId = null; renderProps(); return; }

    const typeOptions = Object.entries(BLOCK_TYPES).map(([k, v]) =>
      `<button type="button" class="bb-type-card${block.type===k?' active':''}" data-bb-type="${k}"><svg class="svg-icon"><use href="${v.icon}"></use></svg><span>${v.label}</span></button>`).join('');
    const showTrigger = block.type === 'command' || block.type === 'keyword';
    const showButtons = ['command','buttons','message','question'].includes(block.type);
    const showMedia = block.type === 'media';
    const buttonsHTML = (block.buttons || []).map((b,i) =>
      `<div class="bb-keyboard-row"><input type="text" value="${escapeAttr(b)}" data-bb-btn="${i}" placeholder="Текст кнопки"/><button type="button" data-bb-btn-del="${i}" title="Удалить">×</button></div>`).join('');
    const gotoTargets = bot.blocks.filter((b) => b.id !== block.id && b.trigger)
      .map((b) => `<option value="${b.id}" ${block.goto===b.id?'selected':''}>${escapeHtml(b.trigger)}</option>`).join('');

    p.innerHTML = `
      <h3>Свойства блока</h3>
      <label><span>Тип блока</span><div class="bb-type-grid">${typeOptions}</div></label>
      ${showTrigger ? `<label><span>${block.type==='command'?'Команда':'Триггер'}</span><input type="text" id="bbPropTrigger" value="${escapeAttr(block.trigger||'')}" placeholder="${BLOCK_TYPES[block.type].placeholder}"/></label>` : ''}
      ${showMedia ? `<label><span>Тип медиа</span><select id="bbPropMediaKind">
        <option value="Фото" ${block.mediaKind==='Фото'?'selected':''}>Фото</option>
        <option value="Видео" ${block.mediaKind==='Видео'?'selected':''}>Видео</option>
        <option value="Аудио" ${block.mediaKind==='Аудио'?'selected':''}>Аудио</option>
        <option value="Документ" ${block.mediaKind==='Документ'?'selected':''}>Документ</option>
      </select></label>
      <label><span>URL файла</span><input type="text" id="bbPropMediaUrl" value="${escapeAttr(block.mediaUrl||'')}" placeholder="https://..."/></label>` : ''}
      <label><span>Текст</span><textarea id="bbPropText" placeholder="${BLOCK_TYPES[block.type].placeholder}">${escapeHtml(block.text||'')}</textarea></label>
      ${showButtons ? `<label><span>Инлайн-кнопки</span><div class="bb-keyboard-list" id="bbButtonsList">${buttonsHTML}</div><button type="button" class="bb-add-key" id="bbAddKeyBtn">+ Добавить кнопку</button></label>` : ''}
      ${gotoTargets ? `<label><span>После ответа — перейти к</span><select id="bbPropGoto"><option value="">(остаться)</option>${gotoTargets}</select></label>` : ''}
    `;

    $$('.bb-type-card', p).forEach((b) => b.addEventListener('click', () => {
      block.type = b.dataset.bbType;
      if ((block.type === 'command' || block.type === 'keyword') && !block.trigger)
        block.trigger = block.type === 'command' ? '/start' : 'ключевое слово';
      persist(); renderCanvas(); renderProps();
    }));
    const trig = el('bbPropTrigger'); if (trig) trig.addEventListener('input', () => { block.trigger = trig.value; persist(); renderCanvas(); });
    const txt = el('bbPropText'); if (txt) txt.addEventListener('input', () => { block.text = txt.value; persist(); renderCanvas(); });
    const mk = el('bbPropMediaKind'); if (mk) mk.addEventListener('change', () => { block.mediaKind = mk.value; persist(); renderCanvas(); });
    const mu = el('bbPropMediaUrl'); if (mu) mu.addEventListener('input', () => { block.mediaUrl = mu.value; persist(); renderCanvas(); });
    const gt = el('bbPropGoto'); if (gt) gt.addEventListener('change', () => { block.goto = gt.value; persist(); });
    const bl = el('bbButtonsList');
    if (bl) {
      bl.addEventListener('input', (e) => {
        const inp = e.target.closest('input[data-bb-btn]'); if (!inp) return;
        block.buttons = block.buttons || []; block.buttons[+inp.dataset.bbBtn] = inp.value; persist(); renderCanvas();
      });
      bl.addEventListener('click', (e) => {
        const d = e.target.closest('[data-bb-btn-del]'); if (!d) return;
        block.buttons.splice(+d.dataset.bbBtnDel, 1); persist(); renderCanvas(); renderProps();
      });
    }
    const ak = el('bbAddKeyBtn'); if (ak) ak.addEventListener('click', () => {
      block.buttons = block.buttons || []; block.buttons.push('Кнопка'); persist(); renderCanvas(); renderProps();
    });
  }

  function setToolbarEnabled(enabled, bot) {
    const ni = el('bbBotName'), ul = el('bbBotUsername'), ui = el('bbBotUsernameInput'), av = el('bbAvatarBtn');
    ['bbTestBtn','bbDuplicateBtn','bbDeleteBtn','bbSaveBtn'].forEach(id => {
      const b = el(id); if (b) b.disabled = !enabled;
    });
    if (ni) { ni.disabled = !enabled; ni.value = enabled && bot ? bot.name : ''; ni.placeholder = enabled ? 'Имя бота' : 'выберите бота'; }
    if (ui) { ui.disabled = !enabled; ui.value = enabled && bot ? normalizeUsernameInput(bot.username || bot.name || 'bot') : ''; }
    if (av) av.disabled = !enabled;
    if (ul) ul.textContent = enabled && bot ? normalizeUsernameInput(bot.username || bot.name || 'bot') : 'выберите бота';
  }
  function openBot(botId) {
    currentBotId = botId; selectedBlockId = null;
    const bot = getCurrentBot(); if (!bot) return;
    const es = el('bbEmpty'), ed = el('bbEditor');
    if (es) es.classList.add('hidden');
    if (ed) ed.classList.remove('hidden');
    setToolbarEnabled(true, bot);
    renderBotsList(); renderCanvas(); renderProps();
  }
  function closeBot() {
    currentBotId = null; selectedBlockId = null;
    const es = el('bbEmpty'), ed = el('bbEditor');
    if (es) es.classList.remove('hidden');
    if (ed) ed.classList.add('hidden');
    setToolbarEnabled(false);
    renderBotsList();
  }
  function refreshBuilderView() {
    renderBotsList();
    const es = el('bbEmpty'), ed = el('bbEditor');
    const bot = getCurrentBot();
    if (!currentBotId || !bot) {
      if (es) es.classList.remove('hidden');
      if (ed) ed.classList.add('hidden');
      setToolbarEnabled(false);
    } else {
      if (es) es.classList.add('hidden');
      if (ed) ed.classList.remove('hidden');
      setToolbarEnabled(true, bot);
    }
  }

  function createBot(name) {
    name = name || 'Новый бот';
    if (!canCreateBot()) { showBotLimitToast(); return null; }
    // If a "Новый бот" already exists, reuse/select it instead of creating duplicate
    if (name === 'Новый бот') {
      const existing = bots.find(b => String(b.name||'').trim().toLowerCase() === 'новый бот');
      if (existing) { openBot(existing.id); return existing; }
    }
    let finalName = name;
    let n = 2;
    while (bots.some(b => String(b.name||'').trim().toLowerCase() === finalName.toLowerCase())) {
      finalName = `${name} ${n++}`;
    }
    const username = normalizeUsernameInput(finalName + '_bot');
    const bot = { id: genId('bot'), name: finalName, username, token: '', attachedTo: '', createdAt: Date.now(), avatarData: '', customAvatar: '',
      blocks: [{ id: genId('blk'), type: 'command', trigger: '/start', text: 'Привет! Я — новый бот. Напишите /help чтобы узнать команды.', buttons: [] }] };
    bots.unshift(bot);
    persist();
    openBot(bot.id);
    return bot;
  }
  function addBlock() {
    const bot = getCurrentBot(); if (!bot) return;
    bot.blocks.push({ id: genId('blk'), type: 'message', trigger: '', text: 'Новый ответ бота', buttons: [] });
    selectedBlockId = bot.blocks[bot.blocks.length - 1].id;
    persist(); renderCanvas(); renderProps();
  }
  function deleteCurrentBot() {
    if (!currentBotId) return;
    const bot = getCurrentBot(); if (!bot) return;
    customConfirm('Удалить бота?', `Бот «${bot.name || 'Новый бот'}» и его чат будут удалены. Это действие нельзя отменить.`, 'Удалить', () => {
      const deletedBotId = currentBotId;
      bots = bots.filter((b) => b.id !== currentBotId);
      removeCustomBotChat(deletedBotId);
      persist(); closeBot();
      toast('Бот удалён');
    });
  }
  function duplicateCurrentBot() {
    const bot = getCurrentBot(); if (!bot) return;
    if (!canCreateBot()) { showBotLimitToast(); return; }
    customConfirm('Скопировать бота?', `Будет создана копия бота «${bot.name || 'Новый бот'}».`, 'Скопировать', () => {
      const copy = JSON.parse(JSON.stringify(bot));
      copy.id = genId('bot'); copy.name = bot.name + ' (копия)';
      copy.username = normalizeUsernameInput((bot.username || bot.name || 'bot').replace(/_bot$/,'') + '_copy_bot');
      copy.blocks.forEach((b) => b.id = genId('blk'));
      bots.unshift(copy); persist(); openBot(copy.id); toast('Бот скопирован');
    });
  }

  // ---- Test chat ----------------------------------------------------------
  let testState = null;
  function openTest() {
    const bot = getCurrentBot(); if (!bot) return;
    const tt = el('bbTestTitle'), tm = el('bbTestMessages'), tmod = el('bbTestModal'), tinp = el('bbTestInput');
    if (tt) tt.textContent = bot.name;
    if (tm) tm.innerHTML = '';
    testState = {};
    appendTestMsgImpl('/start', true);
    if (tmod) { try { if (tmod.open) tmod.close(); tmod.showModal(); } catch(e) { tmod.setAttribute('open',''); } }
    if (tinp) setTimeout(() => tinp.focus(), 100);
  }
  function appendTestMsgImpl(text, silent) {
    if (!silent) appendTestMsgView(text, 'user');
    setTimeout(() => {
      const bot = getCurrentBot(); if (!bot) return;
      const chatId = '__test__' + bot.id;
      const blk = findBotReplyBlock(bot, text, chatId);
      if (!blk) { appendTestMsgView('🤖 Я не понял сообщение. Попробуйте /start или нажмите кнопку.', 'bot', ['/start']); return; }
      customBotRuntime[chatId] = { lastBlockId: blk.id };
      appendTestMsgView(blk.text || '(пусто)', 'bot', blk.buttons);
      if (blk.goto) {
        const next = bot.blocks.find((b) => b.id === blk.goto);
        if (next) setTimeout(() => { customBotRuntime[chatId] = { lastBlockId: next.id }; appendTestMsgView(next.text || '', 'bot', next.buttons); }, 350);
      }
    }, 200);
  }
  function appendTestMsgView(text, who, buttons) {
    const tm = el('bbTestMessages'); if (!tm) return;
    const w = document.createElement('div'); w.className = 'bb-test-msg ' + who; w.textContent = text;
    if (buttons && buttons.length) {
      const row = document.createElement('div'); row.className = 'bb-test-msg-buttons';
      buttons.forEach((b) => {
        const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = b;
        btn.addEventListener('click', () => { appendTestMsgView(b, 'user'); setTimeout(() => appendTestMsgImpl(b, true), 200); });
        row.appendChild(btn);
      });
      w.appendChild(row);
    }
    tm.appendChild(w); tm.scrollTop = tm.scrollHeight;
  }

  function openBuilder() {
    try {
      refreshBuilderView();
      const m = el('botBuilderModal');
      if (m) {
        const isOpen = m.open || m.hasAttribute('open');
        if (!isOpen) { try { m.showModal(); } catch(e) { m.setAttribute('open',''); } }
      }
      bindEditorEvents();
      if (!tourIsSeen()) setTimeout(() => startTour(), 500);
    } catch(e) { console.error('openBuilder failed', e); }
  }
  function closeBuilder() {
    const m = el('botBuilderModal'), tm = el('bbTestModal');
    try { if (m) m.close(); } catch(e) { if(m) m.removeAttribute('open'); }
    try { if (tm) tm.close(); } catch(e) { if(tm) tm.removeAttribute('open'); }
  }

  // Bind editor toolbar / internal buttons — idempotent via _bbBound flag
  function bindEditorEvents() {
    function on(id, fn) {
      const e = el(id); if (!e || e._bbBound) return;
      e._bbBound = true;
      e.addEventListener('click', (ev) => { try{ ev.preventDefault(); ev.stopPropagation(); } catch(_){} fn(ev); });
    }
    on('bbNewBotBtn', () => createBot('Новый бот'));
    on('bbAddBlockBtn', addBlock);
    on('bbSaveBtn', () => { persist(); ensureCustomBotChats({ render: true }); toast('Бот сохранён и работает в чате ✓'); });
    on('bbDeleteBtn', deleteCurrentBot);
    on('bbDuplicateBtn', duplicateCurrentBot);
    on('bbTestBtn', openTest);
    // bot name input
    const ni = el('bbBotName');
    if (ni && !ni._bbBound) {
      ni._bbBound = true;
      ni.addEventListener('input', () => { const b = getCurrentBot(); if (b) { b.name = ni.value; persist(); ensureCustomBotChats({ render: true }); renderBotsList(); } });
    }
    const ui = el('bbBotUsernameInput');
    if (ui && !ui._bbBound) {
      ui._bbBound = true;
      ui.addEventListener('input', () => {
        const b = getCurrentBot(); if (!b) return;
        b.username = normalizeUsernameInput(ui.value || b.name || 'bot');
        ui.value = b.username;
        persist(); ensureCustomBotChats({ render: true }); renderBotsList();
      });
    }
    const avBtn = el('bbAvatarBtn'), avInput = el('bbAvatarInput');
    if (avBtn && avInput && !avBtn._bbBound) {
      avBtn._bbBound = true;
      avBtn.addEventListener('click', () => avInput.click());
      avInput.addEventListener('change', async () => {
        const b = getCurrentBot(); const file = avInput.files && avInput.files[0];
        if (!b || !file) return;
        if (!file.type.startsWith('image/')) { toast('Выберите изображение'); avInput.value = ''; return; }
        const applyBotAvatar = (dataUrl) => {
          if (!dataUrl) return;
          b.avatarData = dataUrl;
          b.customAvatar = dataUrl;
          persist(); ensureCustomBotChats({ render: true }); renderBotsList(); toast('Аватар бота обновлён');
        };
        try {
          if (typeof window.openOnixAvatarImageEditor === 'function') {
            await window.openOnixAvatarImageEditor(file, applyBotAvatar);
          } else {
            applyBotAvatar(await readFileAsDataUrl(file));
          }
        } catch(e) { toast('Не удалось загрузить аватар'); }
        avInput.value = '';
      });
    }
    // templates
    $$('[data-bb-template]').forEach((b) => {
      if (b._bbBound) return; b._bbBound = true;
      b.addEventListener('click', () => {
        let bot;
        switch (b.dataset.bbTemplate) {
          case 'faq': bot = sampleFAQBot(); break;
          case 'shop': bot = sampleShopBot(); break;
          case 'feedback': bot = sampleFeedbackBot(); break;
          default: bot = sampleWelcomeBot();
        }
        if (!canCreateBot()) { showBotLimitToast(); return; }
        bot.id = genId('bot'); bot.blocks.forEach((blk) => blk.id = genId('blk'));
        bot.avatarData = bot.avatarData || ''; bot.customAvatar = bot.customAvatar || '';
        bots.unshift(bot); persist(); openBot(bot.id); toast('Шаблон загружен');
      });
    });
    // test form
    const tf = el('bbTestForm'), ti = el('bbTestInput');
    if (tf && !tf._bbBound) {
      tf._bbBound = true;
      tf.addEventListener('submit', (e) => {
        e.preventDefault(); if (!ti) return;
        const v = ti.value.trim(); if (!v) return;
        ti.value = ''; appendTestMsgImpl(v, false);
      });
    }
    // tour buttons
    on('bbTourStartBtn', startTour);
    on('bbHelpBtn', startTour);
    on('bbEmptyNewBotBtn', () => createBot('Новый бот'));
    on('bbTourClose', closeTour);
    on('bbTourSkip', closeTour);
    on('bbTourNext', nextTour);
    on('bbTourPrev', prevTour);
    // modal backdrop closes
    const m = el('botBuilderModal');
    if (m && !m._bbBound) {
      m._bbBound = true;
      m.addEventListener('click', (e) => {
        if (e.target === m) closeBuilder();
        // Re-bind in case DOM changed (e.g. props panel re-rendered)
        setTimeout(bindEditorEvents, 0);
      });
    }
    // close test modal
    $$('[data-close-modal="bbTestModal"]').forEach(b => {
      if (b._bbBound) return; b._bbBound = true;
      b.addEventListener('click', () => { const tm = el('bbTestModal'); try{tm.close();}catch(e){if(tm)tm.removeAttribute('open');} });
    });
    // tour overlay backdrop close
    const ov = el('bbTourOverlay');
    if (ov && !ov._bbBoundOverlay) {
      ov._bbBoundOverlay = true;
      ov.addEventListener('click', (e) => { if (e.target === ov) closeTour(); });
    }
  }



  // ---- Saved user bots: make them real working chats ----------------------
  const CUSTOM_BOT_CHAT_PREFIX = 'custom-bot-';
  const CUSTOM_BOT_TITLE_FALLBACK = 'Новый бот';
  const customBotRuntime = {};

  function normalizeBotUsername(value) {
    let raw = String(value || '').trim();
    if (!raw) return '@bot';
    raw = raw.replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9а-я_]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 28);
    return '@' + (raw || 'bot');
  }

  function customBotChatId(bot) {
    return CUSTOM_BOT_CHAT_PREFIX + String(bot?.id || '').replace(/[^a-z0-9_-]/gi, '_');
  }

  function botInitial(bot) {
    const name = String(bot?.name || CUSTOM_BOT_TITLE_FALLBACK).trim();
    return (name[0] || 'Б').toUpperCase();
  }

  function isCustomBotChat(chat) {
    if (!chat || isBotFilterChat(chat)) return false;
    if (chat.isCustomUserBot || chat.isBotBuilderBot || String(chat.id || '').startsWith(CUSTOM_BOT_CHAT_PREFIX)) return true;
    const username = String(chat.username || '').trim().toLowerCase();
    return bots.some((bot) => normalizeBotUsername(bot.username).toLowerCase() === username);
  }

  function getBotByChat(chat) {
    if (!chat) return null;
    if (chat.botBuilderId) {
      const byId = bots.find((bot) => String(bot.id) === String(chat.botBuilderId));
      if (byId) return byId;
    }
    const chatId = String(chat.id || '');
    if (chatId.startsWith(CUSTOM_BOT_CHAT_PREFIX)) {
      const raw = chatId.slice(CUSTOM_BOT_CHAT_PREFIX.length);
      const byChatId = bots.find((bot) => String(bot.id).replace(/[^a-z0-9_-]/gi, '_') === raw);
      if (byChatId) return byChatId;
    }
    const username = String(chat.username || '').trim().toLowerCase();
    if (username) {
      const byUsername = bots.find((bot) => normalizeBotUsername(bot.username).toLowerCase() === username);
      if (byUsername) return byUsername;
    }
    const title = String(chat.title || '').trim().toLowerCase();
    return bots.find((bot) => String(bot.name || '').trim().toLowerCase() === title) || null;
  }

  function makeBotKeyboard(buttons) {
    const clean = (Array.isArray(buttons) ? buttons : [])
      .map((button) => String(button || '').trim())
      .filter(Boolean);
    if (!clean.length) return [];
    const rows = [];
    for (let i = 0; i < clean.length; i += 2) {
      rows.push(clean.slice(i, i + 2).map((text) => ({ text, command: text, icon: '' })));
    }
    return rows;
  }

  function ensureCustomBotGreeting(chat, bot) {
    chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
    const hasAnyBotMessage = chat.messages.some((message) => message?.from !== 'me');
    if (hasAnyBotMessage) return;
    const startBlock = findBotReplyBlock(bot, '/start', chat.id, { silentFallback: true }) || (bot.blocks || [])[0];
    chat.messages.push({
      id: 'cb_greet_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      from: 'them',
      author: bot.name || CUSTOM_BOT_TITLE_FALLBACK,
      text: startBlock?.text || 'Привет! Напишите /start, чтобы начать.',
      time: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      createdAt: Date.now(),
      read: true,
      reactions: [],
      files: [],
      botKeyboard: makeBotKeyboard(startBlock?.buttons || []),
      isCustomUserBotMessage: true
    });
    if (startBlock?.id) customBotRuntime[chat.id] = { lastBlockId: startBlock.id };
  }

  function ensureCustomBotChats(options = {}) {
    if (!window.state || !Array.isArray(window.state.chats)) return;
    bots.forEach((bot) => {
      if (!bot || !bot.id) return;
      bot.username = normalizeBotUsername(bot.username || bot.name || 'bot') + (String(bot.username || '').includes('_bot') ? '' : '_bot');
      bot.username = normalizeBotUsername(bot.username);
      const id = customBotChatId(bot);
      let chat = window.state.chats.find((item) => item.id === id || (item.isCustomUserBot && String(item.botBuilderId) === String(bot.id)));
      if (!chat) {
        chat = {
          id,
          title: bot.name || CUSTOM_BOT_TITLE_FALLBACK,
          type: 'private',
          username: normalizeBotUsername(bot.username),
          status: 'ваш бот',
          online: false,
          avatar: botInitial(bot),
          avatarData: bot.avatarData || bot.customAvatar || '',
          unread: 0,
          archived: false,
          pinnedChat: false,
          pinnedChatAt: 0,
          pinned: '',
          description: 'Бот, созданный в Bot Filter.',
          isCustomUserBot: true,
          isBotBuilderBot: true,
          isSupportBot: true,
          botBuilderId: bot.id,
          messages: []
        };
        const botFilterIndex = window.state.chats.findIndex((c) => isBotFilterChat(c));
        const insertAt = botFilterIndex >= 0 ? botFilterIndex + 1 : 0;
        window.state.chats.splice(insertAt, 0, chat);
      }
      chat.id = id;
      chat.title = bot.name || CUSTOM_BOT_TITLE_FALLBACK;
      chat.username = normalizeBotUsername(bot.username);
      chat.status = 'ваш бот';
      chat.avatar = botInitial(bot);
      chat.avatarData = bot.avatarData || bot.customAvatar || '';
      chat.description = 'Бот, созданный в Bot Filter.';
      chat.isCustomUserBot = true;
      chat.isBotBuilderBot = true;
      chat.isSupportBot = true;
      chat.botBuilderId = bot.id;
      ensureCustomBotGreeting(chat, bot);
    });
    if (typeof window.persistChats === 'function') { try { window.persistChats(); } catch(e){} }
    if (options.render !== false && typeof window.renderChats === 'function') { try { window.renderChats(); } catch(e){} }
  }

  function removeCustomBotChat(botId) {
    if (!window.state || !Array.isArray(window.state.chats)) return;
    const before = window.state.chats.length;
    window.state.chats = window.state.chats.filter((chat) => !(chat.isCustomUserBot && String(chat.botBuilderId) === String(botId)) && chat.id !== (CUSTOM_BOT_CHAT_PREFIX + String(botId).replace(/[^a-z0-9_-]/gi, '_')));
    if (before !== window.state.chats.length) {
      if (typeof window.persistChats === 'function') { try { window.persistChats(); } catch(e){} }
      if (typeof window.renderChats === 'function') { try { window.renderChats(); } catch(e){} }
    }
  }

  function blockMatches(block, query, options = {}) {
    const trigger = String(block?.trigger || '').trim().toLowerCase();
    if (!trigger) return false;
    const q = String(query || '').trim().toLowerCase();
    if (!q) return false;
    if (trigger === q) return true;
    if (block.type === 'command') return trigger.replace(/@[a-z0-9_]+$/i, '') === q.replace(/@[a-z0-9_]+$/i, '');
    if (block.type === 'keyword' || options.fuzzy) {
      return q.includes(trigger) || trigger.includes(q);
    }
    return false;
  }

  function findNextBotBlock(bot, currentBlockId, query) {
    const blocks = Array.isArray(bot?.blocks) ? bot.blocks : [];
    const idx = blocks.findIndex((block) => block.id === currentBlockId);
    if (idx < 0) return null;
    const q = String(query || '').trim().toLowerCase();
    const prev = blocks[idx];
    const clickedKnownButton = (prev.buttons || []).some((button) => String(button || '').trim().toLowerCase() === q);
    if (clickedKnownButton) {
      const triggered = blocks.slice(idx + 1).find((block) => blockMatches(block, query, { fuzzy: false }));
      if (triggered) return triggered;
      const nextPlain = blocks.slice(idx + 1).find((block) => !String(block.trigger || '').trim() || ['message','buttons','media','question'].includes(block.type));
      if (nextPlain) return nextPlain;
    }
    return null;
  }

  function findBotReplyBlock(bot, text, chatId, options = {}) {
    const blocks = Array.isArray(bot?.blocks) ? bot.blocks : [];
    if (!blocks.length) return null;
    const q = String(text || '').trim().toLowerCase();
    const exact = blocks.find((block) => blockMatches(block, q, { fuzzy: false }));
    if (exact) return exact;
    const fuzzy = blocks.find((block) => block.type === 'keyword' && blockMatches(block, q, { fuzzy: true }));
    if (fuzzy) return fuzzy;
    if (chatId && customBotRuntime[chatId]?.lastBlockId) {
      const next = findNextBotBlock(bot, customBotRuntime[chatId].lastBlockId, q);
      if (next) return next;
    }
    if (q === '/start') return blocks.find((block) => block.type === 'command' && String(block.trigger || '').trim().toLowerCase().startsWith('/start')) || blocks[0];
    if (!options.silentFallback) return null;
    return blocks[0];
  }

  function appendCustomBotMessage(chat, bot, block) {
    if (!chat || !bot || !block) return;
    const now = Date.now();
    let text = String(block.text || '').trim();
    if (!text && block.type === 'media' && block.mediaUrl) text = `${block.mediaKind || 'Медиа'}: ${block.mediaUrl}`;
    if (!text && (block.buttons || []).length) text = 'Выберите вариант:';
    if (!text) text = '(пустой ответ)';
    chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
    chat.messages.push({
      id: 'cb_' + now + '_' + Math.random().toString(36).slice(2, 7),
      from: 'them',
      author: bot.name || CUSTOM_BOT_TITLE_FALLBACK,
      text,
      time: new Date(now).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      createdAt: now,
      read: true,
      reactions: [],
      files: [],
      botKeyboard: makeBotKeyboard(block.buttons || []),
      isCustomUserBotMessage: true
    });
    customBotRuntime[chat.id] = { lastBlockId: block.id };
  }

  function handleCustomBotUserMessage(text, chatId) {
    const chat = (window.state?.chats || []).find((c) => c.id === chatId) || (typeof window.activeChat === 'function' ? window.activeChat() : null);
    if (!isCustomBotChat(chat)) return false;
    const bot = getBotByChat(chat);
    if (!bot) return false;
    const block = findBotReplyBlock(bot, text, chat.id);
    if (!block) {
      appendCustomBotMessage(chat, bot, { id: 'not_found', text: 'Я не понял сообщение. Попробуйте /start или нажмите кнопку.', buttons: ['/start'] });
    } else {
      appendCustomBotMessage(chat, bot, block);
      if (block.goto) {
        const next = (bot.blocks || []).find((item) => item.id === block.goto);
        if (next) setTimeout(() => {
          appendCustomBotMessage(chat, bot, next);
          if (typeof window.persistChats === 'function') { try { window.persistChats(); } catch(e){} }
          if (typeof window.renderActiveChat === 'function') window.renderActiveChat({ animate: false, forceScrollToBottom: true });
        }, 350);
      }
    }
    if (typeof window.persistChats === 'function') { try { window.persistChats(); } catch(e){} }
    if (typeof window.renderChats === 'function') window.renderChats();
    if (typeof window.renderActiveChat === 'function') setTimeout(() => window.renderActiveChat({ animate: false, forceScrollToBottom: true }), 30);
    return true;
  }

  // ---- @BotFilter system chat --------------------------------------------
  const BOT_FILTER_ID = 'bot-filter';
  const BOT_FILTER_TITLE = 'Bot Filter';
  const BOT_FILTER_USERNAME = '@BotFilter';
  const BOT_FILTER_GREETING =
    '🤖 Привет! Я — Bot Filter.\n\n' +
    'Я помогу вам создать собственного бота для канала без кода. ' +
    'Откройте визуальный редактор и соберите цепочку команд, ответов и кнопок мышкой.\n\n' +
    'Команды:\n' +
    '/newbot — создать нового бота\n' +
    '/mybots — список ваших ботов\n' +
    '/tutorial — обучение\n' +
    '/templates — готовые шаблоны\n' +
    '/help — справка';

  function isBotFilterChat(chat) {
    if (!chat) return false;
    const t = String(chat.title||'').trim().toLowerCase();
    const u = String(chat.username||'').trim().toLowerCase();
    return Boolean(chat.id === BOT_FILTER_ID || chat.isBotFilter || u === '@botfilter' || u === 'botfilter' || t === 'bot filter' || t === 'botfilter');
  }

  function ensureBotFilterChat() {
    if (!window.state || !Array.isArray(window.state.chats)) return;
    let chat = window.state.chats.find(isBotFilterChat);
    if (!chat) {
      chat = { id: BOT_FILTER_ID, title: BOT_FILTER_TITLE, type: 'private', username: BOT_FILTER_USERNAME,
        status: 'бот-конструктор', online: false, avatar: '🤖', avatarData: '', unread: 0, archived: false,
        pinnedChat: false, pinnedChatAt: 0, pinned: '', description: 'Визуальный конструктор ботов без кода.',
        isBotFilter: true, isSupportBot: true, messages: [] };
      const savedIdx = window.state.chats.findIndex((c) => c.id === 'saved');
      window.state.chats.splice(savedIdx >= 0 ? savedIdx + 1 : 0, 0, chat);
    } else {
      chat.id = BOT_FILTER_ID; chat.title = BOT_FILTER_TITLE; chat.username = BOT_FILTER_USERNAME;
      chat.type = 'private'; chat.status = 'бот-конструктор'; chat.isBotFilter = true; chat.isSupportBot = true;
      chat.avatar = '🤖'; chat.description = 'Визуальный конструктор ботов без кода.';
    }
    chat.messages = Array.isArray(chat.messages) ? chat.messages : [];
    if (!chat.messages.length) {
      chat.messages.push({ id: 'bf_greet_'+Date.now(), from: 'them', author: BOT_FILTER_TITLE, text: BOT_FILTER_GREETING,
        ts: Date.now(), status: 'read', out: false });
    }
    if (typeof window.persistChats === 'function') { try { window.persistChats(); } catch(e){} }
  }

  function handleBotFilterUserMessage(text) {
    const chat = (window.state.chats||[]).find(isBotFilterChat); if (!chat) return;
    const lower = String(text||'').trim().toLowerCase();
    let reply = 'Откройте редактор по кнопке ниже, чтобы начать создавать бота.';
    let openEditor = false, startTourFlag = false, createFlag = false;
    if (lower === '/start' || lower === '/help' || lower === '?') {
      reply = BOT_FILTER_GREETING + '\n\n💡 Совет: нажмите «Открыть редактор» ниже.';
    } else if (lower === '/newbot' || lower === '/create' || lower === 'создать бота' || lower === 'новый бот') {
      reply = '✅ Отлично! Открываю редактор для создания нового бота...'; openEditor = true; createFlag = true;
    } else if (lower === '/mybots' || lower === 'мои боты') {
      reply = bots.length
        ? ('📋 У вас ' + bots.length + ' бот(ов):\n' + bots.map((b,i)=>(i+1)+'. '+b.name+' — '+b.username).join('\n') + '\n\nНажмите «Открыть редактор», чтобы управлять ими.')
        : 'У вас пока нет ботов. Напишите /newbot чтобы создать первого.';
      openEditor = true;
    } else if (lower === '/templates' || lower === 'шаблоны') {
      reply = '📦 Шаблоны: Приветствие, FAQ, Магазин, Обратная связь. Откройте редактор.'; openEditor = true;
    } else if (lower === '/tutorial' || lower === '/tour' || lower === 'обучение' || lower === 'как пользоваться' || lower === 'помощь') {
      reply = '📚 Открываю обучающий тур...'; openEditor = true; startTourFlag = true;
    }
    chat.messages.push({ id: 'bf_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
      from: 'them', author: BOT_FILTER_TITLE, text: reply, ts: Date.now(), status: 'received', out: false });
    if (typeof window.renderChats === 'function') window.renderChats();
    if (typeof window.renderActiveChat === 'function') setTimeout(() => window.renderActiveChat({animate:false}), 30);
    if (openEditor) setTimeout(() => {
      openBuilder();
      if (createFlag) createBot('Новый бот');
      if (startTourFlag) setTimeout(startTour, 300);
    }, 400);
  }

  // ---- Event plumbing to host app ----------------------------------------
  function wireHostEvents() {
    // Inline buttons inside saved custom bot chats: send immediately, не вставлять текст в поле.
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bot-command]');
      if (!btn) return;
      const active = window.state && window.state.chats && window.state.chats.find((c) => c.id === window.state.activeChatId);
      if (!isCustomBotChat(active)) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      const value = String(btn.dataset.botCommand || btn.textContent || '').trim();
      if (value && typeof window.sendMessage === 'function') window.sendMessage(value, []);
    }, true);

    // drawer menu
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-drawer-action="bot-builder"]');
      if (btn) { 
        e.preventDefault(); 
        if (typeof window.closeDrawer === 'function') window.closeDrawer(); 
        // User request: click on Bot Filter transfers to Bot Filter chat and opens panel
        try {
          if (typeof window.ensureBotFilterChat === 'function') window.ensureBotFilterChat();
          if (window.state && typeof window.setActiveChatId === 'function') {
            const bfChat = (window.state.chats || []).find(c => c.id === 'bot-filter' || c.isBotFilter);
            if (bfChat) {
              window.setActiveChatId(bfChat.id);
              if (typeof window.renderChats === 'function') window.renderChats();
              if (typeof window.renderActiveChat === 'function') window.renderActiveChat({ animate: true });
            }
          }
        } catch(err){}
        openBuilder(); 
      }

      // Click on slash commands (e.g. /newbot, /help) inside Bot Filter chat -> auto-send
      const cmdBtn = e.target.closest('[data-bot-command]');
      if (cmdBtn) {
        const active = window.state && window.state.chats && window.state.chats.find((c) => c.id === window.state.activeChatId);
        if (isBotFilterChat(active)) {
          e.preventDefault(); e.stopPropagation();
          const raw = String(cmdBtn.dataset.botCommand || cmdBtn.textContent || '').trim();
          const cmd = raw.split(/\s+/)[0].replace(/[—–-].*$/, '');
          if (cmd && typeof window.sendMessage === 'function') {
            window.sendMessage(cmd, []);
            setTimeout(() => { if (typeof window.scrollActiveChatToBottom === 'function') window.scrollActiveChatToBottom(true); }, 80);
          }
          return;
        }
      }
    });
    // data-close-modal for our modal
    document.addEventListener('click', (e) => {
      const cb = e.target.closest('[data-close-modal="botBuilderModal"]');
      if (cb) closeBuilder();
    });
    // BotFilter chat click -> open builder
    document.addEventListener('click', (e) => {
      const item = e.target.closest('[data-chat-id]');
      if (item && item.dataset.chatId === BOT_FILTER_ID) {
        setTimeout(() => { openBuilder(); currentBotId = null; selectedBlockId = null; refreshBuilderView(); }, 250);
        return;
      }
      const gs = e.target.closest('[data-global-contact]');
      if (gs && gs.dataset.globalContact === BOT_FILTER_ID) {
        e.preventDefault(); e.stopPropagation();
        if (typeof window.closeGlobalSearch === 'function') window.closeGlobalSearch();
        setTimeout(openBuilder, 300);
      }
    }, true);
    // Inline buttons in bot chat
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bf-action], button[data-action="open-builder"], button[data-action="new-bot"], button[data-action="tutorial"], button[data-action="my-bots"]');
      if (!btn) return;
      const action = btn.dataset.bfAction || btn.dataset.action;
      openBuilder();
      currentBotId = null; selectedBlockId = null; refreshBuilderView();
      if (action === 'new-bot') createBot('Новый бот');
      else if (action === 'tutorial') setTimeout(startTour, 400);
    });
    // composer submit interception for BotFilter
    let _origSend = null;
    function patchSend() {
      if (typeof window.sendMessage !== 'function' || _origSend) return;
      _origSend = window.sendMessage;
      window.sendMessage = function (text, files, extras) {
        const activeBeforeSend = window.state && window.state.chats && window.state.chats.find((c) => c.id === window.state.activeChatId);
        const ret = _origSend.apply(this, arguments);
        try {
          const active = window.state && window.state.chats && window.state.chats.find((c) => c.id === window.state.activeChatId) || activeBeforeSend;
          if (isBotFilterChat(active) && text && text.trim()) setTimeout(() => handleBotFilterUserMessage(String(text).trim()), 180);
          else if (isCustomBotChat(active) && text && String(text).trim()) setTimeout(() => handleCustomBotUserMessage(String(text).trim(), active.id), 180);
        } catch(e){}
        return ret;
      };
    }
    let _origSetActive = null;
    function patchSetActive() {
      if (typeof window.setActiveChatId !== 'function' || _origSetActive) return;
      _origSetActive = window.setActiveChatId;
      window.setActiveChatId = function (id) {
        const ret = _origSetActive.apply(this, arguments);
        if (String(id) === BOT_FILTER_ID) setTimeout(() => { openBuilder(); currentBotId=null; selectedBlockId=null; refreshBuilderView(); }, 250);
        return ret;
      };
    }
    // Patch isInstantBotCommand so /newbot /mybots /tutorial /templates are click-to-send
    function patchInstantCommands() {
      if (typeof window.isInstantBotCommand !== 'function' || patchInstantCommands._done) return;
      patchInstantCommands._done = true;
      const orig = window.isInstantBotCommand;
      const EXTRA = new Set(['/newbot','/mybots','/tutorial','/templates','/tour','/create']);
      window.isInstantBotCommand = function (cmd) {
        if (orig.apply(this, arguments)) return true;
        const raw = String(cmd||'').trim().toLowerCase().split(/\s+/)[0].replace(/@[a-z0-9_]+$/i,'');
        return EXTRA.has(raw);
      };
    }
    function patchContacts() {
      if (typeof window.allContacts !== 'function' && !patchContacts._done) { patchContacts._done = true; return; }
      if (patchContacts._done2) return;
      const orig = window.allContacts;
      window.allContacts = function () {
        const list = orig.apply(this, arguments);
        if (!list.some((c) => c.id === BOT_FILTER_ID)) {
          list.unshift({ id: BOT_FILTER_ID, chatId: BOT_FILTER_ID, name: BOT_FILTER_TITLE, username: BOT_FILTER_USERNAME,
            phone: '', status: 'бот-конструктор', avatar: '🤖', avatarData: '',
            about: 'Визуальный конструктор ботов без кода.', isSupportBot: false, isBotFilter: true });
        }
        bots.forEach((bot) => {
          const id = customBotChatId(bot);
          if (!list.some((c) => c.id === id || c.chatId === id)) {
            list.push({ id, chatId: id, name: bot.name || CUSTOM_BOT_TITLE_FALLBACK, username: normalizeBotUsername(bot.username),
              phone: '', status: 'ваш бот', avatar: botInitial(bot), avatarData: bot.avatarData || bot.customAvatar || '',
              about: 'Бот, созданный в Bot Filter.', isSupportBot: true, isCustomUserBot: true, isBotBuilderBot: true, botBuilderId: bot.id });
          }
        });
        return list;
      };
      patchContacts._done2 = true;
    }
    function bootstrap() {
      try {
        // Do not create Bot Filter chat automatically; a clean account must show only Saved Messages.
        ensureCustomBotChats({ render: false });
        patchContacts();
        patchSend();
        patchSetActive();
        patchInstantCommands();
        bindEditorEvents();
        if (typeof window.renderChats === 'function') window.renderChats();
      } catch(e){ console.warn('BotFilter bootstrap:', e); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(bootstrap, 300));
    else setTimeout(bootstrap, 100);
    setTimeout(bootstrap, 1000);
    setTimeout(bootstrap, 3000);
  }

  // ---- Publish public API -------------------------------------------------
  Object.assign(window.__bb, { startTour, closeTour, nextTour, prevTour, createBot, openBuilder, openTest, ensureCustomBotChats });
  window.openBotBuilder = openBuilder;
  window.bbStartTour = startTour;
  window.bbCreateBot = createBot;
  window.bbDebug = () => ({
    tourStart: !!el('bbTourStartBtn'), help: !!el('bbHelpBtn'), newBotEmpty: !!el('bbEmptyNewBotBtn'),
    tourOverlay: !!el('bbTourOverlay'), __bb: !!window.__bb, api: Object.keys(window.__bb||{}),
  });

  wireHostEvents();
})();
