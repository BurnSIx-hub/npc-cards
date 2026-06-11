/**
 * NPC Cards — Foundry VTT Module
 * Коллекционные карточки NPC для игроков
 */

const MODULE_ID = "npc-cards";
const SOCKET_EVENT = `module.${MODULE_ID}`;

const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

// ── Card templates ────────────────────────────────────────────────────────────

// Локализация: строки в lang/ru.json и lang/en.json (ключи NPCCARDS.*)
const L  = (k)    => game.i18n.localize(`NPCCARDS.${k}`);
const LF = (k, d) => game.i18n.format(`NPCCARDS.${k}`, d);

// label встроенных шаблонов локализуется в getTemplates() (при загрузке модуля i18n ещё не готов)
const DEFAULT_TEMPLATES = {
  arcane:    { id: "arcane",    file: "assets/cards/card-arcane.png",    builtin: true },
  adventure: { id: "adventure", file: "assets/cards/card-adventure.png", builtin: true },
  silver:    { id: "silver",    file: "assets/cards/card-silver.png",    builtin: true },
  divine:    { id: "divine",    file: "assets/cards/card-divine.png",    builtin: true },
  map:       { id: "map",       file: "assets/cards/card-map.png",       builtin: true },
};

function getCustomTemplates() {
  try { return JSON.parse(getSetting("customTemplates") || "[]"); }
  catch { return []; }
}

async function saveCustomTemplates(templates) {
  await setSetting("customTemplates", JSON.stringify(templates));
}

function getTemplates() {
  const result = {};
  for (const t of Object.values(DEFAULT_TEMPLATES)) result[t.id] = { ...t, label: L(`Templates.${t.id}`) };
  for (const t of getCustomTemplates()) result[t.id] = t;
  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function modPath(file) {
  return `modules/${MODULE_ID}/${file}`;
}

/**
 * Источник картинки шаблона.
 * - dataUrl — старые кастомные шаблоны, сохранённые как base64 (обратная совместимость)
 * - builtin — файлы внутри модуля
 * - иначе — путь, загруженный через FilePicker.upload (worlds/<мир>/npc-cards/...)
 */
function tmplSrc(t) {
  if (t.dataUrl) return t.dataUrl;
  if (t.builtin) return modPath(t.file);
  return t.file;
}

function getFilePicker() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
}

/**
 * Загружает картинку в папку мира и возвращает путь.
 * Хранить картинки как base64 в настройках мира нельзя — они реплицируются
 * на всех клиентов при каждом изменении и раздувают БД мира.
 */
async function uploadImage(file) {
  const dir = `worlds/${game.world.id}/npc-cards`;
  const fp = getFilePicker();
  try { await fp.createDirectory("data", dir); }
  catch (e) { /* EEXIST — папка уже есть */ }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const renamed = new File([file], `${Date.now()}-${safeName}`, { type: file.type });
  const res = await fp.upload("data", dir, renamed, {}, { notify: false });
  if (!res?.path) throw new Error("сервер не вернул путь к файлу");
  return res.path;
}

function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}

/** All cards database (stored as world setting, GM only writes) */
function getAllCards() {
  try { return JSON.parse(getSetting("allCards") || "[]"); }
  catch { return []; }
}

/** Cards owned by a specific user */
function getPlayerCards(userId) {
  try {
    const raw = getSetting("playerCards") || "{}";
    const data = JSON.parse(raw);
    return data[userId] || [];
  } catch { return []; }
}

async function saveAllCards(cards) {
  await setSetting("allCards", JSON.stringify(cards));
}

async function giveCardToPlayer(cardId, userId) {
  const raw = getSetting("playerCards") || "{}";
  const data = JSON.parse(raw);
  if (!data[userId]) data[userId] = [];
  if (!data[userId].includes(cardId)) {
    data[userId].push(cardId);
    await setSetting("playerCards", JSON.stringify(data));
  }
}

async function giveCardToAll(cardId) {
  const raw = getSetting("playerCards") || "{}";
  const data = JSON.parse(raw);
  for (const u of game.users) {
    if (u.isGM) continue;
    if (!data[u.id]) data[u.id] = [];
    if (!data[u.id].includes(cardId)) data[u.id].push(cardId);
  }
  await setSetting("playerCards", JSON.stringify(data));
}

// ── Card HTML builder ─────────────────────────────────────────────────────────

