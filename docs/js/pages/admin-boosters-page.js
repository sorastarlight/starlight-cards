import {
  loadContentStudio,
  saveCardSubcategory,
  deleteCardSubcategory,
  cloneBooster,
  createBoosterFromTemplate,
  setDailyMode,
  uploadStudioAsset,
  listStudioAssets,
  deleteStudioAsset,
  refreshPublicCardCatalog,
  getSystemDiagnostics,
  exportAssetManifest,
  getAdminEvents,
  saveEvent,
  deleteEvent,
} from "../content-studio-service.js?v=1.5";
import { createAdminBoosterEditors } from "./admin-boosters-editors.js?v=1.5";
import { starBitAmountHtml } from "../star-bit-icon.js";
import { avatarFrameClassName, avatarFrameOverlayMarkup, avatarFrameOverlayUrl } from "../avatar-frame-utils.js";
import {
  adminListAvatarFrames,
  adminSaveAvatarFrame,
  adminSetRewardFrame,
} from "../avatar-frames-admin-service.js";
import { mountAdminCrumb } from "../admin-shell.js";

mountAdminCrumb({ tool: "Starlight Card Management" });

const $ = (s) => document.querySelector(s),
  status = $("#status"),
  app = $("#app"),
  editor = $("#editor"),
  body = $("#editorBody");
const data = {
    series: [],
    cards: [],
    boosters: [],
    events: [],
    frames: [],
    frameQuests: [],
    frameSeasonTiers: [],
    dailyMode: "daily",
  },
  assets = [];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[m],
  );
const editorModal = window.StarlightUI.adoptModal(editor, {
  dialog: editor.querySelector(".st-dialog"),
  labelledBy: "editorTitle"
});
function say(t, type = "") {
  status.textContent = t;
  status.className = `status ${type}`;
}
function openEditor(title, html) {
  $("#editorTitle").textContent = title;
  body.innerHTML = html;
  editorModal.open({ initialFocus: body.querySelector("input,select,textarea,button") });
}
function close() {
  editorModal.close(undefined, "page");
}
$("#closeEditor").onclick = close;
function options(items, value, label = (x) => x.name) {
  return items
    .map(
      (x) =>
        `<option value="${esc(x.id)}" ${x.id === value ? "selected" : ""}>${esc(label(x))}</option>`,
    )
    .join("");
}

function taxonomyOptions(items, value, emptyLabel = "Choose…") {
  return `<option value="">${emptyLabel}</option>${(items || [])
    .filter((x) => x.isActive !== false)
    .map(
      (x) =>
        `<option value="${esc(x.id)}" ${x.id === value ? "selected" : ""}>${esc(x.name)}</option>`,
    )
    .join("")}`;
}
function selectedValues(select) {
  return [...select.selectedOptions].map((o) => o.value).filter(Boolean);
}
function chipPicker(id, items, selected = []) {
  const chosen = new Set(selected || []);
  return `<div class="chip-picker-tools"><button type="button" class="btn" data-chip-all="${id}">Select All</button><button type="button" class="btn" data-chip-clear="${id}">Clear All</button><span class="lead" id="${id}Summary">${chosen.size ? `${chosen.size} selected` : "All allowed"}</span></div><div class="chip-picker" data-chip-picker="${id}">${(items || []).filter(x=>x.isActive!==false).map(x=>`<button type="button" data-chip-value="${esc(x.id)}" class="${chosen.has(x.id) ? "selected" : ""}">${esc(x.name)}</button>`).join("")}</div><select id="${id}" multiple class="hidden">${(items || []).filter(x=>x.isActive!==false).map(x=>`<option value="${esc(x.id)}" ${chosen.has(x.id) ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>`;
}
function wireChipPicker(id, onChange = () => {}) {
  const picker = body.querySelector(`[data-chip-picker="${id}"]`), select = $(`#${id}`), summary = $(`#${id}Summary`);
  if (!picker || !select) return;
  const sync = (notify = true) => {
    const selected = new Set(selectedValues(select));
    picker.querySelectorAll("[data-chip-value]").forEach(btn => btn.classList.toggle("selected", selected.has(btn.dataset.chipValue)));
    if (summary) summary.textContent = selected.size ? `${selected.size} selected` : "All allowed";
    if (notify) onChange();
  };
  picker.onclick = e => {
    const btn = e.target.closest("[data-chip-value]");
    if (!btn) return;
    const option = [...select.options].find(o => o.value === btn.dataset.chipValue);
    if (option) option.selected = !option.selected;
    sync();
  };
  body.querySelector(`[data-chip-all="${id}"]`)?.addEventListener("click",()=>{[...select.options].forEach(o=>o.selected=true);sync();});
  body.querySelector(`[data-chip-clear="${id}"]`)?.addEventListener("click",()=>{[...select.options].forEach(o=>o.selected=false);sync();});
  sync(false);
}
function toggleControl(id, label, checked, detail = "") {
  return `<div class="toggle-card"><div><strong>${esc(label)}</strong>${detail ? `<small>${esc(detail)}</small>` : ""}</div><label class="toggle-switch"><input id="${id}" type="checkbox" ${checked ? "checked" : ""}><span></span></label></div>`;
}
function categoryName(id) {
  return data.categories?.find((x) => x.id === id)?.name || "Uncategorized";
}
function subcategoryName(id) {
  return data.subcategories?.find((x) => x.id === id)?.name || "None";
}
function subcategoryOptions(selected = "") {
  const categories = new Map((data.categories || []).map((x) => [x.id, x.name]));
  const groups = new Map();
  for (const sub of (data.subcategories || []).filter((x) => x.isActive !== false || x.id === selected)) {
    const group = categories.get(sub.categoryId) || "General / Independent";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(sub);
  }
  return `<option value="">None</option>${[...groups.entries()].map(([group, rows]) => `<optgroup label="${esc(group)}">${rows.sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||a.name.localeCompare(b.name)).map((x)=>`<option value="${esc(x.id)}" ${x.id===selected?"selected":""}>${esc(x.name)}</option>`).join("")}</optgroup>`).join("")}`;
}
function variantName(id) {
  return data.variants?.find((x) => x.id === id)?.name || "Standard Art";
}
function finishName(id) {
  return data.finishes?.find((x) => x.id === id)?.name || "Standard";
}
function distributionName(id) {
  return (
    {
      booster_pull: "Booster Pull",
      redeem_code: "Redeem Code",
      twitch_reward: "Twitch Reward",
      event_reward: "Event Reward",
      admin_gift: "Admin Gift",
      promo: "Promo",
      special: "Special Distribution",
    }[id] || id
  );
}

