import { redirectToLogin } from '../shell-route-utils.js';
import { supabase } from '../supabase-client.js';
import {
  convertSelectedDuplicatesToStarBits,
  getStarBitsExchangePreview
} from '../star-bits-service.js';
import { notifyShellEconomyChanged } from '../shell-economy.js';
import { starBitAmountHtml, starBitIconHtml } from '../star-bit-icon.js';
import { STAR_BITS_SUMMARY } from '../progression-clarity.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));

const summarySection = document.getElementById('summary-section');
const rateSection = document.getElementById('rate-section');
const duplicateSection = document.getElementById('duplicate-section');
const emptyState = document.getElementById('empty-state');
const exchangeBox = document.getElementById('exchange-box');
const pageStatus = document.getElementById('page-status');
const balanceValue = document.getElementById('balance-value');
const duplicateCardTypes = document.getElementById('duplicate-card-types');
const duplicateCopyCount = document.getElementById('duplicate-copy-count');
const exchangeValue = document.getElementById('exchange-value');
const rateGrid = document.getElementById('rate-grid');
const duplicateGrid = document.getElementById('duplicate-grid');
const exchangeButton = document.getElementById('exchange-button');
const selectedSummary = document.getElementById('selected-summary');
const selectAllToggle = document.getElementById('select-all-toggle');
const clearSelectionButton = document.getElementById('clear-duplicate-selection');

let currentPreview = null;
let isConverting = false;
const selections = new Map();

function toast(message, type = '') {
  if (window.StarlightUI?.toast) {
    window.StarlightUI.toast(message, type);
    return;
  }
  displayStatus(message, type === 'error' ? 'error' : 'success');
}

function displayStatus(message = '', type = '') {
  pageStatus.textContent = message;
  pageStatus.classList.remove('success', 'error');
  if (type) pageStatus.classList.add(type);
}

function hideDynamicSections() {
  duplicateSection.classList.add('hidden');
  emptyState.classList.add('hidden');
  exchangeBox.classList.add('hidden');
}

function renderRates(rates) {
  const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
  rateGrid.replaceChildren();
  for (const rarity of rarityOrder) {
    const card = document.createElement('div');
    card.className = `rate-card rarity-${rarity.toLowerCase()}`;
    card.innerHTML = `<span class="rate-label">${esc(rarity)}</span><strong class="star-bit-amount">${starBitIconHtml(esc, { size: 'sm' })}${esc(rates?.[rarity] ?? 0)}</strong>`;
    rateGrid.append(card);
  }
}

function getSelectedTotals() {
  let copies = 0;
  let bits = 0;
  for (const card of currentPreview?.duplicateCards || []) {
    const quantity = selections.get(card.cardId) || 0;
    copies += quantity;
    bits += quantity * Number(card.bitsPerDuplicate || 0);
  }
  return { copies, bits };
}

function selectedCardsForReveal() {
  const out = [];
  for (const card of currentPreview?.duplicateCards || []) {
    const quantity = selections.get(card.cardId) || 0;
    if (quantity > 0) out.push({ ...card, quantity });
  }
  return out;
}

function updateSelectionSummary() {
  const { copies, bits } = getSelectedTotals();
  selectedSummary.innerHTML = copies > 0
    ? `<strong>${copies}</strong> ${copies === 1 ? 'copy' : 'copies'} · ${starBitAmountHtml(esc, bits, { iconSize: 'sm', suffix: 'Star Bits' })}`
    : 'Select duplicate copies to convert';
  exchangeButton.disabled = copies <= 0 || isConverting;
  document.body.classList.toggle('bits-has-selection', copies > 0);
}

function setSelection(cardId, quantity, maximum) {
  const safe = Math.max(0, Math.min(maximum, Math.floor(Number(quantity) || 0)));
  if (safe > 0) selections.set(cardId, safe);
  else selections.delete(cardId);

  const article = duplicateGrid.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
  if (article) {
    const input = article.querySelector('input[type="number"]');
    if (input) input.value = String(safe);
    article.classList.toggle('is-selected', safe > 0);
  }

  const available = currentPreview?.duplicateCards || [];
  if (selectAllToggle && available.length) {
    selectAllToggle.checked = available.every((card) =>
      (selections.get(card.cardId) || 0) === Number(card.duplicateQuantity || 0)
    );
  }
  updateSelectionSummary();
}

function renderDuplicates(cards) {
  duplicateGrid.replaceChildren();
  selections.clear();
  if (selectAllToggle) selectAllToggle.checked = false;

  for (const card of cards || []) {
    const article = document.createElement('article');
    article.className = `duplicate-card rarity-${String(card.rarity || 'common').toLowerCase()}`;
    article.dataset.cardId = card.cardId;

    const image = document.createElement('img');
    image.src = card.thumbnailUrl || card.imageUrl || '';
    image.alt = `${card.name} card artwork`;
    image.loading = 'lazy';

    const name = document.createElement('h3');
    name.textContent = `#${card.cardNumber} ${card.name}`;

    const meta = document.createElement('p');
    meta.className = 'duplicate-meta';
    meta.textContent = `${card.rarity} · ${card.seriesName}`;

    const owned = document.createElement('p');
    owned.className = 'duplicate-owned';
    owned.textContent = `${card.totalQuantity} owned · ${card.duplicateQuantity} extra`;

    const value = document.createElement('span');
    value.className = 'value-pill';
    value.innerHTML = `${starBitAmountHtml(esc, card.bitsPerDuplicate, { iconSize: 'xs' })} each`;

    const controls = document.createElement('div');
    controls.className = 'duplicate-quantity-control';
    const minus = document.createElement('button');
    minus.type = 'button';
    minus.textContent = '−';
    minus.setAttribute('aria-label', `Decrease ${card.name} quantity`);
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.max = String(card.duplicateQuantity);
    input.value = '0';
    input.inputMode = 'numeric';
    input.setAttribute('aria-label', `Duplicate copies of ${card.name} to convert`);
    const plus = document.createElement('button');
    plus.type = 'button';
    plus.textContent = '+';
    plus.setAttribute('aria-label', `Increase ${card.name} quantity`);
    controls.append(minus, input, plus);

    input.addEventListener('input', () => {
      setSelection(card.cardId, input.value, card.duplicateQuantity);
    });
    minus.addEventListener('click', () => {
      const current = selections.get(card.cardId) || 0;
      setSelection(card.cardId, current - 1, card.duplicateQuantity);
    });
    plus.addEventListener('click', () => {
      const current = selections.get(card.cardId) || 0;
      setSelection(card.cardId, current + 1, card.duplicateQuantity);
    });

    const info = document.createElement('div');
    info.className = 'duplicate-card-info';
    info.append(name, meta, owned, value, controls);
    article.append(image, info);
    duplicateGrid.append(article);
  }
  updateSelectionSummary();
}