function buildCardHTML(card, { showDelete = false, showEdit = false } = {}) {
  const templates = getTemplates();
  const tmpl = templates[card.template] || templates.arcane || Object.values(templates)[0];
  const frameSrc = tmplSrc(tmpl);

  const textStyle = (card.textOffsetX || card.textOffsetY)
    ? 'style="left:calc(var(--npc-text-left,10%) + ' + (card.textOffsetX||0) + 'px);top:calc(var(--npc-text-top,77%) + ' + (card.textOffsetY||0) + 'px);"'
    : "";

  const imgStyle = (card.imgOffsetX || card.imgOffsetY || card.imgScale)
    ? 'style="left:' + (card.imgOffsetX||0) + 'px;top:' + (card.imgOffsetY||0) + 'px;width:' + (card.imgScale||100) + '%;height:auto;min-height:100%;"'
    : "";

  const artInner = card.image
    ? '<img src="' + esc(card.image) + '" alt="' + esc(card.name) + '" loading="lazy" ' + imgStyle + '>'
    : "";

  const nameSizeStyle = card.nameFontSize ? ' style="font-size:' + card.nameFontSize + 'px;"' : "";
  const descSizeStyle = card.descFontSize ? ' style="font-size:' + card.descFontSize + 'px;"' : "";

  const descHTML = card.desc
    ? '<div class="npc-card-desc"' + descSizeStyle + '>' + esc(card.desc) + '</div>'
    : "";

  const deleteBtn = showDelete
    ? '<button class="npc-card-delete" title="' + L("Delete") + '">✕</button>'
    : "";

  const editBtn = showEdit
    ? '<button class="npc-card-edit" data-card-id="' + esc(card.id) + '" title="' + L("Edit") + '">✎</button>'
    : "";

  return '<div class="npc-card" data-card-id="' + esc(card.id) + '" data-template="' + esc(card.template) + '">'
    + '<img class="npc-card-frame" src="' + frameSrc + '" alt="">'
    + '<div class="npc-card-art">' + artInner + '</div>'
    + '<div class="npc-card-text" ' + textStyle + '>'
    + '<div class="npc-card-name"' + nameSizeStyle + '>' + esc(card.name) + '</div>'
    + descHTML
    + '</div>'
    + '<div class="npc-card-shine"></div>'
    + editBtn
    + deleteBtn
    + '</div>';
}

// ── Reveal Animation ──────────────────────────────────────────────────────────