function metrics() {
  return `<div class="metric"><strong>${data.series.length}</strong>Series</div><div class="metric"><strong>${data.cards.length}</strong>Cards</div><div class="metric"><strong>${data.boosters.filter((x) => !x.archived).length}</strong>Booster Packs</div><div class="metric"><strong>${data.events.length}</strong>Events</div>`;
}
function overview() {
  return `<section class="panel"><div class="toolbar"><div><h2>Free Daily Starlight Pack</h2><p class="lead">Control whether collectors receive one pack daily, unlimited packs, or no free packs.</p></div><div><select id="dailyMode"><option value="daily">Daily</option><option value="unlimited">Unlimited</option><option value="disabled">Disabled</option></select> <button id="saveDaily" class="btn primary">Save Availability</button></div></div></section><section class="panel"><h2>Quick Start</h2><p class="lead">Create and manage the content collectors see throughout the Binder.</p><div class="library"><button class="item" data-new="series"><h3>＋ New Series</h3><p>Create a set before assigning cards.</p></button><button class="item" data-new="card"><h3>＋ New Card</h3><p>Upload artwork and assign it to a series.</p></button><button class="item" data-new="booster"><h3>＋ New Booster Pack</h3><p>Choose slots, a series, exact cards, or a custom pool.</p></button></div></section><section class="panel"><h2>Content Architecture</h2><div class="library"><article class="item"><h3>Supabase Database</h3><p>Names, descriptions, rarities, pull rules, and image URLs.</p></article><article class="item"><h3>Supabase Storage</h3><p>Editable card, series, booster, and card-back artwork.</p></article><article class="item"><h3>GitHub Pages</h3><p>Application code, sounds, and permanent fallback assets.</p></article></div></section>`;
}
function seriesView() {
  return `<section class="panel"><div class="toolbar"><div><h2>Card Series</h2><p class="lead">Organize cards into clean collectible sets.</p></div><button class="btn primary" data-new="series">＋ Add Series</button></div><div class="library">${data.series.map((s) => `<article class="item"><img src="${esc(s.boosterImageUrl || "site_assets/series01_rising_star_booster.png")}" alt=""><h3>${esc(s.name)}</h3><div class="item-meta"><span>${esc(s.id)}</span><span>${s.cardCount || 0} cards</span></div><p>${esc(s.description || "No description")}</p><button class="btn" data-edit-series="${esc(s.id)}">Edit Series</button></article>`).join("") || '<div class="empty">No series yet.</div>'}</div></section>`;
}
function cardsView() {
  return `<section class="panel"><div class="toolbar"><div><h2>Card Database 2.0</h2><p class="lead">Manage cards using Pokémon-style classifications: series, category, rarity, variant, finish, distribution, and tags.</p></div><div><button class="btn" id="bulkUploadCards">⇧ Mass Upload Set</button> <button class="btn primary" data-new="card">＋ Add Card</button></div></div><div class="catalog-filters"><input id="cardSearch" type="search" placeholder="Search name, number, category, artist, or tag…"><select id="cardSeriesFilter"><option value="">All series</option>${options(data.series, "")}</select><select id="cardCategoryFilter"><option value="">All categories</option>${taxonomyOptions(data.categories, "", "All categories").replace('<option value="">All categories</option>', "")}</select><select id="cardSubcategoryFilter"><option value="">All subcategories</option>${subcategoryOptions("").replace('<option value="">None</option>', "")}</select><select id="cardRarityFilter"><option value="">All rarities</option>${["Common", "Uncommon", "Rare", "Epic", "Legendary"].map((r) => `<option>${r}</option>`).join("")}</select><select id="cardStatusFilter"><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div><div id="cardLibrary" class="library"></div></section>`;
}
function renderCardLibrary() {
  const q = ($("#cardSearch")?.value || "").toLowerCase(),
    sid = $("#cardSeriesFilter")?.value || "",
    cat = $("#cardCategoryFilter")?.value || "",
    sub = $("#cardSubcategoryFilter")?.value || "",
    rar = $("#cardRarityFilter")?.value || "",
    status = $("#cardStatusFilter")?.value || "";
  $("#cardLibrary").innerHTML =
    data.cards
      .filter(
        (c) =>
          (!sid || c.seriesId === sid) &&
          (!cat || c.categoryId === cat) &&
          (!sub || c.subcategoryId === sub) &&
          (!rar || c.rarity === rar) &&
          (!status || (c.publishStatus || "published") === status) &&
          (!q ||
            `${c.name} ${c.cardNumber} ${c.collectorNumber || ""} ${c.id} ${categoryName(c.categoryId)} ${subcategoryName(c.subcategoryId)} ${c.artist || ""} ${(c.tags || []).join(" ")}`
              .toLowerCase()
              .includes(q)),
      )
      .map(
        (c) =>
          `<article class="item card-db-item"><span class="card-db-art"><img src="${esc(c.thumbnailUrl || c.imageUrl)}" alt="${esc(c.name)} card artwork"></span><h3>${esc(c.collectorNumber || c.cardNumber)} · ${esc(c.name)}</h3><div class="item-meta"><span><span class="taxonomy-chip">${esc(categoryName(c.categoryId))}</span>${c.subcategoryId?` <span class="subcategory-badge">${esc(subcategoryName(c.subcategoryId))}</span>`:""}</span><span>${esc(c.rarity)}</span></div><p>${esc(data.series.find((s) => s.id === c.seriesId)?.name || c.seriesId)}<br>${esc(variantName(c.variantId))} · ${esc(finishName(c.finishId))}<br>${esc(distributionName(c.distributionType || "booster_pull"))} · ${esc(c.publishStatus || "published")}</p><button class="btn" data-edit-card="${esc(c.id)}">Edit Card</button></article>`,
      )
      .join("") || '<div class="empty">No matching cards.</div>';
}

