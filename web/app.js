(function () {
  const API_BASE = "/api";
  const STOCK_RENDER_LIMIT = 300;
  const moduleMeta = {
    dashboard: ["Обзор", "layout-dashboard", "Сводка по смене, очередям, зонам и финансам."],
    fulfillment: ["Фулфилмент", "package-check", "Операционная очередь поставок, SLA, резервы, блокировки и запуск сборки."],
    receipts: ["Приемка", "package-plus", "ASN, приемка по ШК, расхождения и карантин товара без штрихкода."],
    quarantine: ["Карантин", "shield-alert", "Проверка карточек, печать внутреннего ШК LOGOff и выпуск в доступный остаток."],
    stock: ["Остатки", "boxes", "Доступность, резервы, ячейки, SKU и клиентские остатки."],
    "client-requests": ["Заявки", "file-plus-2", "Поставки маркетплейсов и клиентские заявки на сборку."],
    picking: ["Сборка", "list-checks", "Очередь отбора, упаковки, контроля и закрытия задач."],
    inventory: ["Инвентаризация", "clipboard-check", "Полные, выборочные и циклические пересчеты по зонам."],
    clients: ["Клиенты", "building-2", "Клиентские карточки, контакты, статусы, лимиты и задолженность."],
    services: ["Услуги", "receipt-text", "Справочник услуг, тарифы клиентов и начисления."],
    billing: ["Финансы", "wallet-cards", "Счета, акты, ПКО, начисления и задолженность."],
    reports: ["Отчеты", "chart-no-axes-column-increasing", "Операционные, складские и финансовые показатели."],
    users: ["Роли", "users", "Пользователи, роли, права и аудит действий."],
    "ui-settings": ["Интерфейс", "sliders-horizontal", "Видимость окон, порядок меню и стартовый модуль."],
    integrations: ["1С", "cloud-upload", "Предпросмотр импорта и экспорт CSV для обмена с 1С."]
  };

  const moduleOrder = Object.keys(moduleMeta);
  const statusTitles = {
    ACTIVE: "Активен",
    PENDING: "Ожидает",
    BLOCKED: "Блок",
    DRAFT: "Черновик",
    OPEN: "Открыто",
    IN_PROGRESS: "В работе",
    DONE: "Готово",
    CANCELLED: "Отменено",
    QUARANTINE: "Карантин",
    APPROVED: "Согласовано",
    PAID: "Оплачено",
    OVERDUE: "Просрочено"
  };

  const state = {
    token: localStorage.getItem("wms-token"),
    user: null,
    dashboard: null,
    stock: [],
    quarantine: [],
    documents: [],
    query: "",
    taskFilter: "all",
    activeModule: "dashboard",
    moduleData: {},
    renderToken: 0,
    fulfillmentDraft: newFulfillmentDraft(),
    receiptDraft: {
      clientId: "",
      sourceDocument: "",
      lines: [newReceiptLine()]
    }
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function newReceiptLine(product = {}) {
    return {
      sku: product.sku || "",
      name: product.name || product.productName || "",
      barcode: product.barcode || "",
      expected: 1,
      accepted: 1
    };
  }

  function newFulfillmentDraft() {
    return {
      clientId: "",
      marketplace: "Wildberries",
      productId: "",
      quantity: 1
    };
  }

  function activateIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function iconName(name) {
    return name === "upload-cloud" ? "cloud-upload" : name;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function api(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
        ...(options.headers || {})
      }
    });

    if (!response.ok) {
      let message = `Ошибка ${response.status}`;
      try {
        const payload = await response.json();
        message = payload.message || message;
      } catch (error) {
        // Keep the HTTP fallback.
      }
      throw new Error(message);
    }

    if (response.status === 204) {
      return null;
    }
    return response.json();
  }

  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("is-visible");
    window.clearTimeout(Number(node.dataset.timer));
    node.dataset.timer = window.setTimeout(() => node.classList.remove("is-visible"), 3600);
  }

  function fmtMoney(value) {
    return Number(value || 0).toLocaleString("ru-RU", {
      style: "currency",
      currency: "RUB",
      maximumFractionDigits: 0
    });
  }

  function fmtDate(value, options = {}) {
    if (!value) return "";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      ...(options.dateOnly ? {} : { hour: "2-digit", minute: "2-digit" })
    }).format(new Date(value));
  }

  function statusChip(status) {
    const normalized = String(status || "").toLowerCase().replaceAll("_", "-");
    return `<span class="status-chip ${normalized}">${escapeHtml(statusTitles[status] || status || "нет статуса")}</span>`;
  }

  function showApp() {
    $("#auth-screen").classList.add("is-hidden");
    $("#app-shell").classList.remove("is-hidden");
  }

  function showAuth() {
    $("#app-shell").classList.add("is-hidden");
    $("#auth-screen").classList.remove("is-hidden");
  }

  function canOpenModule(id) {
    return id === "dashboard" || Boolean(state.user?.visibleModules?.includes(id));
  }

  function selectInitialModule() {
    const requested = decodeURIComponent(window.location.hash.replace("#", ""));
    const fallback = state.user.visibleModules[0] || "dashboard";
    state.activeModule = canOpenModule(requested) ? requested : fallback;
  }

  async function loadApp() {
    state.user = await api("/auth/me");
    state.dashboard = await api("/dashboard");
    const requests = [
      api("/stock").catch(() => []),
      api("/quarantine").catch(() => []),
      api("/billing/documents").catch(() => [])
    ];
    const [stock, quarantine, documents] = await Promise.all(requests);
    state.stock = stock;
    state.quarantine = quarantine;
    state.documents = documents;
    state.moduleData = {};
    selectInitialModule();
    showApp();
    renderAll();
  }

  function renderAll() {
    renderProfile();
    renderNav();
    renderKpis();
    renderDashboardPanels();
    renderCurrentModule();
    activateIcons();
  }

  function renderProfile() {
    $("#profile-name").textContent = state.user.displayName;
    $("#role-caption").textContent = state.user.roleTitle;
    $("#avatar").textContent = state.user.displayName
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    $("#notification-count").textContent = state.dashboard.kpis.quarantine;
  }

  function renderNav() {
    $("#nav-list").innerHTML = state.user.visibleModules.map((id) => {
      const [title, icon] = moduleMeta[id] || [id, "panel-top"];
      return `
        <a class="nav-link ${id === state.activeModule ? "is-active" : ""}" href="#${id}" data-module="${id}">
          <i data-lucide="${iconName(icon)}" aria-hidden="true"></i>
          <span>${escapeHtml(title)}</span>
        </a>
      `;
    }).join("");
  }

  function renderKpis() {
    const kpis = state.dashboard.kpis;
    const cards = [
      ["Приемка", kpis.receipts, "ASN в работе", "arrow-down-to-line", "receiving"],
      ["Карантин", kpis.quarantine, "единиц без допуска", "shield-alert", "quarantine"],
      ["Доступный остаток", kpis.availableStock, "единиц на складе", "warehouse", "stock"],
      ["Задания", kpis.activeTasks, "активная очередь", "list-checks", "picking"],
      ["Поставки", kpis.supplies, "маркетплейсы", "truck", "shipping"],
      ["Долг", fmtMoney(kpis.debt), "открытые документы", "wallet-cards", "billing"]
    ];

    $("#kpi-grid").innerHTML = cards.map(([label, value, hint, icon, cls]) => `
      <article class="kpi-card">
        <span class="kpi-icon ${cls}"><i data-lucide="${icon}" aria-hidden="true"></i></span>
        <div>
          <span class="label">${label}</span>
          <strong>${value}</strong>
          <small>${hint}</small>
        </div>
      </article>
    `).join("");
  }

  function renderDashboardPanels() {
    renderModules();
    renderWarehouse();
    renderTasks();
    renderStock();
    renderQuarantine();
    renderDocuments();
    renderTimeline();
  }

  function renderModules() {
    const query = state.query;
    const modules = state.dashboard.modules.filter((module) =>
      `${module.title} ${module.metric} ${module.state}`.toLowerCase().includes(query)
    );
    $("#module-grid").innerHTML = modules.map((module) => `
      <article class="module-card ${module.id === state.activeModule ? "is-active" : ""}" data-module="${module.id}" tabindex="0" role="button">
        <span class="module-icon"><i data-lucide="${iconName(module.icon)}" aria-hidden="true"></i></span>
        <h3>${escapeHtml(module.title)}</h3>
        <p>${moduleDescription(module.id)}</p>
        <strong>${escapeHtml(module.metric)}</strong>
      </article>
    `).join("");
  }

  function moduleDescription(id) {
    return escapeHtml(moduleMeta[id]?.[2] || "Рабочий модуль LOGOff WMS.");
  }

  function renderWarehouse() {
    $("#warehouse-map").innerHTML = state.dashboard.warehouseZones.map((zone, index) => {
      const loadClass = zone.load > 80 ? "high" : zone.load >= 60 ? "mid" : "low";
      return `
        <button class="zone zone-${index + 1} ${loadClass}" type="button" title="${escapeHtml(zone.title)}">
          ${escapeHtml(zone.id)}<span>${zone.load}%</span>
        </button>
      `;
    }).join("") + '<span class="dock-line">Доки 01-08</span>';
  }

  function renderTasks() {
    const rows = filteredTasks(state.dashboard.priorityTasks);
    $("#task-table").innerHTML = createTable(
      ["Задание", "Клиент", "Зона", "Ответственный", "Статус"],
      rows.map((task) => [
        `<strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.kind)} · ${fmtDate(task.dueAt)}</span>`,
        escapeHtml(task.clientName),
        escapeHtml(task.zone),
        escapeHtml(task.assignee),
        statusChip(task.status)
      ]),
      "В очереди нет задач"
    );
  }

  function filteredTasks(tasks) {
    const query = state.query;
    return tasks.filter((task) => {
      const matchesSearch = `${task.title} ${task.clientName} ${task.zone} ${task.assignee}`.toLowerCase().includes(query);
      const matchesFilter =
        state.taskFilter === "all" ||
        (state.taskFilter === "hot" && task.priority === "Срочно") ||
        (state.taskFilter === "blocked" && task.status === "BLOCKED");
      return matchesSearch && matchesFilter;
    });
  }

  function renderStock() {
    const rows = filteredStock(state.stock);
    const visibleRows = rows.slice(0, STOCK_RENDER_LIMIT);
    $("#stock-table").innerHTML = createTable(
      ["Клиент", "Товар", "Ячейка", "Доступно", "Резерв"],
      visibleRows.map((item) => [
        escapeHtml(item.clientName),
        `<strong>${escapeHtml(item.productName)}</strong><span>${escapeHtml(item.sku)} · ${escapeHtml(item.barcode || "без ШК")}</span>`,
        escapeHtml(item.location),
        `${item.available} ${escapeHtml(item.unit)}`,
        `${item.reserved} ${escapeHtml(item.unit)}`
      ]),
      "Остатков по текущему фильтру нет"
    ) + stockLimitNote(rows, visibleRows);
  }

  function filteredStock(rows) {
    const query = state.query;
    return rows.filter((item) =>
      `${item.clientName} ${item.productName} ${item.sku} ${item.barcode} ${item.location}`.toLowerCase().includes(query)
    );
  }

  function stockLimitNote(rows, visibleRows) {
    if (rows.length <= visibleRows.length) return "";
    return `<p class="section-note">Показано ${visibleRows.length} из ${rows.length}. Уточните поиск или используйте экспорт.</p>`;
  }

  function stockOptionsForClient(stock, clientId) {
    const byProduct = new Map();
    stock
      .filter((item) => item.clientId === clientId && item.available > 0)
      .forEach((item) => {
        const current = byProduct.get(item.productId) || {
          productId: item.productId,
          productName: item.productName,
          sku: item.sku,
          barcode: item.barcode,
          available: 0
        };
        current.available += Number(item.available || 0);
        byProduct.set(item.productId, current);
      });
    return Array.from(byProduct.values()).sort((a, b) => a.productName.localeCompare(b.productName, "ru"));
  }

  function slaLabel(minutes) {
    const value = Number(minutes || 0);
    if (value < 0) return `просрочено ${Math.abs(value)} мин`;
    if (value < 120) return `${value} мин`;
    if (value < 1440) return `${Math.round(value / 60)} ч`;
    return `${Math.round(value / 1440)} д`;
  }

  function renderQuarantine() {
    const rows = state.quarantine.filter((item) => item.status === "QUARANTINE");
    $("#quarantine-list").innerHTML = rows.length ? rows.map((item) => `
      <article class="list-item">
        <div>
          <strong>${escapeHtml(item.productName)}</strong>
          <span>${escapeHtml(item.clientName)} · ${item.quantity} шт · ${escapeHtml(item.reason)}</span>
        </div>
        <button class="text-button" type="button" data-release="${escapeHtml(item.id)}">Выпустить</button>
      </article>
    `).join("") : '<p class="empty-state">Карантин пуст</p>';
  }

  function renderDocuments() {
    const rows = state.documents || state.dashboard.billingDocuments || [];
    $("#documents-list").innerHTML = rows.slice(0, 6).map((document) => `
      <article class="list-item">
        <div>
          <strong>${escapeHtml(document.number)}</strong>
          <span>${escapeHtml(document.clientName)} · ${escapeHtml(document.type)} · ${escapeHtml(statusTitles[document.status] || document.status)}</span>
        </div>
        <b>${fmtMoney(document.amount)}</b>
      </article>
    `).join("") || '<p class="empty-state">Документов пока нет</p>';
  }

  function renderTimeline() {
    $("#timeline").innerHTML = state.dashboard.timeline.map((event) => `
      <li>
        <time>${fmtDate(event.at)}</time>
        <span><strong>${escapeHtml(event.title)}</strong>${escapeHtml(event.details)}</span>
      </li>
    `).join("");
  }

  function createTable(headers, rows, emptyText) {
    if (!rows.length) {
      return `<div class="loader-row">${escapeHtml(emptyText)}</div>`;
    }
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${rows.map((cells) => `
              <tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function setActiveModule(id, options = {}) {
    if (!canOpenModule(id)) {
      toast("Модуль недоступен для текущей роли");
      return;
    }
    state.activeModule = id;
    if (options.push !== false) {
      window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
    }
    $(".sidebar").classList.remove("is-open");
    renderNav();
    renderModules();
    renderCurrentModule();
    activateIcons();
  }

  function renderCurrentModule() {
    const [title] = moduleMeta[state.activeModule] || ["Рабочая панель"];
    $("#page-title").textContent = state.activeModule === "dashboard" ? "Рабочая панель" : title;
    $("#page-eyebrow").textContent = state.activeModule === "dashboard" ? "WMS LOGOff" : "Рабочее окно";

    const workspace = $("#module-workspace");
    const dashboard = $(".main-grid");
    if (state.activeModule === "dashboard") {
      workspace.classList.add("is-hidden");
      dashboard.classList.remove("is-hidden");
      return;
    }

    dashboard.classList.add("is-hidden");
    workspace.classList.remove("is-hidden");
    workspace.innerHTML = `
      ${moduleHeader(state.activeModule)}
      <div class="loader-row">Загружаю данные модуля...</div>
    `;
    loadAndRenderModule(state.activeModule);
  }

  function moduleHeader(id, actions = "") {
    const [title, icon, description] = moduleMeta[id] || [id, "panel-top", "Рабочий модуль WMS."];
    return `
      <div class="module-header">
        <div>
          <span class="label"><i data-lucide="${iconName(icon)}" aria-hidden="true"></i> ${escapeHtml(title)}</span>
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(description)}</p>
        </div>
        <div class="module-actions">${actions}</div>
      </div>
    `;
  }

  async function loadAndRenderModule(id) {
    const token = ++state.renderToken;
    try {
      const data = await loadModuleData(id);
      if (token !== state.renderToken || state.activeModule !== id) return;
      $("#module-workspace").innerHTML = renderModule(id, data);
      activateIcons();
    } catch (error) {
      if (token !== state.renderToken) return;
      $("#module-workspace").innerHTML = `${moduleHeader(id)}<div class="loader-row">${escapeHtml(error.message)}</div>`;
    }
  }

  async function loadModuleData(id, refresh = false) {
    if (!refresh && state.moduleData[id]) return state.moduleData[id];
    const loaders = {
      fulfillment: () => Promise.all([
        api("/fulfillment/dashboard"),
        api("/clients").catch(() => []),
        api("/stock").catch(() => [])
      ]).then(([overview, clients, stock]) => ({ overview, clients, stock })),
      receipts: () => Promise.all([api("/receipts"), api("/clients").catch(() => []), api("/products").catch(() => [])])
        .then(([receipts, clients, products]) => ({ receipts, clients, products })),
      quarantine: () => api("/quarantine").then((quarantine) => ({ quarantine })),
      stock: () => Promise.all([api("/stock"), api("/products").catch(() => [])]).then(([stock, products]) => ({ stock, products })),
      "client-requests": () => api("/marketplace-supplies").then((supplies) => ({ supplies })),
      picking: () => api("/tasks").then((tasks) => ({ tasks })),
      inventory: () => api("/inventory-counts").then((counts) => ({ counts })),
      clients: () => api("/clients").then((clients) => ({ clients })),
      services: () => Promise.all([api("/services"), api("/services/tariffs"), api("/billing/accruals").catch(() => [])])
        .then(([services, tariffs, accruals]) => ({ services, tariffs, accruals })),
      billing: () => Promise.all([api("/billing/documents"), api("/billing/accruals").catch(() => []), api("/clients").catch(() => [])])
        .then(([documents, accruals, clients]) => ({ documents, accruals, clients })),
      reports: () => api("/reports/overview").then((overview) => ({ overview })),
      users: () => Promise.all([api("/users"), api("/roles"), api("/audit").catch(() => [])])
        .then(([users, roles, audit]) => ({ users, roles, audit })),
      "ui-settings": () => api("/ui-settings").then((settings) => ({ settings })),
      integrations: () => api("/clients").then((clients) => ({ clients, preview: null })).catch(() => ({ clients: [], preview: null }))
    };
    const data = await (loaders[id] || (() => Promise.resolve({})))();
    state.moduleData[id] = data;
    return data;
  }

  function renderModule(id, data) {
    const actions = moduleActions(id);
    const body = {
      fulfillment: renderFulfillmentModule,
      receipts: renderReceiptsModule,
      quarantine: renderQuarantineModule,
      stock: renderStockModule,
      "client-requests": renderSuppliesModule,
      picking: renderPickingModule,
      inventory: renderInventoryModule,
      clients: renderClientsModule,
      services: renderServicesModule,
      billing: renderBillingModule,
      reports: renderReportsModule,
      users: renderUsersModule,
      "ui-settings": renderUiSettingsModule,
      integrations: renderIntegrationsModule
    }[id]?.(data) || '<div class="loader-row">Модуль пока готовится</div>';
    return `${moduleHeader(id, actions)}${body}`;
  }

  function moduleActions(id) {
    const buttons = {
      fulfillment: '<button class="primary-action" type="button" data-action="create-supply"><i data-lucide="file-plus-2"></i><span>Новая заявка</span></button>',
      receipts: '<button class="primary-action" type="button" data-action="create-receipt"><i data-lucide="package-plus"></i><span>Новая приемка</span></button>',
      quarantine: '<button type="button" data-action="refresh-module"><i data-lucide="refresh-cw"></i><span>Обновить</span></button>',
      stock: '<button type="button" data-action="export-stock"><i data-lucide="download"></i><span>Экспорт</span></button>',
      "client-requests": '<button class="primary-action" type="button" data-action="create-supply"><i data-lucide="file-plus-2"></i><span>Новая заявка</span></button>',
      picking: '<button type="button" data-action="refresh-module"><i data-lucide="refresh-cw"></i><span>Обновить</span></button>',
      inventory: '<button class="primary-action" type="button" data-action="create-inventory"><i data-lucide="clipboard-check"></i><span>Новый пересчет</span></button>',
      billing: '<button class="primary-action" type="button" data-action="create-billing"><i data-lucide="receipt-text"></i><span>Создать счет</span></button>',
      reports: '<button type="button" data-action="export-stock"><i data-lucide="download"></i><span>Экспорт остатков</span></button>',
      "ui-settings": '<button class="primary-action" type="button" data-action="save-inline-ui"><i data-lucide="save"></i><span>Сохранить</span></button>',
      integrations: '<button class="primary-action" type="button" data-action="preview-import"><i data-lucide="scan-search"></i><span>Проверить импорт</span></button>'
    };
    return buttons[id] || '<button type="button" data-action="refresh-module"><i data-lucide="refresh-cw"></i><span>Обновить</span></button>';
  }

  function renderFulfillmentModule(data) {
    const overview = data.overview || { kpis: {}, queue: [], stockSignals: [], recommendations: [], channelLoad: {} };
    const stock = data.stock || state.stock || [];
    const clients = data.clients || [];
    state.stock = stock;

    const fallbackClients = Array.from(new Map(stock.map((item) => [
      item.clientId,
      { id: item.clientId, name: item.clientName }
    ])).values());
    const clientOptions = clients.length ? clients : fallbackClients;
    const draft = state.fulfillmentDraft;
    draft.clientId = draft.clientId || state.user.clientId || clientOptions[0]?.id || stock[0]?.clientId || "";

    const productOptions = stockOptionsForClient(stock, draft.clientId);
    if (!productOptions.some((item) => item.productId === draft.productId)) {
      draft.productId = productOptions[0]?.productId || "";
    }
    const selectedProduct = productOptions.find((item) => item.productId === draft.productId);
    const quantityLimit = selectedProduct?.available || 1;
    draft.quantity = Math.min(Math.max(Number(draft.quantity || 1), 1), quantityLimit);

    const kpis = overview.kpis || {};
    const queue = (overview.queue || []).filter((item) =>
      `${item.number} ${item.clientName} ${item.marketplace} ${item.priority} ${(item.blockers || []).join(" ")}`.toLowerCase().includes(state.query)
    );

    return `
      ${metricStrip([
        ["В очереди", kpis.openOrders ?? 0],
        ["В работе", kpis.inProgressOrders ?? 0],
        ["Резерв", `${kpis.reservedUnits ?? 0} шт`],
        ["Карантин", `${kpis.quarantineUnits ?? 0} шт`]
      ])}

      <section class="fulfillment-grid">
        <div class="panel fulfillment-queue">
          <div class="panel-head">
            <div>
              <span class="label">Операции</span>
              <h2>Очередь фулфилмента</h2>
            </div>
            <span class="status-pill">${escapeHtml(kpis.nextSlaAt ? `SLA ${fmtDate(kpis.nextSlaAt)}` : "SLA чисто")}</span>
          </div>
          ${createTable(
            ["SLA", "Заявка", "Клиент", "Канал", "Прогресс", "Блокеры", "Действие"],
            queue.map((item) => [
              `<span class="status-chip ${item.slaMinutesLeft < 0 ? "bad" : item.priority === "Срочно" ? "warn" : "good"}">${escapeHtml(slaLabel(item.slaMinutesLeft))}</span>`,
              `<strong>${escapeHtml(item.number)}</strong><span>${item.reservedLines} строк · ${item.boxes} коробов</span>`,
              escapeHtml(item.clientName),
              escapeHtml(item.marketplace),
              `<div class="progress-cell"><div class="progress-track"><span style="width:${Math.max(0, Math.min(100, item.progress || 0))}%"></span></div><small>${item.progress || 0}%</small></div>`,
              item.blockers?.length ? item.blockers.map((blocker) => `<span class="blocker-chip">${escapeHtml(blocker)}</span>`).join("") : '<span class="muted">нет</span>',
              item.taskId && item.taskStatus !== "DONE" && state.user.permissions?.includes("TASKS_MANAGE")
                ? `<button class="inline-action" type="button" data-task-status="${escapeHtml(item.taskId)}" data-next-status="DONE">Закрыть</button>`
                : `<button class="inline-action" type="button" data-module="picking">Сборка</button>`
            ]),
            "Очередь фулфилмента пуста"
          )}
        </div>

        <aside class="fulfillment-side">
          <section class="panel">
            <div class="panel-head">
              <div>
                <span class="label">Запуск</span>
                <h2>Новая заявка</h2>
              </div>
            </div>
            <form id="fulfillment-form" class="fulfillment-form">
              <label>
                <span>Клиент</span>
                <select data-fulfillment-field="clientId" required>
                  ${clientOptions.map((client) => `
                    <option value="${escapeHtml(client.id)}" ${client.id === draft.clientId ? "selected" : ""}>${escapeHtml(client.name)}</option>
                  `).join("")}
                </select>
              </label>
              <label>
                <span>Маркетплейс</span>
                <select data-fulfillment-field="marketplace" required>
                  ${["Wildberries", "Ozon", "Яндекс Маркет", "СберМегаМаркет", "Avito"].map((marketplace) => `
                    <option value="${escapeHtml(marketplace)}" ${marketplace === draft.marketplace ? "selected" : ""}>${escapeHtml(marketplace)}</option>
                  `).join("")}
                </select>
              </label>
              <label>
                <span>Товар из остатка</span>
                <select id="fulfillment-product" data-fulfillment-field="productId" required ${productOptions.length ? "" : "disabled"}>
                  ${productOptions.map((item) => `
                    <option value="${escapeHtml(item.productId)}" ${item.productId === draft.productId ? "selected" : ""}>
                      ${escapeHtml(item.productName)} · ${escapeHtml(item.sku)} · ${item.available} шт
                    </option>
                  `).join("")}
                </select>
              </label>
              <label>
                <span>Количество</span>
                <input data-fulfillment-field="quantity" type="number" min="1" max="${escapeHtml(quantityLimit)}" step="1" value="${escapeHtml(draft.quantity)}" required>
              </label>
              <button class="primary-action" type="submit" ${productOptions.length ? "" : "disabled"}>
                <i data-lucide="play" aria-hidden="true"></i>
                <span>Поставить в сборку</span>
              </button>
              ${productOptions.length ? "" : '<p class="section-note">У выбранного клиента нет доступного остатка для сборки.</p>'}
            </form>
          </section>

          ${renderFulfillmentRecommendations(overview.recommendations || [])}
          ${renderFulfillmentChannels(overview.channelLoad || {})}
          ${renderFulfillmentStockSignals(overview.stockSignals || [])}
        </aside>
      </section>
    `;
  }

  function renderFulfillmentRecommendations(items) {
    return `
      <section class="panel">
        <div class="panel-head">
          <div>
            <span class="label">Контроль</span>
            <h2>Рекомендации</h2>
          </div>
        </div>
        <div class="signal-list">
          ${items.map((item) => `
            <button class="recommendation-card ${escapeHtml(item.severity)}" type="button" data-module="${escapeHtml(item.actionModule)}">
              <strong>${escapeHtml(item.title)}</strong>
              <span>${escapeHtml(item.details)}</span>
            </button>
          `).join("") || '<p class="empty-state">Рекомендаций пока нет</p>'}
        </div>
      </section>
    `;
  }

  function renderFulfillmentChannels(channelLoad) {
    const channels = Object.entries(channelLoad);
    return `
      <section class="panel">
        <div class="panel-head">
          <div>
            <span class="label">Каналы</span>
            <h2>Маркетплейсы</h2>
          </div>
        </div>
        <div class="channel-list">
          ${channels.map(([name, count]) => `
            <span><b>${escapeHtml(count)}</b>${escapeHtml(name)}</span>
          `).join("") || '<p class="empty-state">Каналы пока не загружены</p>'}
        </div>
      </section>
    `;
  }

  function renderFulfillmentStockSignals(items) {
    return `
      <section class="panel">
        <div class="panel-head">
          <div>
            <span class="label">Остатки</span>
            <h2>Готовность клиентов</h2>
          </div>
        </div>
        <div class="signal-list">
          ${items.slice(0, 6).map((item) => `
            <article class="signal-card">
              <div>
                <strong>${escapeHtml(item.clientName)}</strong>
                <span>${item.skuCount} SKU · ${item.availableUnits} доступно · ${item.reservedUnits} резерв</span>
              </div>
              <div class="progress-cell">
                <div class="progress-track"><span style="width:${Math.max(0, Math.min(100, item.fillRate || 0))}%"></span></div>
                <small>${item.fillRate}%</small>
              </div>
            </article>
          `).join("") || '<p class="empty-state">Остатков пока нет</p>'}
        </div>
      </section>
    `;
  }

  function renderReceiptsModule(data) {
    const rows = data.receipts || [];
    const clients = data.clients || [];
    const products = data.products || [];
    const selectedClientId = state.receiptDraft.clientId || clients[0]?.id || state.stock[0]?.clientId || state.user.clientId || "";
    state.receiptDraft.clientId = selectedClientId;
    if (!state.receiptDraft.sourceDocument) {
      state.receiptDraft.sourceDocument = `УПД ${new Date().toLocaleDateString("ru-RU")}`;
    }
    const accepted = rows.reduce((sum, receipt) => sum + receipt.lines.reduce((lineSum, line) => lineSum + line.accepted, 0), 0);
    const totalExpected = state.receiptDraft.lines.reduce((sum, line) => sum + Number(line.expected || 0), 0);
    const totalAccepted = state.receiptDraft.lines.reduce((sum, line) => sum + Number(line.accepted || 0), 0);
    const quarantineLines = state.receiptDraft.lines.filter((line) =>
      Number(line.accepted || 0) > 0 && (!String(line.barcode || "").trim() || !findDraftProduct(line, selectedClientId, products))
    ).length;
    const filteredRows = rows
      .filter((receipt) => `${receipt.number} ${receipt.clientName} ${receipt.sourceDocument}`.toLowerCase().includes(state.query))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return `
      ${metricStrip([
        ["Приемок", rows.length],
        ["Единиц принято", accepted],
        ["С расхождениями", rows.filter((row) => row.discrepancyCount > 0).length],
        ["Клиентов", new Set(rows.map((row) => row.clientId)).size]
      ])}
      <section class="panel">
        <div class="receipt-module">
          <form id="receipt-form" class="receipt-form">
            <datalist id="receipt-products">
              ${products.map((product) => `
                <option value="${escapeHtml(product.sku)}">${escapeHtml(product.name)} · ${escapeHtml(product.barcode || "без ШК")}</option>
                ${product.barcode ? `<option value="${escapeHtml(product.barcode)}">${escapeHtml(product.name)} · ${escapeHtml(product.sku)}</option>` : ""}
              `).join("")}
            </datalist>

            <div class="receipt-toolbar">
              <label>
                <span>Клиент</span>
                <select id="receipt-client" name="clientId" data-receipt-field="clientId" required>
                  ${clients.map((client) => `
                    <option value="${escapeHtml(client.id)}" ${client.id === selectedClientId ? "selected" : ""}>${escapeHtml(client.name)}</option>
                  `).join("")}
                </select>
              </label>
              <label>
                <span>Документ</span>
                <input id="receipt-source" name="sourceDocument" data-receipt-field="sourceDocument" type="text" value="${escapeHtml(state.receiptDraft.sourceDocument)}" required>
              </label>
              <button class="primary-action" type="submit">
                <i data-lucide="check-check" aria-hidden="true"></i>
                <span>Провести</span>
              </button>
            </div>

            <div class="receipt-stats" aria-label="Итоги текущей приемки">
              <span><b>${totalExpected}</b> план</span>
              <span><b>${totalAccepted}</b> факт</span>
              <span><b>${quarantineLines}</b> карантин</span>
            </div>

            <div class="receipt-lines">
              ${state.receiptDraft.lines.map((line, index) => receiptLineTemplate(line, index)).join("")}
            </div>

            <div class="receipt-actions">
              <button type="button" data-add-receipt-line>
                <i data-lucide="plus" aria-hidden="true"></i>
                <span>Строка</span>
              </button>
              <button type="button" data-fill-receipt-from-stock>
                <i data-lucide="wand-sparkles" aria-hidden="true"></i>
                <span>Из остатка</span>
              </button>
            </div>
          </form>

          <div class="receipt-log">
            <div class="receipt-log-head">
              <span class="label">Журнал ASN</span>
              <strong>${filteredRows.length}</strong>
            </div>
            ${createTable(
              ["Номер", "Клиент", "Документ", "Строки", "Расхождения", "Статус", "Создана"],
              filteredRows.map((receipt) => [
                `<strong>${escapeHtml(receipt.number)}</strong>`,
                escapeHtml(receipt.clientName),
                escapeHtml(receipt.sourceDocument),
                String(receipt.lines.length),
                String(receipt.discrepancyCount),
                statusChip(receipt.status),
                fmtDate(receipt.createdAt)
              ]),
              "Приемок пока нет"
            )}
          </div>
        </div>
      </section>
    `;
  }

  function receiptLineTemplate(line, index) {
    return `
      <div class="receipt-line" data-receipt-line="${index}">
        <label>
          <span>SKU / ШК</span>
          <input type="text" list="receipt-products" value="${escapeHtml(line.sku)}" data-line-field="sku" autocomplete="off" required>
        </label>
        <label>
          <span>Товар</span>
          <input type="text" value="${escapeHtml(line.name)}" data-line-field="name" required>
        </label>
        <label>
          <span>ШК</span>
          <input type="text" value="${escapeHtml(line.barcode)}" data-line-field="barcode" autocomplete="off">
        </label>
        <label>
          <span>План</span>
          <input type="number" min="0" step="1" value="${Number(line.expected || 0)}" data-line-field="expected" required>
        </label>
        <label>
          <span>Факт</span>
          <input type="number" min="0" step="1" value="${Number(line.accepted || 0)}" data-line-field="accepted" required>
        </label>
        <button class="icon-button receipt-remove" type="button" data-remove-receipt-line="${index}" aria-label="Удалить строку" title="Удалить строку">
          <i data-lucide="x" aria-hidden="true"></i>
        </button>
      </div>
    `;
  }

  function findDraftProduct(line, clientId, products = state.moduleData.receipts?.products || []) {
    const sku = String(line.sku || "").trim().toLowerCase();
    const barcode = String(line.barcode || "").trim();
    return products.find((product) =>
      product.clientId === clientId && (barcode ? product.barcode === barcode : product.sku.toLowerCase() === sku)
    );
  }

  function renderQuarantineModule(data) {
    const rows = data.quarantine || [];
    state.quarantine = rows;
    return `
      ${metricStrip([
        ["Позиций", rows.length],
        ["Единиц", rows.reduce((sum, row) => sum + row.quantity, 0)],
        ["В работе", rows.filter((row) => row.status === "QUARANTINE").length],
        ["Выпущено", rows.filter((row) => row.status === "APPROVED").length]
      ])}
      <section class="panel">
        ${createTable(
          ["Товар", "Клиент", "SKU", "Зона", "Причина", "Статус", "Действие"],
          rows.map((item) => [
            `<strong>${escapeHtml(item.productName)}</strong><span>${item.quantity} шт · ${fmtDate(item.receivedAt)}</span>`,
            escapeHtml(item.clientName),
            escapeHtml(item.sku || "без SKU"),
            escapeHtml(item.zone),
            escapeHtml(item.reason),
            statusChip(item.status),
            item.status === "QUARANTINE" ? `<button class="inline-action" type="button" data-release="${escapeHtml(item.id)}">Выпустить</button>` : escapeHtml(item.candidateBarcode || "")
          ]),
          "Карантин пуст"
        )}
      </section>
    `;
  }

  function renderStockModule(data) {
    const rows = filteredStock(data.stock || []);
    const visibleRows = rows.slice(0, STOCK_RENDER_LIMIT);
    state.stock = data.stock || [];
    return `
      ${metricStrip([
        ["Строк", rows.length],
        ["Доступно", rows.reduce((sum, row) => sum + row.available, 0)],
        ["В резерве", rows.reduce((sum, row) => sum + row.reserved, 0)],
        ["Без ШК", rows.filter((row) => !row.barcode).length]
      ])}
      <section class="panel">
        ${createTable(
          ["Клиент", "Товар", "SKU / ШК", "Ячейка", "Доступно", "Резерв", "Карантин"],
          visibleRows.map((item) => [
            escapeHtml(item.clientName),
            `<strong>${escapeHtml(item.productName)}</strong>`,
            `<span>${escapeHtml(item.sku)}</span><span>${escapeHtml(item.barcode || "без ШК")}</span>`,
            escapeHtml(item.location),
            `${item.available} ${escapeHtml(item.unit)}`,
            `${item.reserved} ${escapeHtml(item.unit)}`,
            `${item.quarantine} ${escapeHtml(item.unit)}`
          ]),
          "Остатков по текущему фильтру нет"
        )}
        ${stockLimitNote(rows, visibleRows)}
      </section>
    `;
  }

  function renderSuppliesModule(data) {
    const rows = data.supplies || [];
    return `
      ${metricStrip([
        ["Заявок", rows.length],
        ["Коробов", rows.reduce((sum, row) => sum + row.boxes, 0)],
        ["Строк в резерве", rows.reduce((sum, row) => sum + row.reservedLines, 0)],
        ["Открыто", rows.filter((row) => row.status === "OPEN" || row.status === "IN_PROGRESS").length]
      ])}
      <section class="panel">
        ${createTable(
          ["Номер", "Клиент", "Маркетплейс", "Строк", "Короба", "Статус", "Создана"],
          rows.map((supply) => [
            `<strong>${escapeHtml(supply.number)}</strong>`,
            escapeHtml(supply.clientName),
            escapeHtml(supply.marketplace),
            String(supply.reservedLines),
            String(supply.boxes),
            statusChip(supply.status),
            fmtDate(supply.createdAt)
          ]),
          "Заявок на сборку пока нет"
        )}
      </section>
    `;
  }

  function renderPickingModule(data) {
    const rows = filteredTasks(data.tasks || []);
    return `
      ${metricStrip([
        ["Задач", rows.length],
        ["Срочно", rows.filter((row) => row.priority === "Срочно").length],
        ["В работе", rows.filter((row) => row.status === "IN_PROGRESS").length],
        ["Блок", rows.filter((row) => row.status === "BLOCKED").length]
      ])}
      <section class="panel">
        ${createTable(
          ["Задача", "Клиент", "Зона", "Ответственный", "Приоритет", "Статус", "Действие"],
          rows.map((task) => [
            `<strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.kind)} · до ${fmtDate(task.dueAt)}</span>`,
            escapeHtml(task.clientName),
            escapeHtml(task.zone),
            escapeHtml(task.assignee),
            escapeHtml(task.priority),
            statusChip(task.status),
            task.status === "DONE" ? "Готово" : `<button class="inline-action" type="button" data-task-status="${escapeHtml(task.id)}" data-next-status="DONE">Закрыть</button>`
          ]),
          "Задач по текущему фильтру нет"
        )}
      </section>
    `;
  }

  function renderInventoryModule(data) {
    const rows = data.counts || [];
    return `
      ${metricStrip([
        ["Пересчетов", rows.length],
        ["Открыто", rows.filter((row) => row.status === "OPEN").length],
        ["Расхождения", rows.reduce((sum, row) => sum + row.discrepancies, 0)],
        ["Зон", new Set(rows.map((row) => row.zone)).size]
      ])}
      <section class="panel">
        ${createTable(
          ["Номер", "Тип", "Зона", "Расхождения", "Статус", "Старт"],
          rows.map((count) => [
            `<strong>${escapeHtml(count.number)}</strong>`,
            escapeHtml(count.type),
            escapeHtml(count.zone),
            String(count.discrepancies),
            statusChip(count.status),
            fmtDate(count.startedAt)
          ]),
          "Инвентаризаций пока нет"
        )}
      </section>
    `;
  }

  function renderClientsModule(data) {
    const rows = data.clients || [];
    return `
      ${metricStrip([
        ["Клиентов", rows.length],
        ["Активных", rows.filter((row) => row.status === "ACTIVE").length],
        ["Долг", fmtMoney(rows.reduce((sum, row) => sum + Number(row.debt || 0), 0))],
        ["Лимит", fmtMoney(rows.reduce((sum, row) => sum + Number(row.balanceLimit || 0), 0))]
      ])}
      <section class="panel">
        ${createTable(
          ["Клиент", "ИНН", "Контакт", "Телефон", "Email", "Долг", "Статус"],
          rows.map((client) => [
            `<strong>${escapeHtml(client.name)}</strong><span>${escapeHtml(client.legalName)}</span>`,
            escapeHtml(client.inn),
            escapeHtml(client.contactName),
            escapeHtml(client.phone),
            escapeHtml(client.email),
            fmtMoney(client.debt),
            statusChip(client.status)
          ]),
          "Клиентов пока нет"
        )}
      </section>
    `;
  }

  function renderServicesModule(data) {
    const services = data.services || [];
    const tariffs = data.tariffs || [];
    const accruals = data.accruals || [];
    return `
      <div class="module-layout">
        <section class="panel">
          <p class="section-note">Справочник услуг и базовые ставки.</p>
          ${createTable(
            ["Услуга", "Единица", "Ставка", "Статус"],
            services.map((service) => [
              `<strong>${escapeHtml(service.name)}</strong>`,
              escapeHtml(service.unit),
              fmtMoney(service.defaultRate),
              service.active ? statusChip("ACTIVE") : statusChip("BLOCKED")
            ]),
            "Услуги пока не заведены"
          )}
        </section>
        <section class="panel">
          <p class="section-note">Клиентские тарифы и последние начисления.</p>
          <div class="record-grid">
            ${tariffs.slice(0, 6).map((tariff) => `
              <article class="record-card">
                <strong>${escapeHtml(tariff.clientName)}</strong>
                <span>${escapeHtml(tariff.serviceName)}</span>
                <b>${fmtMoney(tariff.rate)}</b>
              </article>
            `).join("") || '<p class="empty-state">Тарифов пока нет</p>'}
          </div>
          <p class="section-note">${accruals.length} начислений в текущей выборке.</p>
        </section>
      </div>
    `;
  }

  function renderBillingModule(data) {
    const documents = data.documents || [];
    const accruals = data.accruals || [];
    state.documents = documents;
    return `
      ${metricStrip([
        ["Документов", documents.length],
        ["Открыто", documents.filter((row) => row.status === "OPEN").length],
        ["Оплачено", documents.filter((row) => row.status === "PAID").length],
        ["Сумма", fmtMoney(documents.reduce((sum, row) => sum + Number(row.amount || 0), 0))]
      ])}
      <div class="module-layout">
        <section class="panel">
          ${createTable(
            ["Номер", "Клиент", "Тип", "Сумма", "Дата", "Срок", "Статус"],
            documents.map((document) => [
              `<strong>${escapeHtml(document.number)}</strong><span>${escapeHtml(document.source)}</span>`,
              escapeHtml(document.clientName),
              escapeHtml(document.type),
              fmtMoney(document.amount),
              fmtDate(document.date, { dateOnly: true }),
              document.dueDate ? fmtDate(document.dueDate, { dateOnly: true }) : "",
              statusChip(document.status)
            ]),
            "Документов пока нет"
          )}
        </section>
        <section class="panel">
          <p class="section-note">Последние начисления услуг.</p>
          <div class="compact-list">
            ${accruals.slice(0, 6).map((accrual) => `
              <article class="list-item">
                <div>
                  <strong>${escapeHtml(accrual.serviceName)}</strong>
                  <span>${escapeHtml(accrual.clientName)} · ${accrual.quantity} × ${fmtMoney(accrual.rate)}</span>
                </div>
                <b>${fmtMoney(accrual.amount)}</b>
              </article>
            `).join("") || '<p class="empty-state">Начислений пока нет</p>'}
          </div>
        </section>
      </div>
    `;
  }

  function renderReportsModule(data) {
    const overview = data.overview || {};
    return `
      ${metricStrip([
        ["Точность", overview.stockAccuracy || "0%"],
        ["Приемок", overview.receiptsToday || 0],
        ["Карантин", overview.openQuarantine || 0],
        ["Клиентов", overview.activeClients || 0]
      ])}
      <section class="panel">
        <div class="record-grid">
          <article class="record-card"><strong>Открытый биллинг</strong><span>${overview.billingOpen || 0} документов</span></article>
          ${(overview.topServices || []).map((service) => `
            <article class="record-card">
              <strong>${escapeHtml(service.name)}</strong>
              <span>${escapeHtml(service.unit)}</span>
              <b>${fmtMoney(service.defaultRate)}</b>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderUsersModule(data) {
    const users = data.users || [];
    const roles = data.roles || [];
    const audit = data.audit || [];
    return `
      <div class="module-layout">
        <section class="panel">
          ${createTable(
            ["Пользователь", "Логин", "Роль", "Клиент", "Статус"],
            users.map((user) => [
              `<strong>${escapeHtml(user.displayName)}</strong>`,
              escapeHtml(user.login),
              escapeHtml(moduleRoleTitle(roles, user.role)),
              escapeHtml(user.clientId || "LOGOff"),
              statusChip(user.status)
            ]),
            "Пользователей пока нет"
          )}
        </section>
        <section class="panel">
          <p class="section-note">Последние действия.</p>
          <div class="compact-list">
            ${audit.slice(0, 8).map((event) => `
              <article class="list-item">
                <div>
                  <strong>${escapeHtml(event.action)}</strong>
                  <span>${fmtDate(event.at)} · ${escapeHtml(event.actor)}</span>
                </div>
              </article>
            `).join("") || '<p class="empty-state">Аудит недоступен</p>'}
          </div>
        </section>
      </div>
    `;
  }

  function moduleRoleTitle(roles, key) {
    return roles.find((role) => role.key === key)?.title || key;
  }

  function renderUiSettingsModule(data) {
    const settings = data.settings || {};
    const visible = new Set(settings.visibleModules || state.user.visibleModules);
    return `
      <section class="panel">
        <p class="section-note">Выберите окна, которые должны оставаться в левом меню для текущего пользователя.</p>
        <div id="inline-settings" class="settings-list">
          ${moduleOrder.map((id) => {
            const [title] = moduleMeta[id];
            const checked = visible.has(id) ? "checked" : "";
            return `<label><input type="checkbox" value="${id}" ${checked}> <span>${escapeHtml(title)}</span></label>`;
          }).join("")}
        </div>
      </section>
    `;
  }

  function renderIntegrationsModule(data) {
    const clients = data.clients || [];
    const selectedClientId = clients.find((client) => client.name.includes("Лукин"))?.id || state.user.clientId || clients[0]?.id || "";
    const sample = "sku;name;qty;barcode\nALF-SER-30;Сыворотка 30 мл;12;4607000000011\nALF-PTH-01;Патчи гидрогелевые;36;";
    return `
      <div class="module-layout">
        <section class="panel">
          <div class="import-preview">
            <label>
              <span>Клиент для остатков</span>
              <select id="import-client">
                ${clients.map((client) => `
                  <option value="${escapeHtml(client.id)}" ${client.id === selectedClientId ? "selected" : ""}>
                    ${escapeHtml(client.name)}
                  </option>
                `).join("")}
              </select>
            </label>
            <label>
              <span>XLSX остатков 1С</span>
              <input id="stock-xlsx-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
            </label>
            <div class="import-actions">
              <button type="button" data-action="preview-import">
                <i data-lucide="scan-search"></i><span>Проверить</span>
              </button>
              <button class="primary-action" type="button" data-action="apply-stock-import">
                <i data-lucide="upload"></i><span>Загрузить остатки</span>
              </button>
            </div>
            <label>
              <span>Тип данных</span>
              <select id="import-entity">
                <option value="stock">Остатки</option>
                <option value="products">Товары</option>
                <option value="clients">Клиенты</option>
                <option value="supplies">Поставки</option>
                <option value="services">Услуги</option>
                <option value="payments">Платежи</option>
              </select>
            </label>
            <label>
              <span>CSV / TXT</span>
              <textarea id="import-content">${escapeHtml(data.preview?.content || sample)}</textarea>
            </label>
          </div>
        </section>
        <section id="import-result" class="panel">
          <p class="section-note">Результат проверки появится после выбора файла или предпросмотра CSV.</p>
        </section>
      </div>
    `;
  }

  function metricStrip(items) {
    return `
      <section class="metric-strip" aria-label="Показатели модуля">
        ${items.map(([label, value]) => `
          <article class="metric-tile">
            <span class="label">${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </article>
        `).join("")}
      </section>
    `;
  }

  async function refresh(refreshModule = false) {
    state.dashboard = await api("/dashboard");
    state.stock = await api("/stock").catch(() => state.stock);
    state.quarantine = await api("/quarantine").catch(() => state.quarantine);
    state.documents = await api("/billing/documents").catch(() => state.documents);
    if (refreshModule) {
      delete state.moduleData[state.activeModule];
    } else {
      state.moduleData = {};
    }
    renderAll();
  }

  function openDialog(title, body) {
    $("#dialog-title").textContent = title;
    $("#dialog-body").innerHTML = body;
    $("#action-dialog").showModal();
    activateIcons();
  }

  async function handleQuickAction(action) {
    if (action === "refresh-module") {
      await refresh(true);
      toast("Данные обновлены");
      return;
    }

    if (action === "create-receipt") {
      setActiveModule("receipts");
      window.setTimeout(() => $("#receipt-source")?.focus(), 220);
      return;
    }

    if (action === "create-supply") {
      setActiveModule("fulfillment");
      window.setTimeout(() => $("#fulfillment-product")?.focus(), 220);
      return;
    }

    if (action === "create-inventory") {
      await api("/inventory-counts", {
        method: "POST",
        body: JSON.stringify({ type: "Циклическая", zone: "B-03" })
      });
      toast("Инвентаризация создана");
      await refresh(true);
      return;
    }

    if (action === "create-billing") {
      await createDemoBilling();
      return;
    }

    if (action === "export-stock") {
      const exported = await api("/integrations/1c/export?entity=stock");
      openDialog("Экспорт остатков", `
        <div class="export-box">
          <strong>${escapeHtml(exported.fileName)}</strong>
          <textarea readonly rows="10">${escapeHtml(exported.content)}</textarea>
        </div>
      `);
      return;
    }

    if (action === "save-inline-ui") {
      await saveInlineUiSettings();
      return;
    }

    if (action === "preview-import") {
      await previewImport();
      return;
    }

    if (action === "apply-stock-import") {
      await applyStockImport();
    }
  }

  async function createReceiptFromDraft() {
    const lines = state.receiptDraft.lines
      .map((line) => ({
        sku: String(line.sku || "").trim(),
        name: String(line.name || "").trim(),
        expected: Number(line.expected || 0),
        accepted: Number(line.accepted || 0),
        barcode: String(line.barcode || "").trim() || null
      }))
      .filter((line) => line.sku || line.name || line.barcode || line.expected > 0 || line.accepted > 0);

    if (!state.receiptDraft.clientId) {
      throw new Error("Выберите клиента");
    }
    if (!state.receiptDraft.sourceDocument.trim()) {
      throw new Error("Укажите документ");
    }
    if (!lines.length) {
      throw new Error("Добавьте строку приемки");
    }

    await api("/receipts", {
      method: "POST",
      body: JSON.stringify({
        clientId: state.receiptDraft.clientId,
        sourceDocument: state.receiptDraft.sourceDocument,
        lines
      })
    });
    resetReceiptDraft();
    toast("Приемка проведена");
    await refresh(true);
  }

  async function createFulfillmentSupply() {
    const draft = state.fulfillmentDraft;
    const quantity = Number(draft.quantity || 0);
    if (!draft.clientId) {
      throw new Error("Выберите клиента");
    }
    if (!draft.productId) {
      throw new Error("Выберите товар из доступного остатка");
    }
    if (!draft.marketplace) {
      throw new Error("Выберите маркетплейс");
    }
    if (quantity <= 0) {
      throw new Error("Количество должно быть больше нуля");
    }

    await api("/marketplace-supplies", {
      method: "POST",
      body: JSON.stringify({
        clientId: draft.clientId,
        marketplace: draft.marketplace,
        lines: [{ productId: draft.productId, quantity }]
      })
    });
    state.fulfillmentDraft.quantity = 1;
    toast("Заявка поставлена в сборку");
    await refresh(true);
  }

  function resetReceiptDraft() {
    state.receiptDraft = {
      clientId: state.receiptDraft.clientId,
      sourceDocument: `УПД ${new Date().toLocaleDateString("ru-RU")}`,
      lines: [newReceiptLine()]
    };
  }

  function updateReceiptDraft(control) {
    const receiptField = control.dataset.receiptField;
    if (receiptField) {
      state.receiptDraft[receiptField] = control.value;
      return;
    }

    const lineField = control.dataset.lineField;
    if (!lineField) return;
    const index = Number(control.closest("[data-receipt-line]")?.dataset.receiptLine);
    const line = state.receiptDraft.lines[index];
    if (!line) return;
    line[lineField] = lineField === "expected" || lineField === "accepted"
      ? Number(control.value || 0)
      : control.value;
  }

  function updateFulfillmentDraft(control) {
    const field = control.dataset.fulfillmentField;
    if (!field) return;
    state.fulfillmentDraft[field] = field === "quantity" ? Number(control.value || 0) : control.value;
    if (field === "clientId") {
      state.fulfillmentDraft.productId = "";
      state.fulfillmentDraft.quantity = 1;
    }
  }

  function applyProductSuggestion(index, value) {
    const line = state.receiptDraft.lines[index];
    if (!line) return;
    const token = String(value || "").trim().toLowerCase();
    if (!token) return;
    const product = (state.moduleData.receipts?.products || []).find((item) =>
      item.clientId === state.receiptDraft.clientId &&
      (item.sku.toLowerCase() === token || String(item.barcode || "").toLowerCase() === token)
    );
    if (!product) return;
    state.receiptDraft.lines[index] = {
      ...line,
      sku: product.sku,
      name: product.name,
      barcode: product.barcode || line.barcode
    };
  }

  function fillReceiptLineFromStock() {
    const stock = state.stock.find((item) => item.clientId === state.receiptDraft.clientId && item.available > 0);
    if (!stock) {
      toast("Нет доступного остатка выбранного клиента");
      return;
    }
    const quantity = Math.min(stock.available, 12);
    const line = {
      sku: stock.sku,
      name: stock.productName,
      barcode: stock.barcode || "",
      expected: quantity,
      accepted: quantity
    };
    const emptyIndex = state.receiptDraft.lines.findIndex((item) =>
      !String(item.sku || "").trim() && !String(item.name || "").trim() && !String(item.barcode || "").trim()
    );
    if (emptyIndex >= 0) {
      state.receiptDraft.lines[emptyIndex] = line;
    } else {
      state.receiptDraft.lines.push(line);
    }
  }

  async function createDemoSupply() {
    const stock = state.stock.find((item) => item.available > 0);
    if (!stock) {
      toast("Нет доступного остатка для заявки");
      return;
    }
    await api("/marketplace-supplies", {
      method: "POST",
      body: JSON.stringify({
        clientId: stock.clientId,
        marketplace: "Wildberries",
        lines: [{ productId: stock.productId, quantity: 3 }]
      })
    });
    $("#action-dialog").close();
    toast("Заявка на сборку создана");
    await refresh(true);
  }

  async function createDemoBilling() {
    const data = state.moduleData.billing || await loadModuleData("billing");
    const client = data.clients?.[0];
    if (!client) {
      toast("Нет клиента для счета");
      return;
    }
    await api("/billing/documents", {
      method: "POST",
      body: JSON.stringify({
        clientId: client.id,
        type: "INVOICE",
        source: `Демо начисления ${new Date().toLocaleDateString("ru-RU")}`,
        amount: 1500
      })
    });
    toast("Счет создан");
    await refresh(true);
  }

  async function releaseQuarantine(id) {
    const item = state.quarantine.find((row) => row.id === id) || (state.moduleData.quarantine?.quarantine || []).find((row) => row.id === id);
    if (!item) {
      toast("Позиция карантина не найдена");
      return;
    }
    await api(`/quarantine/${id}/release`, {
      method: "POST",
      body: JSON.stringify({
        productId: null,
        sku: item.sku || `Q-${Date.now()}`,
        name: item.productName,
        printInternalBarcode: true
      })
    });
    toast("Товар выпущен из карантина, внутренний ШК сформирован");
    await refresh(true);
  }

  async function updateTaskStatus(id, status) {
    await api(`/tasks/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    toast("Статус задания обновлен");
    await refresh(true);
  }

  async function saveInlineUiSettings() {
    const checked = $$("#inline-settings input[type='checkbox']:checked").map((input) => input.value);
    const visibleModules = checked.includes("dashboard") ? checked : ["dashboard", ...checked];
    const settings = await api("/ui-settings", {
      method: "PUT",
      body: JSON.stringify({
        startModule: visibleModules[0] || "dashboard",
        visibleModules,
        denseMode: true
      })
    });
    state.user.visibleModules = settings.visibleModules;
    state.moduleData["ui-settings"] = { settings };
    toast("Настройки интерфейса сохранены");
    if (!canOpenModule(state.activeModule)) {
      state.activeModule = settings.startModule || settings.visibleModules[0] || "dashboard";
    }
    await refresh(true);
  }

  async function previewImport() {
    const file = $("#stock-xlsx-file")?.files?.[0];
    if (file) {
      const preview = await sendStockImport(file, false);
      renderStockImportResult(preview);
      return;
    }

    const entity = $("#import-entity")?.value || "stock";
    const content = $("#import-content")?.value || "";
    const preview = await api("/integrations/1c/import/preview", {
      method: "POST",
      body: JSON.stringify({ format: "csv", entity, content })
    });
    $("#import-result").innerHTML = `
      <p class="section-note">Найдено строк: ${preview.rowsDetected}. Валидных: ${preview.validRows}.</p>
      ${preview.errors?.length ? `<p class="section-note">${preview.errors.map(escapeHtml).join("<br>")}</p>` : ""}
      ${createTable(
        Object.keys(preview.sample?.[0] || {}),
        (preview.sample || []).map((row) => Object.values(row).map(escapeHtml)),
        "Пример строк пуст"
      )}
    `;
  }

  async function applyStockImport() {
    const file = $("#stock-xlsx-file")?.files?.[0];
    if (!file) {
      throw new Error("Выберите XLSX-файл остатков 1С");
    }
    const result = await sendStockImport(file, true);
    renderStockImportResult(result);
    toast(`Остатки загружены: ${result.totalQuantity} шт`);
    await refresh(true);
  }

  async function sendStockImport(file, applyImport) {
    const clientId = $("#import-client")?.value || state.user.clientId || "";
    if (!clientId) {
      throw new Error("Выберите клиента для загрузки остатков");
    }
    const form = new FormData();
    form.append("clientId", clientId);
    form.append("apply", String(applyImport));
    form.append("file", file);
    return api("/integrations/1c/import/stock-xlsx", {
      method: "POST",
      body: form
    });
  }

  function renderStockImportResult(result) {
    $("#import-result").innerHTML = `
      ${metricStrip([
        ["Строк в файле", result.rowsDetected],
        ["Валидных", result.validRows],
        ["Товаров", result.productsDetected],
        ["Коробов", result.boxesDetected],
        ["Остаток", `${result.totalQuantity} шт`],
        ["Статус", result.applied ? "Загружено" : "Проверено"]
      ])}
      <p class="section-note">
        ${escapeHtml(result.fileName)} · клиент ${escapeHtml(result.clientName)} · строк остатков после группировки: ${escapeHtml(result.stockRows)}
      </p>
      ${result.errors?.length ? `
        <div class="import-errors">
          ${result.errors.map((error) => `<span>${escapeHtml(error)}</span>`).join("")}
        </div>
      ` : ""}
      ${createTable(
        Object.keys(result.sample?.[0] || {}),
        (result.sample || []).map((row) => Object.values(row).map(escapeHtml)),
        "Пример строк пуст"
      )}
    `;
    activateIcons();
  }

  function bindEvents() {
    $("[data-auth-tab='login']").addEventListener("click", () => switchAuthTab("login"));
    $("[data-auth-tab='register']").addEventListener("click", () => switchAuthTab("register"));

    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      try {
        const response = await api("/auth/login", {
          method: "POST",
          body: JSON.stringify({
            login: form.get("login"),
            password: form.get("password")
          })
        });
        state.token = response.token;
        localStorage.setItem("wms-token", state.token);
        await loadApp();
      } catch (error) {
        toast(error.message);
      }
    });

    $("#register-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
      try {
        const response = await api("/auth/register", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        toast(response.message);
        event.currentTarget.reset();
        switchAuthTab("login");
      } catch (error) {
        toast(error.message);
      }
    });

    $("#logout-button").addEventListener("click", () => {
      localStorage.removeItem("wms-token");
      state.token = null;
      state.user = null;
      state.moduleData = {};
      showAuth();
    });

    $("#mobile-menu").addEventListener("click", () => {
      $(".sidebar").classList.toggle("is-open");
    });

    $("#print-labels").addEventListener("click", () => {
      toast("Печать этикеток будет доступна из карточек товара и карантина");
    });

    $("#global-search").addEventListener("input", (event) => {
      state.query = event.currentTarget.value.trim().toLowerCase();
      renderDashboardPanels();
      if (state.activeModule !== "dashboard") {
        renderCurrentModule();
      }
      activateIcons();
    });

    $$("[data-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.taskFilter = button.dataset.filter;
        $$("[data-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
        renderTasks();
        if (state.activeModule === "picking") {
          renderCurrentModule();
        }
      });
    });

    document.body.addEventListener("input", (event) => {
      const control = event.target.closest("[data-receipt-field], [data-line-field]");
      if (control) {
        updateReceiptDraft(control);
      }
      const fulfillmentControl = event.target.closest("[data-fulfillment-field]");
      if (fulfillmentControl) {
        updateFulfillmentDraft(fulfillmentControl);
      }
    });

    document.body.addEventListener("change", (event) => {
      const control = event.target.closest("[data-receipt-field], [data-line-field]");
      if (control) {
        updateReceiptDraft(control);
      }

      const lineField = control?.dataset.lineField;
      if (lineField === "sku" || lineField === "barcode") {
        const index = Number(control.closest("[data-receipt-line]")?.dataset.receiptLine);
        applyProductSuggestion(index, control.value);
      }

      if (control?.dataset.receiptField === "clientId") {
        state.receiptDraft.lines = [newReceiptLine()];
      }

      if (control && state.activeModule === "receipts") {
        renderCurrentModule();
        activateIcons();
      }

      const fulfillmentControl = event.target.closest("[data-fulfillment-field]");
      if (fulfillmentControl) {
        updateFulfillmentDraft(fulfillmentControl);
        if (state.activeModule === "fulfillment") {
          renderCurrentModule();
          activateIcons();
        }
      }
    });

    document.body.addEventListener("submit", async (event) => {
      if (event.target.id === "receipt-form") {
        event.preventDefault();
        try {
          await createReceiptFromDraft();
        } catch (error) {
          toast(error.message);
        }
        return;
      }

      if (event.target.id === "fulfillment-form") {
        event.preventDefault();
        try {
          await createFulfillmentSupply();
        } catch (error) {
          toast(error.message);
        }
      }
    });

    document.body.addEventListener("click", async (event) => {
      const moduleTarget = event.target.closest("[data-module]")?.dataset.module;
      const action = event.target.closest("[data-action]")?.dataset.action;
      const releaseId = event.target.closest("[data-release]")?.dataset.release;
      const taskStatusButton = event.target.closest("[data-task-status]");
      const addReceiptLine = event.target.closest("[data-add-receipt-line]");
      const removeReceiptLine = event.target.closest("[data-remove-receipt-line]");
      const fillReceiptFromStock = event.target.closest("[data-fill-receipt-from-stock]");

      if (moduleTarget) {
        event.preventDefault();
        setActiveModule(moduleTarget);
        return;
      }

      try {
        if (action) {
          await handleQuickAction(action);
        }
        if (releaseId) {
          await releaseQuarantine(releaseId);
        }
        if (taskStatusButton) {
          await updateTaskStatus(taskStatusButton.dataset.taskStatus, taskStatusButton.dataset.nextStatus);
        }
        if (addReceiptLine) {
          state.receiptDraft.lines.push(newReceiptLine());
          renderCurrentModule();
          activateIcons();
        }
        if (removeReceiptLine) {
          const index = Number(removeReceiptLine.dataset.removeReceiptLine);
          if (state.receiptDraft.lines.length === 1) {
            state.receiptDraft.lines = [newReceiptLine()];
          } else {
            state.receiptDraft.lines.splice(index, 1);
          }
          renderCurrentModule();
          activateIcons();
        }
        if (fillReceiptFromStock) {
          fillReceiptLineFromStock();
          renderCurrentModule();
          activateIcons();
        }
        if (event.target.closest("[data-confirm-supply]")) {
          await createDemoSupply();
        }
      } catch (error) {
        toast(error.message);
      }
    });

    document.body.addEventListener("keydown", (event) => {
      const card = event.target.closest(".module-card");
      if (!card || !["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      setActiveModule(card.dataset.module);
    });

    $("#open-ui-settings").addEventListener("click", () => setActiveModule("ui-settings"));

    window.addEventListener("hashchange", () => {
      if (!state.user) return;
      const requested = decodeURIComponent(window.location.hash.replace("#", ""));
      if (requested && requested !== state.activeModule) {
        setActiveModule(requested, { push: false });
      }
    });
  }

  function switchAuthTab(tab) {
    $$("[data-auth-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.authTab === tab));
    $("#login-form").classList.toggle("is-hidden", tab !== "login");
    $("#register-form").classList.toggle("is-hidden", tab !== "register");
  }

  async function init() {
    bindEvents();
    activateIcons();
    if (state.token) {
      try {
        await loadApp();
      } catch (error) {
        localStorage.removeItem("wms-token");
        state.token = null;
        showAuth();
      }
    }
    if ("serviceWorker" in navigator) {
      let refreshing = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
      navigator.serviceWorker.register("./service-worker.js")
        .then((registration) => registration.update())
        .catch(() => {});
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("load", activateIcons);
})();