function showCardReveal(card) {
  document.getElementById("npc-card-reveal-overlay")?.remove();

  // Hide the collection window behind reveal
  const appEl = [...document.querySelectorAll(".application, .app")]
    .find(el => el.id?.includes("npc-cards"));
  if (appEl) appEl.style.visibility = "hidden";

  const overlay = document.createElement("div");
  overlay.id = "npc-card-reveal-overlay";
  overlay.innerHTML = `
    <div class="npc-reveal-backdrop"></div>
    <div class="npc-reveal-rays"></div>
    <div class="npc-reveal-particles" id="npc-particles"></div>
    <div class="npc-reveal-card-wrap" id="npc-reveal-card">
      ${buildCardHTML(card)}
    </div>
    <div class="npc-reveal-hint">${L("RevealHint")}</div>
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add("active");
    overlay.querySelector(".npc-reveal-backdrop").style.opacity = "1";
    overlay.querySelector(".npc-reveal-rays").style.opacity = "1";
    spawnParticles(overlay.querySelector("#npc-particles"));
    setTimeout(() => {
      overlay.querySelector("#npc-reveal-card").classList.add("shown");
    }, 300);
  });

  // Alt + wheel zoom
  let _scale = 1;
  overlay.addEventListener("wheel", (e) => {
    if (!e.altKey) return;
    e.preventDefault();
    _scale = Math.min(2.5, Math.max(0.5, _scale - e.deltaY * 0.001));
    const wrap = overlay.querySelector("#npc-reveal-card");
    wrap.style.transform = `scale(${_scale}) rotateY(0deg)`;
  }, { passive: false });

  const closeReveal = () => {
    overlay.style.transition = "opacity 0.4s";
    overlay.style.opacity = "0";
    setTimeout(() => {
      overlay.remove();
      // Restore app window
      if (appEl) appEl.style.visibility = "";
    }, 400);
  };

  overlay.addEventListener("click", (e) => {
    if (e.target.closest(".npc-reveal-card-wrap")) return;
    closeReveal();
  });
}

function spawnParticles(container) {
  const colors = ["#c9a84c", "#f0d080", "#ffffff", "#a0c0ff", "#ffd0ff"];
  for (let i = 0; i < 40; i++) {
    setTimeout(() => {
      const p = document.createElement("div");
      p.className = "npc-particle";
      const angle = Math.random() * 360;
      const dist = 100 + Math.random() * 300;
      const px = Math.cos(angle * Math.PI / 180) * dist;
      const py = Math.sin(angle * Math.PI / 180) * dist;
      p.style.cssText = `
        left: ${45 + Math.random() * 10}%;
        top: ${45 + Math.random() * 10}%;
        --px: ${px}px;
        --py: ${py}px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        width: ${2 + Math.random() * 6}px;
        height: ${2 + Math.random() * 6}px;
        animation-delay: ${Math.random() * 0.5}s;
        animation-duration: ${0.8 + Math.random() * 1.2}s;
      `;
      container.appendChild(p);
    }, i * 20);
  }
}

// ── Collection Window ─────────────────────────────────────────────────────────

class NPCCardsApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "npc-cards-app",
    window: { title: "NPCCARDS.Title", resizable: true },
    position: { width: 740, height: 580 },
    classes: ["npc-cards"],
  };

  _activeTab = "my";
  _selectedCardId = null;
  _editingCardId = null;

  async _renderHTML() {
    const div = document.createElement("div");
    div.innerHTML = await this._buildHTML();
    return div;
  }

  _replaceHTML(result, content) {
    content.innerHTML = "";
    content.appendChild(result);
    this._activateListeners(content);
  }

  async _buildHTML() {
    const isGM = game.user.isGM;
    const allCards = getAllCards();
    const myCardIds = getPlayerCards(game.user.id);
    const myCards = allCards.filter(c => myCardIds.includes(c.id));

    const myActive = this._activeTab === "my" ? " active" : "";
    const allActive = this._activeTab === "all" ? " active" : "";
    const gmActive = this._activeTab === "gm" ? " active" : "";

    let tabs = '<div class="npc-cards-tabs">';
    tabs += '<button class="npc-tab-btn' + myActive + '" data-tab="my">' + game.i18n.localize("NPCCARDS.MyCollection") + ' (' + myCards.length + ')</button>';
    tabs += '<button class="npc-tab-btn' + allActive + '" data-tab="all">' + game.i18n.localize("NPCCARDS.AllCards") + ' (' + allCards.length + ')</button>';
    if (isGM) tabs += '<button class="npc-tab-btn' + gmActive + '" data-tab="gm">✦ ' + game.i18n.localize("NPCCARDS.GMPanel") + '</button>';
    tabs += '</div>';

    const searchBar = '<div class="npc-search-wrap">'
      + '<input type="text" id="npc-search" class="npc-search-input" placeholder="' + L("SearchPlaceholder") + '">'
      + '</div>';

    let content = "";
    if (this._activeTab === "my") {
      content = searchBar + this._buildGrid(myCards);
    } else if (this._activeTab === "all") {
      content = searchBar + this._buildGrid(allCards);
    } else if (this._activeTab === "gm" && isGM) {
      content = this._buildGMPanel(allCards);
    }

    return '<div class="npc-cards-layout">' + tabs + '<div class="npc-tab-content">' + content + '</div></div>';
  }

  _buildGrid(cards, opts = {}) {
    const { showDelete = false, showEdit = false, selectable = false, selectedId = null } = opts;
    if (!cards.length) {
      return '<div class="npc-cards-grid-wrap"><div class="npc-cards-grid">'
        + '<div class="npc-empty-state">✦ ' + game.i18n.localize("NPCCARDS.NoCards") + ' ✦</div>'
        + '</div></div>';
    }
    const cardsHTML = cards.map(c => {
      const html = buildCardHTML(c, { showDelete, showEdit });
      if (selectable && c.id === selectedId) {
        return html.replace('class="npc-card"', 'class="npc-card selected"');
      }
      return html;
    }).join("");
    const gridClass = selectable ? "npc-cards-grid selectable" : "npc-cards-grid";
    return '<div class="npc-cards-grid-wrap"><div class="' + gridClass + '">' + cardsHTML + '</div></div>';
  }

  _buildGMPanel(allCards) {
    const editCard = this._editingCardId ? allCards.find(c => c.id === this._editingCardId) : null;
    const players = game.users.filter(u => !u.isGM);

    let tmplOptions = "";
    for (const t of Object.values(getTemplates())) {
      const checked = editCard ? (t.id === editCard.template ? "checked" : "") : (t.id === "arcane" ? "checked" : "");
      const src = tmplSrc(t);
      tmplOptions += '<label class="npc-tmpl-opt">';
      tmplOptions += '<input type="radio" name="npc-template" value="' + t.id + '" ' + checked + '>';
      tmplOptions += '<img class="npc-tmpl-thumb" src="' + src + '" title="' + esc(t.label) + '">';
      tmplOptions += '</label>';
    }

    let playerOptions = "";
    for (const u of players) {
      playerOptions += '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>';
    }
    if (!playerOptions) playerOptions = '<option value="">' + L("NoPlayers") + '</option>';

    // Validate previously selected card still exists
    if (this._selectedCardId && !allCards.find(c => c.id === this._selectedCardId)) {
      this._selectedCardId = null;
    }
    const selectedCard = this._selectedCardId
      ? allCards.find(c => c.id === this._selectedCardId)
      : null;

    // Status bar showing currently picked card (or hint)
    const statusBar = selectedCard
      ? '<div class="npc-give-status has-selection">'
        + '<span>' + L("SelectedForGive") + '</span>'
        + '<span class="selected-name">' + esc(selectedCard.name) + '</span>'
        + '<button class="clear-btn" id="npc-clear-selection" title="' + L("ClearSelectionTooltip") + '">' + L("ClearSelection") + '</button>'
        + '</div>'
      : '<div class="npc-give-status">'
        + '<span>' + L("SelectHint") + '</span>'
        + '</div>';

    const giveDisabled = selectedCard ? "" : "disabled";

    const existingCardsHTML = allCards.length
      ? '<div style="margin-top:16px;">'
        + '<div style="font-family:Alegreya,serif;font-size:11px;letter-spacing:1px;color:#c9a84c;margin-bottom:8px;">' + L("BaseLabel") + '</div>'
        + this._buildGrid(allCards, { showDelete: true, showEdit: true, selectable: true, selectedId: this._selectedCardId })
        + '</div>'
      : '<div style="margin-top:16px;text-align:center;color:#a89060;font-style:italic;padding:24px;opacity:0.7;">' + L("BaseEmpty") + '</div>';

    const previewCard = editCard
      ? { ...editCard, id: "preview" }
      : { id: "preview", name: L("DefaultName"), desc: L("DefaultDesc"), template: "arcane", image: "" };
    const previewHTML = buildCardHTML(previewCard);

    return '<div class="npc-gm-scroll">'
      + '<div class="npc-gm-panel">'
      + '<div class="npc-gm-preview" id="npc-preview-wrap">' + previewHTML + '</div>'
      + '<div class="npc-gm-form">'
      + '<div class="npc-form-group"><label>' + L("LabelName") + '</label>'
      + '<input type="text" id="npc-input-name" placeholder="' + L("PlaceholderName") + '" maxlength="40" value="' + esc(editCard?.name || "") + '"></div>'
      + '<div class="npc-form-group"><label>' + L("LabelDesc") + '</label>'
      + '<textarea id="npc-input-desc" placeholder="' + L("PlaceholderDesc") + '" maxlength="120">' + esc(editCard?.desc || "") + '</textarea></div>'
      + '<div class="npc-form-group"><label>' + L("LabelArt") + '</label>'
      + '<div style="display:flex;gap:6px;align-items:center;">'
      + '<input type="text" id="npc-input-image" placeholder="' + L("PlaceholderImage") + '" style="flex:1;" value="' + esc(editCard?.image || "") + '">'
      + '<label class="npc-btn" style="cursor:pointer;margin:0;" title="' + L("UploadTooltip") + '">'
      + '<i class="fas fa-folder-open"></i>'
      + '<input type="file" id="npc-file-upload" accept="image/*" style="display:none;"></label></div>'
      + '<div id="npc-upload-preview" style="display:none;margin-top:6px;font-size:11px;color:#c9a84c;"></div></div>'
      + '<div class="npc-form-group"><label>' + L("LabelTemplate") + '</label>'
      + '<div class="npc-template-select">' + tmplOptions + '</div></div>'
      + '<div class="npc-actions">'
      + (editCard ? '<span class="npc-edit-mode-badge">' + L("EditingBadge") + '</span>' : '')
      + '<button class="npc-btn primary" id="npc-btn-save">' + (editCard ? L("UpdateCard") : L("SaveCardBtn")) + '</button>'
      + (editCard ? '<button class="npc-btn" id="npc-btn-cancel-edit">' + L("CancelBtn") + '</button>' : '')
      + '</div>'
      + '<div class="npc-form-group" style="margin-top:14px;border-top:1px solid #c9a84c33;padding-top:14px;"><label>' + L("LabelGive") + '</label>'
      + statusBar
      + '<div class="npc-player-select" style="margin-top:8px;">'
      + '<select id="npc-select-player">' + playerOptions + '</select>'
      + '<button class="npc-btn primary" id="npc-btn-give-one" ' + giveDisabled + '>' + L("GiveToPlayer") + '</button>'
      + '<button class="npc-btn" id="npc-btn-give-all" ' + giveDisabled + '>' + L("GiveToAll") + '</button>'
      + '<button class="npc-btn" id="npc-btn-show-reveal" ' + giveDisabled + ' title="' + L("ShowAgainTooltip") + '">' + L("ShowAgain") + '</button>'
      + '</div></div>'
      + '</div></div>'
      + this._buildTemplateManager()
      + existingCardsHTML
      + '</div>';
  }

  _activateListeners(el) {
    // Tab switching
    el.querySelectorAll(".npc-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        this._activeTab = btn.dataset.tab;
        this.render();
      });
    });

    // Card click — in GM "give" grid: select; otherwise: show big view
    el.querySelectorAll(".npc-card").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.classList.contains("npc-card-delete")) return;
        const cardId = card.dataset.cardId;
        if (cardId === "preview") return;

        // If this card is inside the GM selectable grid, treat click as a selection
        const inSelectableGrid = card.closest(".npc-cards-grid.selectable");
        if (inSelectableGrid && this._activeTab === "gm" && game.user.isGM) {
          this._selectedCardId = (this._selectedCardId === cardId) ? null : cardId;
          this.render();
          return;
        }

        const found = getAllCards().find(c => c.id === cardId);
        if (found) showCardReveal(found);
      });
    });

    // GM: clear selection button
    el.querySelector("#npc-clear-selection")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._selectedCardId = null;
      this.render();
    });

    // Search
    el.querySelector("#npc-search")?.addEventListener("input", (e) => {
      const q = e.target.value.trim().toLowerCase();
      el.querySelectorAll(".npc-cards-grid .npc-card").forEach(card => {
        const name = card.querySelector(".npc-card-name")?.textContent?.toLowerCase() || "";
        card.style.display = (!q || name.includes(q)) ? "" : "none";
      });
    });

    // GM: edit card
    el.querySelectorAll(".npc-card-edit").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._editingCardId = btn.dataset.cardId;
        this._activeTab = "gm";
        this.render();
      });
    });

    // GM: delete card
    el.querySelectorAll(".npc-card-delete").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const cardEl = btn.closest(".npc-card");
        const cardId = cardEl.dataset.cardId;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: L("DeleteCard") },
          content: "<p>" + game.i18n.localize("NPCCARDS.ConfirmDelete") + "</p>",
        });
        if (!confirmed) return;
        const cards = getAllCards().filter(c => c.id !== cardId);
        await saveAllCards(cards);
        this.render();
      });
    });

    // GM panel listeners
    if (this._activeTab === "gm") {
      this._activateGMListeners(el);
    }
  }

  _activateGMListeners(el) {
    const nameInput  = el.querySelector("#npc-input-name");
    const descInput  = el.querySelector("#npc-input-desc");
    const imgInput   = el.querySelector("#npc-input-image");
    const preview    = el.querySelector("#npc-preview-wrap");

    // Drag state for preview card
    let _textOffsetX = 0, _textOffsetY = 0;
    let _imgOffsetX = 0, _imgOffsetY = 0;
    let _imgScale = 100;
    let _nameFontSize = 14, _descFontSize = 10;

    // If editing, restore card's saved values
    const editingCard = this._editingCardId ? getAllCards().find(c => c.id === this._editingCardId) : null;
    if (editingCard) {
      _textOffsetX  = editingCard.textOffsetX  || 0;
      _textOffsetY  = editingCard.textOffsetY  || 0;
      _imgOffsetX   = editingCard.imgOffsetX   || 0;
      _imgOffsetY   = editingCard.imgOffsetY   || 0;
      _imgScale     = editingCard.imgScale     || 100;
      _nameFontSize = editingCard.nameFontSize || 14;
      _descFontSize = editingCard.descFontSize || 10;
    }

    const updatePreview = () => {
      if (!preview) return;
      const tmpl = el.querySelector("input[name='npc-template']:checked")?.value || "arcane";
      const card = {
        id: "preview",
        name: nameInput?.value || L("DefaultName"),
        desc: descInput?.value || L("DefaultDesc"),
        template: tmpl,
        image: imgInput?.value || "",
        textOffsetX: _textOffsetX,
        textOffsetY: _textOffsetY,
        imgOffsetX: _imgOffsetX,
        imgOffsetY: _imgOffsetY,
        imgScale: _imgScale,
        nameFontSize: _nameFontSize,
        descFontSize: _descFontSize,
      };
      preview.innerHTML = buildCardHTML(card) + '<div class="npc-editor-hint">' + L("EditorHint") + '</div>';
      activateDragging(preview);
    };

    // Zoom buttons — rendered under preview, no keyboard conflicts
    const applyZoom = (step) => {
      _imgScale = Math.min(300, Math.max(20, _imgScale + step));
      const artImg = preview?.querySelector(".npc-card-art img");
      if (artImg) {
        artImg.style.transform = "scale(" + (_imgScale / 100) + ")";
        artImg.style.transformOrigin = "top center";
      }
      const label = document.getElementById("npc-zoom-label");
      if (label) label.textContent = _imgScale + "%";
    };

    // Inject zoom buttons after preview
    if (preview) {
      const zoomBar = document.createElement("div");
      zoomBar.className = "npc-zoom-bar";
      zoomBar.innerHTML = '<button class="npc-zoom-btn" id="npc-zoom-out" title="' + L("ZoomOut") + '">−</button>'
        + '<span class="npc-zoom-label" id="npc-zoom-label">100%</span>'
        + '<button class="npc-zoom-btn" id="npc-zoom-in" title="' + L("ZoomIn") + '">+</button>';
      preview.insertAdjacentElement("afterend", zoomBar);

      zoomBar.querySelector("#npc-zoom-in").addEventListener("click", () => applyZoom(10));
      zoomBar.querySelector("#npc-zoom-out").addEventListener("click", () => applyZoom(-10));

      const fontBar = document.createElement("div");
      fontBar.className = "npc-font-bar";
      fontBar.innerHTML =
        '<span class="npc-font-bar-label">' + L("FontName") + '</span>'
        + '<button class="npc-zoom-btn" id="npc-name-size-out" title="' + L("NameSizeOut") + '">−</button>'
        + '<span class="npc-zoom-label" id="npc-name-size-label">14px</span>'
        + '<button class="npc-zoom-btn" id="npc-name-size-in" title="' + L("NameSizeIn") + '">+</button>'
        + '<span class="npc-font-bar-sep"></span>'
        + '<span class="npc-font-bar-label">' + L("FontDesc") + '</span>'
        + '<button class="npc-zoom-btn" id="npc-desc-size-out" title="' + L("DescSizeOut") + '">−</button>'
        + '<span class="npc-zoom-label" id="npc-desc-size-label">10px</span>'
        + '<button class="npc-zoom-btn" id="npc-desc-size-in" title="' + L("DescSizeIn") + '">+</button>';
      zoomBar.insertAdjacentElement("afterend", fontBar);

      const applyFontSize = (type, step) => {
        if (type === "name") {
          _nameFontSize = Math.min(30, Math.max(8, _nameFontSize + step));
          const nameEl = preview?.querySelector(".npc-card-name");
          if (nameEl) nameEl.style.fontSize = _nameFontSize + "px";
          const lbl = document.getElementById("npc-name-size-label");
          if (lbl) lbl.textContent = _nameFontSize + "px";
        } else {
          _descFontSize = Math.min(18, Math.max(7, _descFontSize + step));
          const descEl = preview?.querySelector(".npc-card-desc");
          if (descEl) descEl.style.fontSize = _descFontSize + "px";
          const lbl = document.getElementById("npc-desc-size-label");
          if (lbl) lbl.textContent = _descFontSize + "px";
        }
      };

      fontBar.querySelector("#npc-name-size-in").addEventListener("click", () => applyFontSize("name", 1));
      fontBar.querySelector("#npc-name-size-out").addEventListener("click", () => applyFontSize("name", -1));
      fontBar.querySelector("#npc-desc-size-in").addEventListener("click", () => applyFontSize("desc", 1));
      fontBar.querySelector("#npc-desc-size-out").addEventListener("click", () => applyFontSize("desc", -1));

      // Sync initial label values (important when editing existing card)
      zoomBar.querySelector("#npc-zoom-label").textContent = _imgScale + "%";
      fontBar.querySelector("#npc-name-size-label").textContent = _nameFontSize + "px";
      fontBar.querySelector("#npc-desc-size-label").textContent = _descFontSize + "px";
    }

    // When editing, trigger initial preview so all offsets/sizes are applied
    if (editingCard) updatePreview();

    // Make text and image draggable inside preview card
    function activateDragging(wrap) {
      const cardEl = wrap.querySelector(".npc-card");
      if (!cardEl) return;

      const textEl = cardEl.querySelector(".npc-card-text");
      const artEl  = cardEl.querySelector(".npc-card-art img");

      if (textEl) {
        textEl.classList.add("draggable");
        makeDraggable(textEl, cardEl, (dx, dy) => {
          _textOffsetX += dx;
          _textOffsetY += dy;
          textEl.style.left = "calc(var(--npc-text-left, 10%) + " + _textOffsetX + "px)";
          textEl.style.top  = "calc(var(--npc-text-top, 77%) + " + _textOffsetY + "px)";
        });
      }

      if (artEl) {
        // Apply current scale via transform
        artEl.style.transform = "scale(" + (_imgScale / 100) + ")";
        artEl.style.transformOrigin = "top center";
        artEl.style.position = "absolute";
        artEl.style.left = _imgOffsetX + "px";
        artEl.style.top = _imgOffsetY + "px";
        artEl.style.cursor = "grab";
        // Reset width to 100% - scale handles sizing
        artEl.style.width = "100%";
        artEl.style.height = "100%";

        makeDraggable(artEl, cardEl, (dx, dy) => {
          _imgOffsetX += dx;
          _imgOffsetY += dy;
          artEl.style.left = _imgOffsetX + "px";
          artEl.style.top  = _imgOffsetY + "px";
        });
      }
    }

    // Слушатели на document живут только на время перетаскивания —
    // иначе каждый ререндер превью добавлял бы новые и они копились бы до перезагрузки
    function makeDraggable(el, container, onMove) {
      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        let startX = e.clientX;
        let startY = e.clientY;
        el.style.cursor = "grabbing";
        const move = (ev) => {
          onMove(ev.clientX - startX, ev.clientY - startY);
          startX = ev.clientX;
          startY = ev.clientY;
        };
        const up = () => {
          el.style.cursor = "grab";
          document.removeEventListener("mousemove", move);
          document.removeEventListener("mouseup", up);
        };
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", up);
      });
    }

    nameInput?.addEventListener("input", updatePreview);
    descInput?.addEventListener("input", updatePreview);
    imgInput?.addEventListener("input", updatePreview);
    el.querySelectorAll("input[name='npc-template']").forEach(r => r.addEventListener("change", updatePreview));

    el.querySelector("#npc-btn-show-reveal")?.addEventListener("click", async () => {
      if (!this._selectedCardId) return;
      const userId = el.querySelector("#npc-select-player")?.value;
      if (!userId) { ui.notifications.warn(L("SelectPlayer")); return; }
      game.socket.emit(SOCKET_EVENT, { type: "showReveal", cardId: this._selectedCardId, userId });
      ui.notifications.info(LF("ShownToPlayer", { name: esc(game.users.get(userId)?.name) }));
    });

    this._activateTemplateListeners(el);

    // File upload handler — файл уходит на сервер в worlds/<мир>/npc-cards,
    // в карточке хранится только путь
    const fileInput = el.querySelector("#npc-file-upload");
    const uploadPreview = el.querySelector("#npc-upload-preview");
    fileInput?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (uploadPreview) {
        uploadPreview.style.display = "block";
        uploadPreview.textContent = L("Uploading");
      }
      try {
        const path = await uploadImage(file);
        if (imgInput) imgInput.value = path;
        if (uploadPreview) uploadPreview.textContent = LF("Uploaded", { name: file.name });
        updatePreview();
      } catch (err) {
        if (uploadPreview) uploadPreview.textContent = L("UploadError");
        ui.notifications.error(LF("UploadFailed", { error: err.message }));
      }
    });

    // Save card
    el.querySelector("#npc-btn-cancel-edit")?.addEventListener("click", () => {
      this._editingCardId = null;
      this.render();
    });

    el.querySelector("#npc-btn-save")?.addEventListener("click", async () => {
      const name = nameInput?.value?.trim();
      if (!name) { ui.notifications.warn(L("EnterName")); return; }
      const tmpl = el.querySelector("input[name='npc-template']:checked")?.value || "arcane";
      const cardData = {
        name,
        desc: descInput?.value?.trim() || "",
        template: tmpl,
        image: imgInput?.value?.trim() || "",
        textOffsetX: _textOffsetX,
        textOffsetY: _textOffsetY,
        imgOffsetX: _imgOffsetX,
        imgOffsetY: _imgOffsetY,
        imgScale: _imgScale,
        nameFontSize: _nameFontSize,
        descFontSize: _descFontSize,
      };
      const cards = getAllCards();
      if (this._editingCardId) {
        const idx = cards.findIndex(c => c.id === this._editingCardId);
        if (idx !== -1) {
          cards[idx] = { ...cards[idx], ...cardData };
          await saveAllCards(cards);
        }
        this._editingCardId = null;
        ui.notifications.info(LF("CardUpdated", { name: esc(name) }));
      } else {
        const cardId = "card_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
        cards.push({ id: cardId, ...cardData, createdAt: Date.now() });
        await saveAllCards(cards);
        this._selectedCardId = cardId;
        ui.notifications.info(LF("CardSaved", { name: esc(name) }));
      }
      this.render();
    });

    // Give to one player
    el.querySelector("#npc-btn-give-one")?.addEventListener("click", async () => {
      await this._giveCard(el, false);
    });

    // Give to all
    el.querySelector("#npc-btn-give-all")?.addEventListener("click", async () => {
      await this._giveCard(el, true);
    });
  }

  _buildTemplateManager() {
    const all = getTemplates();
    let listHTML = '<div class="npc-tmpl-mgr-list">';
    for (const t of Object.values(all)) {
      const src = tmplSrc(t);
      const deleteBtn = t.builtin
        ? ''
        : '<button class="npc-tmpl-delete" data-tmpl-id="' + esc(t.id) + '" title="' + L("DeleteTemplate") + '">✕</button>';
      listHTML += '<div class="npc-tmpl-mgr-item">'
        + '<img src="' + src + '" class="npc-tmpl-mgr-thumb" title="' + esc(t.label) + '">'
        + '<span class="npc-tmpl-mgr-label">' + esc(t.label) + '</span>'
        + (t.builtin ? '<span class="npc-tmpl-builtin-tag">' + L("BuiltinTag") + '</span>' : '')
        + deleteBtn
        + '</div>';
    }
    listHTML += '</div>';

    return '<div class="npc-template-manager">'
      + '<div class="npc-section-label">' + L("SectionTemplates") + '</div>'
      + listHTML
      + '<div class="npc-add-tmpl-row">'
      + '<input type="text" id="npc-tmpl-new-label" placeholder="' + L("PlaceholderTmplName") + '" maxlength="40">'
      + '<label class="npc-btn" style="cursor:pointer;margin:0;" title="' + L("ChoosePng") + '">'
      + '<i class="fas fa-image"></i>'
      + '<input type="file" id="npc-tmpl-new-file" accept="image/*" style="display:none;"></label>'
      + '<span id="npc-tmpl-file-hint">' + L("NoFileChosen") + '</span>'
      + '<button class="npc-btn primary" id="npc-btn-add-template">' + L("AddTemplate") + '</button>'
      + '</div>'
      + '<img id="npc-tmpl-new-preview" style="display:none;max-height:90px;margin-top:8px;border-radius:4px;border:1px solid #c9a84c44;" alt="">'
      + '</div>';
  }

  _activateTemplateListeners(el) {
    let _newTmplPath = null;

    el.querySelector("#npc-tmpl-new-file")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const hint = el.querySelector("#npc-tmpl-file-hint");
      if (hint) hint.textContent = L("Loading");
      try {
        _newTmplPath = await uploadImage(file);
        if (hint) hint.textContent = "✦ " + file.name;
        const preview = el.querySelector("#npc-tmpl-new-preview");
        if (preview) { preview.src = _newTmplPath; preview.style.display = "block"; }
      } catch (err) {
        _newTmplPath = null;
        if (hint) hint.textContent = L("UploadErrShort");
        ui.notifications.error(LF("UploadFailed", { error: err.message }));
      }
    });

    el.querySelector("#npc-btn-add-template")?.addEventListener("click", async () => {
      const label = el.querySelector("#npc-tmpl-new-label")?.value?.trim();
      if (!label) { ui.notifications.warn(L("EnterTmplName")); return; }
      if (!_newTmplPath) { ui.notifications.warn(L("ChooseFile")); return; }
      const id = "tmpl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      const custom = getCustomTemplates();
      custom.push({ id, label, file: _newTmplPath, builtin: false });
      await saveCustomTemplates(custom);
      ui.notifications.info(LF("TemplateAdded", { name: esc(label) }));
      this.render();
    });

    el.querySelectorAll(".npc-tmpl-delete").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const tmplId = btn.dataset.tmplId;
        const confirmed = await foundry.applications.api.DialogV2.confirm({
          window: { title: L("DeleteTemplate") },
          content: "<p>" + L("ConfirmDeleteTemplate") + "</p>",
        });
        if (!confirmed) return;
        const custom = getCustomTemplates().filter(t => t.id !== tmplId);
        await saveCustomTemplates(custom);
        this.render();
      });
    });
  }

  async _giveCard(el, toAll) {
    if (!this._selectedCardId) {
      ui.notifications.warn(L("SelectCardFirst"));
      return;
    }
    const cards = getAllCards();
    const card = cards.find(c => c.id === this._selectedCardId);
    if (!card) {
      ui.notifications.warn(L("CardGone"));
      this._selectedCardId = null;
      this.render();
      return;
    }

    if (toAll) {
      await giveCardToAll(card.id);
      game.socket.emit(SOCKET_EVENT, { type: "receiveCard", cardId: card.id, userId: null });
      ui.notifications.info(LF("GivenToAll", { name: esc(card.name) }));
    } else {
      const userId = el.querySelector("#npc-select-player")?.value;
      if (!userId) { ui.notifications.warn(L("SelectPlayer")); return; }
      await giveCardToPlayer(card.id, userId);
      game.socket.emit(SOCKET_EVENT, { type: "receiveCard", cardId: card.id, userId });
      const userName = game.users.get(userId)?.name;
      ui.notifications.info(LF("GivenToPlayer", { name: esc(card.name), user: esc(userName) }));
    }
  }
}

// ── Socket handler ─────────────────────────────────────────────────────────────

function handleSocket(data) {
  if (data.type === "receiveCard") {
    const isForMe = !data.userId || data.userId === game.user.id;
    if (!isForMe || game.user.isGM) return;
    const card = getAllCards().find(c => c.id === data.cardId);
    if (!card) return;
    setTimeout(() => showCardReveal(card), 500);
  } else if (data.type === "showReveal") {
    const isForMe = !data.userId || data.userId === game.user.id;
    if (!isForMe || game.user.isGM) return;
    const card = getAllCards().find(c => c.id === data.cardId);
    if (!card) return;
    setTimeout(() => showCardReveal(card), 300);
  }
}

// ── Foundry Hooks ─────────────────────────────────────────────────────────────

Hooks.once("init", () => {
  // Expose to global scope so console/macros can access
  window.NPCCardsApp = NPCCardsApp;
  window.openNPCCards = openCardsApp;
  game.settings.register(MODULE_ID, "allCards", {
    name: "All NPC Cards",
    scope: "world",
    config: false,
    type: String,
    default: "[]",
  });

  game.settings.register(MODULE_ID, "playerCards", {
    name: "Player Card Collections",
    scope: "world",
    config: false,
    type: String,
    default: "{}",
  });

  game.settings.register(MODULE_ID, "customTemplates", {
    name: "Custom Card Templates",
    scope: "world",
    config: false,
    type: String,
    default: "[]",
  });
});

// ── Toolbar button (v13/v14: getSceneControlButtons hook) ────────────────────

let _npcCardsAppInstance = null;

function openCardsApp() {
  if (_npcCardsAppInstance?.rendered) {
    _npcCardsAppInstance.bringToFront?.() ?? _npcCardsAppInstance.element?.focus();
    return;
  }
  _npcCardsAppInstance = new NPCCardsApp();
  _npcCardsAppInstance.render(true);
}

/**
 * Register our button as a tool inside the standard "tokens" scene control.
 * This is the proper v13/v14 API: Foundry manages layout, position, and
 * re-rendering, so the button never "drifts" when the user switches tools.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  // v13+: controls is an object keyed by control name. Add our tool to
  // the "tokens" layer because every user (GM and players) has it.
  const target = controls.tokens ?? controls.token ?? Object.values(controls)[0];
  if (!target) return;

  // Ensure tools container exists and is the v13 object shape.
  if (!target.tools || Array.isArray(target.tools)) {
    target.tools = target.tools ? Object.fromEntries((target.tools).map(t => [t.name, t])) : {};
  }

  target.tools["npc-cards-open"] = {
    name: "npc-cards-open",
    title: "NPCCARDS.ToolTitle",
    icon: "fas fa-id-card",
    button: true,
    visible: true,
    onChange: (event, active) => openCardsApp(),
    onClick: () => openCardsApp(),
  };
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_EVENT, handleSocket);
  console.log("[NPC Cards] Module ready ✦");
});