function classificationsView() {
  const usage = new Map();
  for (const card of data.cards || []) if (card.subcategoryId) usage.set(card.subcategoryId, (usage.get(card.subcategoryId) || 0) + 1);
  return `<section class="panel"><div class="toolbar"><div><h2>Categories & Subcategories</h2><p class="lead">Categories describe what kind of card it is. Subcategories identify a franchise, property, or theme and can be paired with any category.</p></div><button class="btn primary" id="addSubcategory">＋ Add Subcategory</button></div><div class="taxonomy-note"><strong>Example:</strong> Category <em>Outfit</em> + Subcategory <em>Sonic The Hedgehog</em>, or Category <em>Style Change</em> + Subcategory <em>Magical Girls</em>. The suggested category below is only for organization—it does not restrict card assignments.</div><h3>Card Categories</h3><div class="chip-picker">${(data.categories||[]).map((x)=>`<span class="taxonomy-chip">${esc(x.name)}</span>`).join("")}</div><h3 style="margin-top:22px">Subcategories / Franchises / Themes</h3><div class="classification-grid">${(data.subcategories||[]).sort((a,b)=>(a.sortOrder||0)-(b.sortOrder||0)||a.name.localeCompare(b.name)).map((x)=>`<article class="classification-item"><div class="item-meta"><span>${esc(categoryName(x.categoryId))}</span><span>${usage.get(x.id)||0} card(s)</span></div><h3>${esc(x.name)}</h3><p>${esc(x.description||"No description")}</p><div class="item-meta"><span>${esc(x.id)}</span><span>${x.isActive===false?"Inactive":"Active"}</span></div><div class="booster-actions"><button class="btn" data-edit-subcategory="${esc(x.id)}">Edit</button><button class="btn danger" data-delete-subcategory="${esc(x.id)}">Delete</button></div></article>`).join("")||'<div class="empty">No subcategories yet.</div>'}</div></section>`;
}
function subcategoryEditor(existing = null) {
  const x = existing || { id: "", categoryId: "", name: "", description: "", sortOrder: (data.subcategories?.length || 0) * 10 + 10, isActive: true };
  openEditor(existing ? "Edit Subcategory" : "Add Subcategory", `<div class="form-grid"><div class="field"><label>Subcategory ID</label><input id="eSubcategoryId" value="${esc(x.id)}" ${existing?"readonly":""} placeholder="sonic-the-hedgehog"></div><div class="field"><label>Name</label><input id="eSubcategoryName" value="${esc(x.name)}"></div><div class="field"><label>Suggested Category</label><select id="eSubcategoryCategory"><option value="">General / Independent</option>${taxonomyOptions(data.categories,x.categoryId||"","Choose category").replace('<option value="">Choose category</option>',"")}</select><small>This is only an organizational suggestion. Cards can pair this subcategory with any category.</small></div><div class="field"><label>Sort Order</label><input id="eSubcategorySort" type="number" value="${Number(x.sortOrder)||0}"></div><div class="field full"><label>Description</label><textarea id="eSubcategoryDescription">${esc(x.description||"")}</textarea></div><div class="full">${toggleControl("eSubcategoryActive","Active / Available",x.isActive!==false,"Show this option in card editors.")}</div></div><div class="editor-actions"><button id="saveSubcategory" class="btn primary">Save Subcategory</button></div>`);
  $("#saveSubcategory").onclick = async () => {
    try {
      const name = $("#eSubcategoryName").value.trim();
      let id = $("#eSubcategoryId").value.trim().toLowerCase();
      if (!id) id = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
      await saveCardSubcategory({id,name,categoryId:$("#eSubcategoryCategory").value||null,description:$("#eSubcategoryDescription").value.trim(),sortOrder:Number($("#eSubcategorySort").value)||0,isActive:$("#eSubcategoryActive").checked});
      await reload(`Subcategory “${name}” saved.`);
    } catch(e) { say(e.message,"error"); }
  };
}