function renderPreview(preview) {
  currentPreview = preview;
  hideDynamicSections();

  balanceValue.textContent = String(preview.starBitsBalance ?? 0);
  duplicateCardTypes.textContent = String(preview.duplicateCardTypes ?? 0);
  duplicateCopyCount.textContent = String(preview.totalDuplicateCopies ?? 0);
  exchangeValue.textContent = String(preview.totalExchangeValue ?? 0);
  renderRates(preview.exchangeRates);

  summarySection.classList.remove('hidden');
  rateSection.classList.remove('hidden');

  const duplicateCards = preview.duplicateCards || [];
  if (duplicateCards.length > 0) {
    renderDuplicates(duplicateCards);
    duplicateSection.classList.remove('hidden');
    exchangeBox.classList.remove('hidden');
  } else {
    emptyState.classList.remove('hidden');
  }
}

async function loadPreview(successMessage = '') {
  displayStatus();
  const { preview, error } = await getStarBitsExchangePreview();
  if (error || !preview) {
    displayStatus(error?.message || 'The Star Bits exchange could not be loaded.', 'error');
    return;
  }
  renderPreview(preview);
  if (successMessage) displayStatus(successMessage, 'success');
}

function selectedPayload() {
  return [...selections.entries()].map(([cardId, quantity]) => ({ cardId, quantity }));
}

async function runConversion(payload, revealCards, confirmOptions) {
  if (isConverting) return;
  const copies = payload.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const bits = (revealCards || selectedCardsForReveal()).reduce((sum, card) => {
    const qty = payload.find((row) => row.cardId === card.cardId)?.quantity
      || selections.get(card.cardId)
      || 0;
    return sum + qty * Number(card.bitsPerDuplicate || 0);
  }, 0);

  const confirmed = await window.StarlightUI?.confirm?.({
    title: confirmOptions?.title || 'Convert your duplicates?',
    message: confirmOptions?.message
      || `Convert ${copies} duplicate ${copies === 1 ? 'copy' : 'copies'} into ${bits} Star Bits?`,
    warning: 'This cannot be undone. Your final copy of every card stays in your collection.',
    confirmText: 'Convert to Star Bits',
    cancelText: 'Keep my duplicates'
  });
  if (!confirmed) return;

  isConverting = true;
  updateSelectionSummary();
  displayStatus();

  try {
    const result = await convertSelectedDuplicatesToStarBits(payload);
    const converted = Number(result.convertedDuplicateCopies ?? copies);
    const earned = Number(result.starBitsEarned ?? bits);
    await loadPreview(
      `Converted ${converted} duplicate ${converted === 1 ? 'copy' : 'copies'} into ${earned} Star Bits.`
    );
    toast(`Converted ${converted} ${converted === 1 ? 'copy' : 'copies'} into ${earned} Star Bits.`, 'success');
    notifyShellEconomyChanged({ source: 'duplicate-convert', starBitsEarned: earned });
  } catch (error) {
    console.error('Star Bits conversion failed:', error);
    displayStatus(error.message || 'The selected duplicate cards could not be converted.', 'error');
    toast(error.message || 'Unable to convert.', 'error');
  } finally {
    isConverting = false;
    updateSelectionSummary();
  }
}

async function performConversion() {
  const { copies } = getSelectedTotals();
  if (copies <= 0) return;
  await runConversion(selectedPayload(), selectedCardsForReveal());
}

async function initializePage() {
  const summary = document.getElementById('bits-clarity-summary');
  if (summary) summary.textContent = STAR_BITS_SUMMARY;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    displayStatus('Sign in to convert duplicates into Star Bits. Exchange rates stay visible after you sign in.', 'error');
    summarySection?.classList.add('hidden');
    rateSection?.classList.add('hidden');
    hideDynamicSections();
    redirectToLogin('signin', { delayMs: 1600 });
    return;
  }
  await loadPreview();
}

selectAllToggle.addEventListener('change', () => {
  const selectEverything = selectAllToggle.checked;
  const cards = currentPreview?.duplicateCards || [];
  for (const card of cards) {
    const quantity = selectEverything ? Number(card.duplicateQuantity || 0) : 0;
    setSelection(card.cardId, quantity, Number(card.duplicateQuantity || 0));
  }
  selectAllToggle.checked = selectEverything;
  updateSelectionSummary();
});

clearSelectionButton.addEventListener('click', () => {
  if (selectAllToggle) selectAllToggle.checked = false;
  for (const card of currentPreview?.duplicateCards || []) {
    setSelection(card.cardId, 0, card.duplicateQuantity);
  }
});

exchangeButton.addEventListener('click', performConversion);
initializePage();
