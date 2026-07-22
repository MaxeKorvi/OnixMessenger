(() => {
  'use strict';

  const PACK_CODE = 'telegram_svg_reactions';
  const REACTION_CODE = 'paid:sparkles';
  const DEFAULT_PAYMENT_URL = 'https://c2c.cbrpay.ru/AS1I006HDECEM26N9BGQ55VMKV8PR8AA';
  const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

  const catalogState = {
    loaded: false,
    loading: false,
    owned: false,
    amountKopecks: 9900,
    bank: 'ВТБ',
    paymentUrl: DEFAULT_PAYMENT_URL,
    purchase: null
  };

  let catalogRequest = null;

  function isPaidReactionCode(value) {
    return String(value || '') === REACTION_CODE;
  }

  function sparklesSvg() {
    return `
      <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M32 4c1.8 14.8 5.7 24.4 25.4 28C37.7 35.6 33.8 45.2 32 60 30.2 45.2 26.3 35.6 6.6 32 26.3 28.4 30.2 18.8 32 4Z" fill="currentColor"/>
        <path d="M14.2 9.8c.7 5.7 2.2 9.3 9.8 10.7-7.6 1.4-9.1 5-9.8 10.7-.7-5.7-2.2-9.3-9.8-10.7 7.6-1.4 9.1-5 9.8-10.7Z" fill="currentColor" opacity=".92"/>
        <path d="M50.4 17.6c.55 4.5 1.75 7.35 7.75 8.45-6 1.1-7.2 3.95-7.75 8.45-.55-4.5-1.75-7.35-7.75-8.45 6-1.1 7.2-3.95 7.75-8.45Z" fill="currentColor" opacity=".88"/>
        <path d="M16.2 43.4c.48 3.9 1.52 6.35 6.72 7.3-5.2.95-6.24 3.4-6.72 7.3-.48-3.9-1.52-6.35-6.72-7.3 5.2-.95 6.24-3.4 6.72-7.3Z" fill="currentColor" opacity=".84"/>
        <path d="M47.6 43.5c.38 3.1 1.2 5.05 5.33 5.8-4.13.75-4.95 2.7-5.33 5.8-.38-3.1-1.2-5.05-5.33-5.8 4.13-.75 4.95-2.7 5.33-5.8Z" fill="currentColor" opacity=".78"/>
        <circle cx="8.2" cy="38" r="2.25" fill="currentColor" opacity=".72"/>
        <circle cx="54.5" cy="39.5" r="2.25" fill="currentColor" opacity=".72"/>
        <circle cx="42.5" cy="9.5" r="2" fill="currentColor" opacity=".72"/>
      </svg>`;
  }

  function renderPaidReactionIcon(className = 'reaction-svg paid-reaction-icon') {
    return `<span class="${className}" title="Платные искры" aria-label="Платные искры">${sparklesSvg()}</span>`;
  }

  const baseRenderReactionIcon = renderReactionIcon;
  renderReactionIcon = function patchedRenderReactionIcon(reaction) {
    if (isPaidReactionCode(reaction)) return renderPaidReactionIcon();
    return baseRenderReactionIcon.apply(this, arguments);
  };

  const baseReactionAccentColor = reactionAccentColor;
  reactionAccentColor = function patchedReactionAccentColor(reaction) {
    if (isPaidReactionCode(reaction)) return '#9d8cff';
    return baseReactionAccentColor.apply(this, arguments);
  };

  async function loadCatalog(force = false) {
    if (!force && catalogState.loaded) return catalogState;
    if (!force && catalogRequest) return catalogRequest;
    if (!canUseServerApi()) {
      catalogState.loaded = true;
      return catalogState;
    }

    catalogState.loading = true;
    catalogRequest = apiGet('v2/reactions/catalog')
      .then((result) => {
        if (!result?.ok || !result.data?.pack) return catalogState;
        const pack = result.data.pack;
        catalogState.owned = pack.owned === true;
        catalogState.amountKopecks = Number(pack.amountKopecks || 9900) || 9900;
        catalogState.bank = String(pack.bank || 'ВТБ');
        catalogState.paymentUrl = String(pack.paymentUrl || DEFAULT_PAYMENT_URL);
        catalogState.purchase = pack.purchase && typeof pack.purchase === 'object'
          ? { ...pack.purchase }
          : null;
        catalogState.loaded = true;
        return catalogState;
      })
      .catch(() => catalogState)
      .finally(() => {
        catalogState.loading = false;
        catalogRequest = null;
      });
    return catalogRequest;
  }

  function decoratePaidButton(menu) {
    const button = menu?.querySelector?.(`[data-react="${REACTION_CODE}"]`);
    if (!button) return;
    button.classList.add('paid-reaction-button');
    button.classList.toggle('is-locked', !catalogState.owned);
    button.setAttribute('aria-label', catalogState.owned ? 'Поставить платные искры' : 'Купить платные искры');
    button.title = catalogState.owned ? 'Платные искры' : 'Платные искры — требуется покупка';
    button.querySelector('.paid-reaction-lock')?.remove();
    if (!catalogState.owned) button.insertAdjacentHTML('beforeend', '<span class="paid-reaction-lock" aria-hidden="true">₽</span>');
  }

  function repositionContextMenu(menu, clientX, clientY) {
    if (!menu?.isConnected) return;
    const rect = menu.getBoundingClientRect();
    let left = Number(clientX) || rect.left || 12;
    let top = Number(clientY) || rect.top || 12;
    if (left + rect.width > window.innerWidth - 10) left = window.innerWidth - rect.width - 10;
    if (top + rect.height > window.innerHeight - 10) top = window.innerHeight - rect.height - 10;
    menu.style.left = `${Math.max(10, left)}px`;
    menu.style.top = `${Math.max(10, top)}px`;
  }

  const baseOpenMessageContextMenu = openMessageContextMenu;
  openMessageContextMenu = function patchedOpenMessageContextMenu(event, messageId) {
    const result = baseOpenMessageContextMenu.apply(this, arguments);
    const menu = document.querySelector('.message-context .reaction-strip')?.closest('.message-context');
    if (!menu || !menu.querySelector(`[data-react="${REACTION_CODE}"]`)) return result;
    decoratePaidButton(menu);
    repositionContextMenu(menu, event?.clientX, event?.clientY);
    void loadCatalog().then(() => {
      if (!menu.isConnected) return;
      decoratePaidButton(menu);
      repositionContextMenu(menu, event?.clientX, event?.clientY);
    });
    return result;
  };

  function formatPrice(kopecks) {
    const rubles = Math.max(0, Number(kopecks || 0)) / 100;
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: Number.isInteger(rubles) ? 0 : 2,
      maximumFractionDigits: 2
    }).format(rubles);
  }

  function purchaseStatusHtml() {
    if (catalogState.owned) {
      return '<div class="paid-reaction-status is-approved"><b>✓</b><span>Платные искры активированы для вашего аккаунта.</span></div>';
    }
    const status = String(catalogState.purchase?.status || '');
    if (status === 'pending') {
      return '<div class="paid-reaction-status is-pending"><b>⌛</b><span>Чек отправлен и ожидает проверки.</span></div>';
    }
    if (status === 'rejected') {
      return '<div class="paid-reaction-status is-rejected"><b>!</b><span>Чек отклонён. Проверьте оплату и отправьте новый.</span></div>';
    }
    if (status === 'approved') {
      return '<div class="paid-reaction-status is-approved"><b>✓</b><span>Оплата подтверждена. Обновляем доступ.</span></div>';
    }
    return '';
  }

  function receiptFormHtml() {
    if (catalogState.owned || String(catalogState.purchase?.status || '') === 'pending') return '';
    return `
      <form class="paid-reaction-receipt-form" id="paidReactionReceiptForm" enctype="multipart/form-data">
        <label class="paid-reaction-file-label">
          <span>Прикрепить чек оплаты</span>
          <small>JPG, PNG или WEBP, не больше 10 МБ</small>
          <input id="paidReactionReceipt" name="receipt" type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" required>
        </label>
        <button class="primary-button paid-reaction-submit" type="submit">Отправить чек на проверку</button>
      </form>`;
  }

  function renderPurchaseModal() {
    const price = formatPrice(catalogState.amountKopecks);
    const pending = String(catalogState.purchase?.status || '') === 'pending';
    const paymentUrl = catalogState.paymentUrl || DEFAULT_PAYMENT_URL;
    const serverUnavailable = !canUseServerApi()
      ? '<div class="paid-reaction-status is-rejected"><b>!</b><span>Покупка доступна после запуска мессенджера через сервер.</span></div>'
      : '';

    openSimpleModal('Платная реакция', `
      <section class="paid-reaction-purchase" id="paidReactionPurchase" data-pack-code="${PACK_CODE}">
        <div class="paid-reaction-hero">
          <div class="paid-reaction-preview"><span>${renderPaidReactionIcon('paid-reaction-icon paid-reaction-icon-large')}</span></div>
          <h3>Искры для публикаций</h3>
          <p>В пакете только одна SVG-реакция — искры. После покупки она навсегда привязывается к аккаунту и доступна в каналах, где администратор включил платные реакции.</p>
          <div class="paid-reaction-price"><strong>${escapeHtml(price)} ₽</strong><span>единоразово</span></div>
        </div>
        ${serverUnavailable}
        ${purchaseStatusHtml()}
        ${catalogState.owned ? '' : `
          <div class="paid-reaction-pay-grid">
            <a class="paid-reaction-pay-link" href="${escapeHtml(paymentUrl)}" target="_blank" rel="noopener noreferrer">Оплатить через ${escapeHtml(catalogState.bank)}</a>
            <button class="paid-reaction-copy-link" id="paidReactionCopyLink" type="button">Скопировать ссылку</button>
          </div>
        `}
        ${pending || String(catalogState.purchase?.status || '') === 'approved' ? '<button class="paid-reaction-check-button" id="paidReactionCheckStatus" type="button">Проверить статус</button>' : ''}
        ${receiptFormHtml()}
      </section>
    `, { resetHistory: true, pushHistory: false });

    bindPurchaseModal();
  }

  function apiErrorMessage(data, fallback) {
    return String(data?.message || data?.detail?.message || data?.detail || fallback || 'Не удалось выполнить запрос');
  }

  function bindPurchaseModal() {
    const root = document.getElementById('paidReactionPurchase');
    if (!root) return;

    root.querySelector('#paidReactionCopyLink')?.addEventListener('click', async () => {
      const copied = await copyTextToClipboard(catalogState.paymentUrl || DEFAULT_PAYMENT_URL);
      toast(copied ? 'Ссылка на оплату скопирована' : 'Не удалось скопировать ссылку');
    });

    root.querySelector('#paidReactionCheckStatus')?.addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      button.textContent = 'Проверяем…';
      await loadCatalog(true);
      if (catalogState.owned) toast('Платные искры активированы');
      renderPurchaseModal();
    });

    root.querySelector('#paidReactionReceiptForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!canUseServerApi()) {
        toast('Запустите мессенджер через сервер');
        return;
      }
      const form = event.currentTarget;
      const input = form.querySelector('#paidReactionReceipt');
      const file = input?.files?.[0];
      if (!file) {
        toast('Выберите изображение чека');
        return;
      }
      const extension = String(file.name || '').toLowerCase().split('.').pop();
      const mimeAllowed = ['image/jpeg', 'image/png', 'image/webp'].includes(String(file.type || '').toLowerCase());
      const extensionAllowed = ['jpg', 'jpeg', 'png', 'webp'].includes(extension);
      if (!mimeAllowed && !extensionAllowed) {
        toast('Чек должен быть в формате JPG, PNG или WEBP');
        return;
      }
      if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) {
        toast('Размер чека должен быть не больше 10 МБ');
        return;
      }

      const submit = form.querySelector('.paid-reaction-submit');
      submit.disabled = true;
      submit.textContent = 'Отправляем…';
      const body = new FormData();
      body.append('receipt', file, file.name || 'receipt.jpg');

      try {
        const response = await fetch(`${API_BASE}/v2/payments/reaction-pack`, {
          method: 'POST',
          credentials: 'include',
          body
        });
        let data = {};
        try { data = await response.json(); } catch (error) { data = {}; }
        if (!response.ok || data.ok === false) {
          toast(apiErrorMessage(data, 'Не удалось отправить чек'));
          submit.disabled = false;
          submit.textContent = 'Отправить чек на проверку';
          return;
        }
        catalogState.purchase = data.request && typeof data.request === 'object'
          ? { ...data.request }
          : { status: 'pending' };
        catalogState.loaded = true;
        toast('Чек отправлен на проверку');
        renderPurchaseModal();
      } catch (error) {
        toast('Сервер недоступен. Попробуйте ещё раз');
        submit.disabled = false;
        submit.textContent = 'Отправить чек на проверку';
      }
    });
  }

  function openPaidReactionPurchase() {
    renderPurchaseModal();
    void loadCatalog(true).then(() => {
      const modal = document.getElementById('simpleModal');
      if (!modal?.open || !document.getElementById('paidReactionPurchase')) return;
      renderPurchaseModal();
    });
  }

  const baseApplyReaction = applyReaction;
  applyReaction = function patchedApplyReaction(messageId, reaction, options = {}) {
    if (!isPaidReactionCode(reaction)) return baseApplyReaction.apply(this, arguments);

    const callBase = () => baseApplyReaction.call(this, messageId, reaction, options);
    if (catalogState.loaded) {
      if (catalogState.owned) return callBase();
      closeMessageContextMenu();
      openPaidReactionPurchase();
      return undefined;
    }

    closeMessageContextMenu();
    void loadCatalog().then(() => {
      if (catalogState.owned) callBase();
      else openPaidReactionPurchase();
    });
    return undefined;
  };

  window.OnixPaidReactions = Object.freeze({
    packCode: PACK_CODE,
    reactionCode: REACTION_CODE,
    getState: () => ({ ...catalogState }),
    refresh: () => loadCatalog(true),
    openPurchase: openPaidReactionPurchase
  });
})();