function boostersView() {
  return `<section class="panel"><div class="toolbar"><div><h2>Booster Packs</h2><p class="lead">Start from a template or copy a pack that already works. Advanced odds remain available when you need them.</p></div><button class="btn primary" id="newBoosterWizard">＋ Create Booster</button></div><section class="helper-card"><h4>Quick guide</h4><p><strong>Rarity</strong> is the card category. <strong>Pull rate</strong> is the chance a slot chooses that rarity. <strong>Pull frequency</strong> only changes how often one card appears compared with cards of the same rarity. Leave most cards on <em>Normal</em>.</p></section><div class="library">${
    data.boosters
      .filter((b) => !b.archived)
      .map(
        (b) =>
          `<article class="item"><img src="${esc(b.packImageUrl || "site_assets/series01_rising_star_booster.png")}" alt=""><h3>${esc(b.name)}</h3><div class="item-meta"><span>${esc(friendlyRewardMode(b.rewardMode))}</span><span>${starBitAmountHtml(esc, b.starBitsCost, { iconSize: 'xs' })}</span></div><p>${esc(b.description || "No description")}</p><div class="booster-actions"><button class="btn" data-edit-booster="${esc(b.id)}">Configure Pack</button><button class="btn" data-copy-booster="${esc(b.id)}">Copy Booster</button></div></article>`,
      )
      .join("") || '<div class="empty">No boosters yet.</div>'
  }</div></section>`;
}
function friendlyRewardMode(mode) {
  return (
    {
      slots: "Rarity Slots",
      series: "Single-Series Pack",
      exact: "Exact Cards",
      weighted_pool: "Weighted Card Pool",
      single: "Single Card",
      mixed: "Cards + Star Bits",
    }[mode] || mode
  );
}
function slugId(v) {
  return String(v || "booster")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
function boosterWizard() {
  openEditor(
    "Create Booster Pack",
    `<p class="lead">Choose the easiest starting point. Every new booster begins inactive so you can review it before collectors see it.</p><div class="template-grid"><button class="template-choice" data-template="standard"><h3>Standard 4-Card Pack</h3><p>2 Common, 1 Uncommon, 1 Rare-or-better.</p></button><button class="template-choice" data-template="series"><h3>Single-Series Pack</h3><p>Random cards restricted to one series.</p></button><button class="template-choice" data-template="guaranteed"><h3>Guaranteed Epic+ Pack</h3><p>Regular cards plus one Epic-or-Legendary slot.</p></button><button class="template-choice" data-template="exact"><h3>Exact Gift Pack</h3><p>Awards specific cards and quantities.</p></button><button class="template-choice" data-template="custom"><h3>Start From Scratch</h3><p>Advanced custom configuration.</p></button><button class="template-choice" data-copy-existing><h3>Copy Existing Booster</h3><p>Duplicate a working pack, including slots and odds.</p></button></div><div id="wizardForm" class="panel hidden"></div>`,
  );
  body.onclick = async (e) => {
    const t = e.target.closest("[data-template]");
    if (t) {
      const type = t.dataset.template;
      $("#wizardForm").classList.remove("hidden");
      $("#wizardForm").innerHTML =
        `<div class="form-grid"><div class="field"><label>New Booster ID</label><input id="wizardId" placeholder="series-02-booster"></div><div class="field"><label>Booster Name</label><input id="wizardName" placeholder="Series 02 Booster"></div></div><div class="editor-actions"><button id="createTemplateBooster" class="btn primary">Create Draft Booster</button></div>`;
      $("#createTemplateBooster").onclick = async () => {
        try {
          const id = slugId($("#wizardId").value || $("#wizardName").value);
          if (!id || !$("#wizardName").value.trim())
            throw new Error("Enter a booster name and ID.");
          await createBoosterFromTemplate(
            type,
            id,
            $("#wizardName").value.trim(),
          );
          await reload("Draft booster created.");
          const created = data.boosters.find((x) => x.id === id);
          if (created) boosterEditor(created);
        } catch (err) {
          say(err.message, "error");
        }
      };
    }
    if (e.target.closest("[data-copy-existing]")) {
      copyBoosterDialog();
    }
  };
}
function copyBoosterDialog(sourceId = "") {
  openEditor(
    "Copy Existing Booster",
    `<p class="lead">The copy includes artwork, card back, reward mode, card pools, slots, and pull rates. It starts inactive.</p><div class="form-grid"><div class="field full"><label>Source Booster</label><select id="copySource">${options(data.boosters, sourceId)}</select></div><div class="field"><label>New Booster ID</label><input id="copyId" placeholder="series-02-booster"></div><div class="field"><label>New Name</label><input id="copyName" placeholder="Series 02 Booster"></div></div><div class="editor-actions"><button id="confirmCopyBooster" class="btn primary">Copy Booster</button></div>`,
  );
  $("#copySource").onchange = () => {
    const b = data.boosters.find((x) => x.id === $("#copySource").value);
    if (b && !$("#copyName").value) $("#copyName").value = `${b.name} — Copy`;
  };
  $("#copySource").dispatchEvent(new Event("change"));
  $("#confirmCopyBooster").onclick = async () => {
    try {
      const id = slugId($("#copyId").value || $("#copyName").value);
      if (!id || !$("#copyName").value.trim())
        throw new Error("Enter a new booster ID and name.");
      await cloneBooster(
        $("#copySource").value,
        id,
        $("#copyName").value.trim(),
      );
      await reload("Booster copied as an inactive draft.");
      const created = data.boosters.find((x) => x.id === id);
      if (created) boosterEditor(created);
    } catch (err) {
      say(err.message, "error");
    }
  };
}
function assetsView() {
  const folders = [...new Set(assets.map((a) => a.folder))].sort();
  return `<section class="panel"><div class="toolbar"><div><h2>Asset Library</h2><p class="lead">Browse, upload, copy, open, and remove artwork stored in Supabase Storage.</p></div><label class="btn primary">Upload Artwork<input id="assetUpload" type="file" accept="image/*" hidden></label></div><div class="asset-tools"><input id="assetSearch" type="search" placeholder="Search filename or path…"><select id="assetFolder"><option value="">All folders</option>${folders.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join("")}</select></div><div id="assetResults" class="asset-grid"></div></section>`;
}

function eventsView() {
  return `<section class="panel"><div class="toolbar"><div><h2>Events & Seasonal Content</h2><p class="lead">Create timed celebrations that can group exclusive cards, booster packs, achievements, and titles.</p></div><button class="btn primary" data-new-event>＋ New Event</button></div><div class="library">${data.events.map((e) => `<article class="item">${e.bannerImageUrl ? `<img src="${esc(e.bannerImageUrl)}" alt="">` : ""}<div class="item-meta"><span>${new Date(e.startAt).toLocaleDateString()} – ${new Date(e.endAt).toLocaleDateString()}</span><span>${e.isActive ? "Active" : "Inactive"}</span></div><h3>${esc(e.name)}</h3><p>${esc(e.description || "No description")}</p><p class="lead">${e.cardCount || 0} card(s) • ${e.boosterCount || 0} booster(s) • ${(e.achievements || []).length} achievement(s)</p><button class="btn" data-edit-event="${esc(e.id)}">Edit Event</button></article>`).join("") || '<div class="empty">No events yet. Create your first seasonal celebration.</div>'}</div></section>`;
}

function framePreviewMarkup(frame) {
  const classes = avatarFrameClassName(frame) || "avatar-frame";
  const overlayClass = avatarFrameOverlayUrl(frame) ? " avatar-frame-has-overlay" : "";
  return `<span class="avatar-frame-preview ${esc(classes)}${overlayClass}" aria-hidden="true">${avatarFrameOverlayMarkup(frame, esc)}</span>`;
}

function framesView() {
  const frames = data.frames || [];
  const optionHtml = (selectedId) =>
    `<option value="">No frame</option>${frames
      .map(
        (f) =>
          `<option value="${esc(f.id)}" ${f.id === selectedId ? "selected" : ""}>${esc(f.name)}</option>`,
      )
      .join("")}`;

  const questHtml = (data.frameQuests || [])
    .map(
      (q) => `<div class="reward-row frame-reward-row" data-frame-reward-kind="quest" data-frame-reward-id="${esc(q.id)}">
        <strong>${esc(q.title || q.id)}</strong>
        <select data-frame-reward-select>${optionHtml(q.rewardFrameId || "")}</select>
        <button type="button" class="btn" data-save-frame-reward>Save</button>
      </div>`,
    )
    .join("") || '<p class="lead">No active quests.</p>';

  const tierHtml = (data.frameSeasonTiers || [])
    .map(
      (t) => `<div class="reward-row frame-reward-row" data-frame-reward-kind="season_tier" data-frame-reward-id="${esc(t.id)}">
        <strong>${esc(t.label || t.id)} <small>${esc(t.seasonId || "")} · tier ${esc(t.tierIndex)}</small></strong>
        <select data-frame-reward-select>${optionHtml(t.rewardFrameId || "")}</select>
        <button type="button" class="btn" data-save-frame-reward>Save</button>
      </div>`,
    )
    .join("") || '<p class="lead">No season tiers.</p>';

  return `<section class="panel"><div class="toolbar"><div><h2>Avatar Frames</h2><p class="lead">CSS-preset profile frames with optional transparent overlay art. Edit names, overlay URLs, activity, and sort order. Attach frames as quest or season-pass rewards.</p></div></div><div class="library">${frames
    .map(
      (f) => `<article class="item frame-item">
        <div class="frame-item-preview">${framePreviewMarkup(f)}</div>
        <div class="item-meta"><span>${esc(f.cssPreset)} · ${esc(f.effect)}</span><span>${f.isActive ? "Active" : "Inactive"}</span></div>
        <h3>${esc(f.name)}</h3>
        <p>${esc(f.description || "No description")}</p>
        <p class="lead">sort ${Number(f.sortOrder || 0)} · id ${esc(f.id)}${f.overlayImageUrl ? ` · overlay ${esc(f.overlayImageUrl)}` : ""}</p>
        <button class="btn" data-edit-frame="${esc(f.id)}">Edit Frame</button>
      </article>`,
    )
    .join("") || '<div class="empty">No avatar frames seeded yet.</div>'}</div>
    <section class="reward-builder" style="margin-top:22px"><h3>Quest reward frames</h3>${questHtml}</section>
    <section class="reward-builder" style="margin-top:18px"><h3>Season tier reward frames</h3>${tierHtml}</section>
  </section>`;
}

function frameEditor(frame) {
  openEditor(
    `Edit Frame · ${frame.name || frame.id}`,
    `<div class="form-grid">
      <div class="field full"><label>Live preview</label><div>${framePreviewMarkup(frame)}</div></div>
      <div class="field"><label>Frame ID</label><input value="${esc(frame.id)}" disabled></div>
      <div class="field"><label>CSS preset</label><input value="${esc(frame.cssPreset || "")}" disabled></div>
      <div class="field"><label>Effect</label><input value="${esc(frame.effect || "static")}" disabled></div>
      <div class="field"><label>Name</label><input id="frameName" value="${esc(frame.name || "")}"></div>
      <div class="field"><label>Sort order</label><input id="frameSort" type="number" value="${Number(frame.sortOrder || 0)}"></div>
      <div class="field full"><label>Description</label><textarea id="frameDescription">${esc(frame.description || "")}</textarea></div>
      <div class="field full"><label>Overlay image URL</label><input id="frameOverlayUrl" value="${esc(frame.overlayImageUrl || "")}" placeholder="site_assets/avatar-frames/sovereign-ring.png"><small class="lead">Transparent PNG/SVG ring with a hollow center. Leave blank for CSS-only frames.</small></div>
      <div class="checks full"><label><input id="frameActive" type="checkbox" ${frame.isActive !== false ? "checked" : ""}> Active</label></div>
    </div>
    <div class="editor-actions"><button id="saveFrameBtn" class="btn primary">Save Frame</button></div>`,
  );
  $("#saveFrameBtn").onclick = async () => {
    try {
      await adminSaveAvatarFrame({
        id: frame.id,
        name: $("#frameName").value.trim(),
        description: $("#frameDescription").value,
        sortOrder: Number($("#frameSort").value || 0),
        isActive: $("#frameActive").checked,
        overlayImageUrl: $("#frameOverlayUrl").value.trim(),
      });
      await reload("Avatar frame saved.");
    } catch (err) {
      say(err.message, "error");
    }
  };
}
function eventEditor(e = {}) {
  const achievements = e.achievements || [];
  openEditor(
    e.id ? "Edit Event" : "New Event",
    `<div class="form-grid"><div class="field"><label>Event ID</label><input id="eventId" value="${esc(e.id || "")}"></div><div class="field"><label>Event Name</label><input id="eventName" value="${esc(e.name || "")}"></div><div class="field full"><label>Description</label><textarea id="eventDescription">${esc(e.description || "")}</textarea></div><div class="field"><label>Start</label><input id="eventStart" type="datetime-local" value="${e.startAt ? new Date(e.startAt).toISOString().slice(0, 16) : ""}"></div><div class="field"><label>End</label><input id="eventEnd" type="datetime-local" value="${e.endAt ? new Date(e.endAt).toISOString().slice(0, 16) : ""}"></div><div class="field"><label>Accent Color</label><input id="eventColor" type="color" value="${esc(e.accentColor || "#ff82c8")}"></div><div class="field"><label>Sort Order</label><input id="eventSort" type="number" value="${Number(e.sortOrder || 0)}"></div><div class="field full"><label>Banner Image URL</label><input id="eventBanner" value="${esc(e.bannerImageUrl || "")}"><label class="upload">Browse & Upload Banner<input id="eventBannerFile" type="file" accept="image/*"></label><div id="eventBannerMeta" class="upload-meta">${e.bannerImageUrl ? esc(e.bannerImageUrl) : "No banner uploaded."}</div></div><div class="checks full"><label><input id="eventActive" type="checkbox" ${e.isActive !== false ? "checked" : ""}> Active</label><label><input id="eventHidden" type="checkbox" ${e.isHidden ? "checked" : ""}> Hidden</label></div></div><section class="reward-builder"><h3>Event Content</h3><div class="form-grid"><div class="field"><label>Event Cards</label><select id="eventCards" multiple size="8">${data.cards.map((c) => `<option value="${esc(c.id)}" ${(e.cardIds || []).includes(c.id) ? "selected" : ""}>#${esc(c.cardNumber)} ${esc(c.name)}</option>`).join("")}</select></div><div class="field"><label>Event Booster Packs</label><select id="eventBoosters" multiple size="8">${data.boosters.map((b) => `<option value="${esc(b.id)}" ${(e.boosterIds || []).includes(b.id) ? "selected" : ""}>${esc(b.name)}</option>`).join("")}</select></div></div></section><section class="reward-builder"><div class="toolbar"><div><h3>Event Achievements</h3><p class="lead">Add profile titles or Star Bits rewards for event milestones.</p></div><button id="addEventAchievement" class="btn" type="button">＋ Achievement</button></div><div id="eventAchievements">${achievements.map((a, i) => eventAchievementRow(a, i)).join("")}</div></section><div class="editor-actions"><button id="saveEventBtn" class="btn primary">Save Event</button>${e.id ? '<button id="deleteEventBtn" class="btn danger">Delete Event</button>' : ""}</div>`,
  );
  const file = $("#eventBannerFile"),
    url = $("#eventBanner"),
    meta = $("#eventBannerMeta");
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const up = await uploadStudioAsset(f, "events", {
        path: `events/${cleanFileName($("#eventId").value || f.name)}`,
      });
      url.value = up.url;
      meta.textContent = `Uploaded: ${up.path}`;
      say("Event banner uploaded.", "success");
    } catch (err) {
      say(err.message, "error");
    }
  };
  $("#addEventAchievement").onclick = () => {
    $("#eventAchievements").insertAdjacentHTML(
      "beforeend",
      eventAchievementRow({}, Date.now()),
    );
  };
  $("#saveEventBtn").onclick = async () => {
    try {
      const rows = [...document.querySelectorAll(".event-achievement-row")]
        .map((r, i) => ({
          key: r.querySelector("[data-a-key]").value,
          name: r.querySelector("[data-a-name]").value,
          description: r.querySelector("[data-a-desc]").value,
          requirementType: r.querySelector("[data-a-type]").value,
          requirementValue: Number(
            r.querySelector("[data-a-value]").value || 1,
          ),
          rewardStarBits: Number(r.querySelector("[data-a-bits]").value || 0),
          rewardTitle: r.querySelector("[data-a-title]").value,
          isActive: true,
          sortOrder: i,
        }))
        .filter((a) => a.key && a.name);
      await saveEvent({
        id: $("#eventId").value,
        name: $("#eventName").value,
        description: $("#eventDescription").value,
        startAt: new Date($("#eventStart").value).toISOString(),
        endAt: new Date($("#eventEnd").value).toISOString(),
        accentColor: $("#eventColor").value,
        sortOrder: Number($("#eventSort").value || 0),
        bannerImageUrl: url.value,
        isActive: $("#eventActive").checked,
        isHidden: $("#eventHidden").checked,
        cardIds: [...$("#eventCards").selectedOptions].map((x) => x.value),
        boosterIds: [...$("#eventBoosters").selectedOptions].map(
          (x) => x.value,
        ),
        achievements: rows,
      });
      await reload("Event saved.");
    } catch (err) {
      say(err.message, "error");
    }
  };
  $("#deleteEventBtn")?.addEventListener("click", async () => {
    if (
      await StarlightUI.confirm({
        title: "Delete event?",
        message:
          "Linked cards and boosters must be removed from the event first.",
        confirmText: "Delete Event",
        danger: true,
      })
    ) {
      try {
        await deleteEvent(e.id);
        await reload("Event deleted.");
      } catch (err) {
        say(err.message, "error");
      }
    }
  });
}
function eventAchievementRow(a = {}, i = 0) {
  return `<div class="reward-row event-achievement-row"><input data-a-key placeholder="achievement-key" value="${esc(a.key || "")}"><input data-a-name placeholder="Achievement name" value="${esc(a.name || "")}"><input data-a-value type="number" min="1" value="${Number(a.requirementValue || 1)}"><button type="button" class="btn danger" onclick="this.parentElement.remove()">Remove</button><textarea data-a-desc placeholder="Description">${esc(a.description || "")}</textarea><select data-a-type><option value="collect_event_cards">Collect Event Cards</option><option value="open_event_boosters">Open Event Boosters</option></select><input data-a-bits type="number" min="0" placeholder="Star Bits" value="${Number(a.rewardStarBits || 0)}"><input data-a-title placeholder="Reward title" value="${esc(a.rewardTitle || "")}"></div>`;
}
function cleanFileName(v) {
  return (
    String(v || "event-banner")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") + ".png"
  );
}
function maintenanceView() {
  return `<section class="panel"><div class="toolbar"><div><h2>Catalog & Cache</h2><p class="lead">Refresh live content after administrative changes or clear this browser's local catalog cache.</p></div><div class="editor-actions"><button id="refreshCatalog" class="btn primary">↻ Refresh Site Catalog</button><button id="clearCatalogCache" class="btn">Clear Local Catalog Cache</button></div></div></section><section class="panel"><div class="toolbar"><div><h2>Content Integrity Audit</h2><p class="lead">Check for duplicate IDs, numbering conflicts, missing artwork, orphaned cards, empty booster pools, and legacy external image links.</p><pre id="integrityOutput" class="upload-meta">Not checked yet.</pre></div><button id="runIntegrityAudit" class="btn">Run Integrity Audit</button></div></section><section class="panel"><div class="toolbar"><div><h2>System Diagnostics</h2><p class="lead">Check database connectivity, storage availability, catalog totals, managed assets, browser state, and the active site version.</p><pre id="diagnosticsOutput" class="upload-meta">Not checked yet.</pre></div><div class="editor-actions"><button id="runDiagnostics" class="btn primary">Run Diagnostics</button><button id="copyDiagnostics" class="btn">Copy Report</button><button id="downloadDiagnostics" class="btn">Download Report</button></div></div></section><section class="panel"><div class="toolbar"><div><h2>Security & Database Audit</h2><p class="lead">Use the included read-only Supabase audit to review RLS coverage, policies, privileged functions, indexes, foreign keys, and Storage bucket settings.</p></div><div class="editor-actions"><button id="copyAuditPath" class="btn">Copy Audit File Path</button></div></div><p class="lead"><code>docs/supabase/v87_4_security_performance_audit.sql</code></p></section><section class="panel"><div class="toolbar"><div><h2>Backups & Portability</h2><p class="lead">Download a complete content backup or a focused asset manifest. These files contain configuration and URLs, not the image binaries themselves.</p></div><div class="editor-actions"><button id="exportFullBackup" class="btn primary">Export Full Content Backup</button><button id="exportManifest" class="btn">Export Asset Manifest</button></div></div></section><section class="panel"><h2>Recovery Files</h2><p class="lead">Keep the included <code>docs/supabase/v87_1_database_schema_inventory.sql</code> with your repository. Run it in Supabase whenever you need a fresh schema inventory for disaster recovery planning.</p></section>`;
}
function renderAssetLibrary() {
  const q = ($("#assetSearch")?.value || "").trim().toLowerCase(),
    folder = $("#assetFolder")?.value || "";
  const rows = assets.filter(
    (a) =>
      (!folder || a.folder === folder) &&
      (!q || `${a.name} ${a.path} ${a.folder}`.toLowerCase().includes(q)),
  );
  $("#assetResults").innerHTML =
    rows
      .map(
        (a) =>
          `<article class="asset"><img src="${esc(a.url)}" alt="${esc(a.name)}" loading="lazy"><strong>${esc(a.folder)}</strong><code title="${esc(a.path)}">${esc(a.name)}</code><small>${a.createdAt ? new Date(a.createdAt).toLocaleString() : "Upload date unavailable"}</small><div class="asset-actions"><button class="btn" data-copy-asset="${esc(a.url)}">Copy URL</button><a class="btn" href="${esc(a.url)}" target="_blank" rel="noopener">Open</a><button class="btn danger" data-delete-asset="${esc(a.path)}">Delete</button></div></article>`,
      )
      .join("") || '<div class="empty">No matching assets.</div>';
  wireAssetButtons();
}
function wireAssetButtons() {
  document.querySelectorAll("[data-copy-asset]").forEach(
    (x) =>
      (x.onclick = async () => {
        try {
          await navigator.clipboard.writeText(x.dataset.copyAsset);
          say("Asset URL copied.", "success");
        } catch {
          say("Could not copy the URL.", "error");
        }
      }),
  );
  document.querySelectorAll("[data-delete-asset]").forEach(
    (x) =>
      (x.onclick = async () => {
        if (
          !(await StarlightUI.confirm({
            title: "Delete uploaded image?",
            message:
              "This removes the image from Supabase Storage and cannot be undone.",
            confirmText: "Delete Image",
            danger: true,
          }))
        )
          return;
        try {
          await deleteStudioAsset(x.dataset.deleteAsset);
          await reload("Asset deleted.");
        } catch (e) {
          say(e.message, "error");
        }
      }),
  );
}
function render() {
  $("#metrics").innerHTML = metrics();
  $("#overviewTab").innerHTML = overview();
  $("#seriesTab").innerHTML = seriesView();
  $("#cardsTab").innerHTML = cardsView();
  $("#classificationsTab").innerHTML = classificationsView();
  $("#boostersTab").innerHTML = boostersView();
  $("#assetsTab").innerHTML = assetsView();
  $("#eventsTab").innerHTML = eventsView();
  $("#framesTab").innerHTML = framesView();
  $("#maintenanceTab").innerHTML = maintenanceView();
  $("#dailyMode").value = data.dailyMode || "daily";
  renderCardLibrary();
  wire();
}
const {
  seriesEditor,
  cardEditor,
  boosterEditor,
  bulkCardUploadEditor
} = createAdminBoosterEditors({
  $, body, data, esc, openEditor, options, taxonomyOptions, subcategoryOptions,
  toggleControl, selectedValues, chipPicker, wireChipPicker, categoryName,
  subcategoryName, variantName, finishName, distributionName, say, reload, close,
  copyBoosterDialog, friendlyRewardMode
});

function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function buildIntegrityReport(content, assetRows) {
  const series = content?.series || [],
    cards = content?.cards || [],
    boosters = content?.boosters || [];
  const issues = [];
  const warnings = [];
  const seriesIds = new Set(series.map((x) => String(x.id)));
  const duplicate = (rows, key, label) => {
    const seen = new Map();
    for (const row of rows) {
      const value = String(key(row) || "").trim();
      if (!value) continue;
      if (seen.has(value)) issues.push(`${label} duplicated: ${value}`);
      else seen.set(value, true);
    }
  };
  duplicate(cards, (c) => c.id, "Card ID");
  duplicate(series, (s) => s.id, "Series ID");
  duplicate(boosters, (b) => b.id, "Booster ID");
  duplicate(
    cards,
    (c) => `${c.seriesId || c.series_id}:${c.cardNumber || c.card_number}`,
    "Card number within series",
  );
  for (const card of cards) {
    const sid = String(card.seriesId || card.series_id || "");
    if (!seriesIds.has(sid))
      issues.push(
        `Card ${card.id} references missing series ${sid || "(blank)"}.`,
      );
    const front = card.imageUrl || card.image_url || "";
    const thumb = card.thumbnailUrl || card.thumbnail_url || "";
    if (!front) issues.push(`Card ${card.id} has no front artwork URL.`);
    if (!thumb) warnings.push(`Card ${card.id} has no thumbnail URL.`);
    if (
      /pages\.dev|starlightcardsbinder/i.test(front) ||
      /pages\.dev|starlightcardsbinder/i.test(thumb)
    )
      warnings.push(
        `Card ${card.id} still uses a legacy external artwork URL.`,
      );
    if (Number(card.pullWeight ?? card.pull_weight) < 0)
      issues.push(`Card ${card.id} has a negative pull weight.`);
  }
  for (const booster of boosters) {
    const mode = booster.rewardMode || booster.reward_mode || "rarity_slots";
    const slots = booster.slots || [];
    const rewards =
      booster.rewards || booster.exactCards || booster.exact_cards || [];
    if (
      (booster.isActive ?? booster.is_active) &&
      mode === "rarity_slots" &&
      !slots.length
    )
      issues.push(`Active booster ${booster.id} has no rarity slots.`);
    if (
      (booster.isActive ?? booster.is_active) &&
      ["exact_cards", "single_card", "weighted_pool"].includes(mode) &&
      !rewards.length
    )
      issues.push(`Active booster ${booster.id} has an empty reward pool.`);
    const pack = booster.packImageUrl || booster.pack_image_url || "";
    const back = booster.cardBackUrl || booster.card_back_url || "";
    if (!pack) warnings.push(`Booster ${booster.id} has no pack artwork.`);
    if (!back) warnings.push(`Booster ${booster.id} has no card-back artwork.`);
  }
  const storagePaths = new Set((assetRows || []).map((a) => a.path));
  return {
    checkedAt: new Date().toISOString(),
    summary: {
      series: series.length,
      cards: cards.length,
      boosters: boosters.length,
      managedAssets: storagePaths.size,
      errors: issues.length,
      warnings: warnings.length,
    },
    errors: issues,
    warnings,
  };
}
function buildRuntimeDiagnostics(base = {}) {
  return {
    ...base,
    siteVersion: "87.4",
    generatedAt: new Date().toISOString(),
    page: location.href,
    browser: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      online: navigator.onLine,
      visibility: document.visibilityState,
      deviceMemory: navigator.deviceMemory || null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
    },
    cache: {
      catalogKeys: Object.keys(localStorage).filter((k) =>
        /card|catalog|binder/i.test(k),
      ),
      localStorageEntries: localStorage.length,
    },
    content: {
      series: data.series.length,
      cards: data.cards.length,
      boosters: data.boosters.length,
      managedAssets: assets.length,
    },
  };
}
async function getFullDiagnostics() {
  return buildRuntimeDiagnostics(await getSystemDiagnostics());
}
function wire() {
  document
    .querySelector("[data-new-event]")
    ?.addEventListener("click", () => eventEditor());
  document
    .querySelectorAll("[data-edit-event]")
    .forEach(
      (x) =>
        (x.onclick = () =>
          eventEditor(data.events.find((e) => e.id === x.dataset.editEvent))),
    );
  document
    .querySelectorAll("[data-edit-frame]")
    .forEach(
      (x) =>
        (x.onclick = () =>
          frameEditor(data.frames.find((f) => f.id === x.dataset.editFrame))),
    );
  document.querySelectorAll("[data-save-frame-reward]").forEach((btn) => {
    btn.onclick = async () => {
      const row = btn.closest("[data-frame-reward-kind]");
      if (!row) return;
      const kind = row.dataset.frameRewardKind;
      const id = row.dataset.frameRewardId;
      const select = row.querySelector("[data-frame-reward-select]");
      btn.disabled = true;
      try {
        await adminSetRewardFrame(kind, id, select?.value || null);
        await reload("Reward frame assignment saved.");
      } catch (err) {
        say(err.message, "error");
        btn.disabled = false;
      }
    };
  });
  document
    .querySelectorAll("[data-new]")
    .forEach(
      (x) =>
        (x.onclick = () =>
          ({ series: seriesEditor, card: cardEditor, booster: boosterWizard })[
            x.dataset.new
          ]()),
    );
  $("#addSubcategory")?.addEventListener("click", () => subcategoryEditor());
  document.querySelectorAll("[data-edit-subcategory]").forEach((x) => x.onclick = () => subcategoryEditor((data.subcategories||[]).find((s)=>s.id===x.dataset.editSubcategory)));
  document.querySelectorAll("[data-delete-subcategory]").forEach((x) => x.onclick = async () => {
    const sub=(data.subcategories||[]).find((s)=>s.id===x.dataset.deleteSubcategory);
    if(!(await window.StarlightUI.confirm({title:"Delete subcategory?",message:`Delete “${sub?.name||x.dataset.deleteSubcategory}”? Cards using it may need to be reclassified.`,confirmText:"Delete Subcategory",danger:true}))) return;
    try { await deleteCardSubcategory(x.dataset.deleteSubcategory); await reload("Subcategory deleted."); } catch(e){ say(e.message,"error"); }
  });
  $("#newBoosterWizard")?.addEventListener("click", boosterWizard);
  document
    .querySelectorAll("[data-copy-booster]")
    .forEach(
      (x) => (x.onclick = () => copyBoosterDialog(x.dataset.copyBooster)),
    );
  document
    .querySelectorAll("[data-edit-series]")
    .forEach(
      (x) =>
        (x.onclick = () =>
          seriesEditor(data.series.find((s) => s.id === x.dataset.editSeries))),
    );
  document
    .querySelectorAll("[data-edit-card]")
    .forEach(
      (x) =>
        (x.onclick = () =>
          cardEditor(data.cards.find((c) => c.id === x.dataset.editCard))),
    );
  document
    .querySelectorAll("[data-edit-booster]")
    .forEach(
      (x) =>
        (x.onclick = () =>
          boosterEditor(
            data.boosters.find((b) => b.id === x.dataset.editBooster),
          )),
    );
  $("#saveDaily")?.addEventListener("click", async () => {
    const mode = $("#dailyMode").value;
    const labels = {
      daily: "one free pack per day",
      unlimited: "unlimited free packs",
      disabled: "disabled (no free packs)",
    };
    if (
      !(await window.StarlightUI.confirm({
        title: "Change Free Daily Pack availability?",
        message: `Collectors will see Free Daily Packs as ${labels[mode] || mode}. This takes effect immediately.`,
        confirmText: "Save Availability",
        danger: mode === "disabled",
      }))
    ) {
      return;
    }
    try {
      await setDailyMode(mode);
      say("Free Daily Starlight Pack availability saved.", "success");
    } catch (e) {
      say(e.message, "error");
    }
  });
  $("#refreshCatalog")?.addEventListener("click", async () => {
    try {
      say("Refreshing the public card catalog…");
      const result = await refreshPublicCardCatalog();
      say(
        `Public catalog refreshed: ${result.cards.length} visible card(s).`,
        "success",
      );
    } catch (e) {
      say(e.message, "error");
    }
  });
  $("#clearCatalogCache")?.addEventListener("click", () => {
    for (const key of Object.keys(localStorage)) {
      if (/card|catalog|binder/i.test(key)) localStorage.removeItem(key);
    }
    say("Local catalog cache cleared. Refreshing…", "success");
    setTimeout(() => location.reload(), 500);
  });
  $("#exportManifest")?.addEventListener("click", async () => {
    try {
      downloadJson(
        `starlight-asset-manifest-${new Date().toISOString().slice(0, 10)}.json`,
        await exportAssetManifest(),
      );
      say("Asset manifest downloaded.", "success");
    } catch (e) {
      say(e.message, "error");
    }
  });
  $("#exportFullBackup")?.addEventListener("click", async () => {
    try {
      const backup = {
        format: "starlight-card-management-backup",
        version: "87.4",
        exportedAt: new Date().toISOString(),
        content: data,
        assets: await exportAssetManifest(),
        diagnostics: await getFullDiagnostics(),
      };
      downloadJson(
        `starlight-full-content-backup-${new Date().toISOString().slice(0, 10)}.json`,
        backup,
      );
      say("Full content backup downloaded.", "success");
    } catch (e) {
      say(e.message, "error");
    }
  });
  $("#runIntegrityAudit")?.addEventListener("click", () => {
    try {
      const report = buildIntegrityReport(data, assets);
      $("#integrityOutput").textContent = JSON.stringify(report, null, 2);
      say(
        report.summary.errors
          ? `Integrity audit found ${report.summary.errors} issue(s).`
          : "Integrity audit completed with no blocking issues.",
        report.summary.errors ? "error" : "success",
      );
    } catch (e) {
      $("#integrityOutput").textContent = e.message;
      say(e.message, "error");
    }
  });
  $("#runDiagnostics")?.addEventListener("click", async () => {
    try {
      const d = await getFullDiagnostics();
      $("#diagnosticsOutput").textContent = JSON.stringify(d, null, 2);
      say("Diagnostics completed.", "success");
    } catch (e) {
      $("#diagnosticsOutput").textContent = e.message;
      say(e.message, "error");
    }
  });
  $("#copyDiagnostics")?.addEventListener("click", async () => {
    try {
      let text = $("#diagnosticsOutput").textContent;
      if (!text || text === "Not checked yet.") {
        const d = await getFullDiagnostics();
        text = JSON.stringify(d, null, 2);
        $("#diagnosticsOutput").textContent = text;
      }
      await navigator.clipboard.writeText(text);
      say("Diagnostics copied to clipboard.", "success");
    } catch (e) {
      say(e.message, "error");
    }
  });
  $("#downloadDiagnostics")?.addEventListener("click", async () => {
    try {
      let d;
      try {
        d = JSON.parse($("#diagnosticsOutput").textContent);
      } catch {
        d = await getFullDiagnostics();
        $("#diagnosticsOutput").textContent = JSON.stringify(d, null, 2);
      }
      downloadJson(
        `starlight-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
        d,
      );
      say("Diagnostics report downloaded.", "success");
    } catch (e) {
      say(e.message, "error");
    }
  });
  $("#copyAuditPath")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(
        "docs/supabase/v87_4_security_performance_audit.sql",
      );
      say("Audit file path copied.", "success");
    } catch (e) {
      say(e.message, "error");
    }
  });
  $("#cardSearch")?.addEventListener("input", renderCardLibrary);
  $("#cardSeriesFilter")?.addEventListener("change", renderCardLibrary);
  $("#cardCategoryFilter")?.addEventListener("change", renderCardLibrary);
  $("#cardSubcategoryFilter")?.addEventListener("change", renderCardLibrary);
  $("#cardRarityFilter")?.addEventListener("change", renderCardLibrary);
  $("#cardStatusFilter")?.addEventListener("change", renderCardLibrary);
  $("#bulkUploadCards")?.addEventListener("click", bulkCardUploadEditor);
  $("#assetUpload")?.addEventListener("change", async (e) => {
    try {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadStudioAsset(file, "uploads");
      e.target.value = "";
      await reload("Artwork uploaded to Supabase Storage.");
    } catch (err) {
      say(err.message, "error");
    }
  });
  $("#assetSearch")?.addEventListener("input", renderAssetLibrary);
  $("#assetFolder")?.addEventListener("change", renderAssetLibrary);
  renderAssetLibrary();
}
document.querySelectorAll("[data-tab]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-tab]")
        .forEach((x) => x.classList.toggle("active", x === b));
      [
        "overview",
        "series",
        "cards",
        "classifications",
        "boosters",
        "assets",
        "events",
        "frames",
        "maintenance",
      ].forEach((t) =>
        $(`#${t}Tab`).classList.toggle("hidden", b.dataset.tab !== t),
      );
    }),
);
async function reload(message = "") {
  close();
  say("Loading Starlight Card Management…");
  try {
    // Catalog/events first — never block booster/card saves on Storage asset listing.
    const [content, eventRows, frameBundle] = await Promise.all([
      loadContentStudio(),
      getAdminEvents().catch((error) => {
        console.warn("[Starlight] Events refresh failed:", error);
        return data.events || [];
      }),
      adminListAvatarFrames().catch((error) => {
        console.warn("[Starlight] Avatar frames refresh failed:", error);
        return {
          frames: data.frames || [],
          quests: data.frameQuests || [],
          seasonTiers: data.frameSeasonTiers || [],
        };
      }),
    ]);
    Object.keys(data).forEach((key) => delete data[key]);
    Object.assign(data, {
      ...content,
      events: eventRows,
      frames: frameBundle.frames || [],
      frameQuests: frameBundle.quests || [],
      frameSeasonTiers: frameBundle.seasonTiers || [],
    });
    render();
    app.classList.remove("hidden");
    say(message, message ? "success" : "");
  } catch (e) {
    const text = e?.message || String(e) || "Unable to refresh Starlight Card Management.";
    say(text, "error");
    window.StarlightUI?.toast?.(text, "error");
    return;
  }

  listStudioAssets()
    .then((assetRows) => {
      assets.splice(0, assets.length, ...assetRows);
      if ($("#assetResults")) {
        const folderSelect = $("#assetFolder");
        if (folderSelect) {
          const current = folderSelect.value;
          const folders = [...new Set(assets.map((a) => a.folder))].sort();
          folderSelect.innerHTML = `<option value="">All folders</option>${folders
            .map((f) => `<option value="${esc(f)}">${esc(f)}</option>`)
            .join("")}`;
          if ([...folderSelect.options].some((o) => o.value === current)) {
            folderSelect.value = current;
          }
        }
        renderAssetLibrary();
      }
    })
    .catch((error) => {
      console.warn("[Starlight] Asset library refresh failed:", error);
    });
}
reload();
