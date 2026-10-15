import {
  getDatabaseHealth,
  repairDatabaseHealth,
  exportDatabaseBackup,
  downloadJson
} from '../database-health-service.js';
import {
  getOpsPauses,
  setOpsPause,
  getOpsReleaseStage,
  setOpsReleaseStage,
  listOpsReleaseCohort
} from '../ops-controls-service.js';
import { getMyStaffAccess } from '../staff-service.js';
import { mountAdminCrumb } from '../admin-shell.js';

mountAdminCrumb({ tool: 'Database Health & Backup' });

const status = document.getElementById('status');
const content = document.getElementById('content');
const summary = document.getElementById('summary');
const checks = document.getElementById('checks');
const opsPanel = document.getElementById('opsControls');

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

function describe(item) {
  return (
    item.name ||
    item.cardName ||
    item.slotName ||
    item.id ||
    item.cardId ||
    item.boosterId ||
    item.collectorNumber ||
    JSON.stringify(item)
  );
}

const PAUSE_FEATURES = [
  {
    key: 'shop',
    pausedField: 'shopPurchasesPaused',
    label: 'Star Bits shop purchases',
    detail: 'Blocks open_star_bits_booster_by_id. Inventory and prices unchanged.'
  },
  {
    key: 'conversions',
    pausedField: 'conversionsPaused',
    label: 'Duplicate conversions',
    detail: 'Blocks Star Bits conversion RPCs. Collection copies stay untouched.'
  },
  {
    key: 'trades',
    pausedField: 'tradesPaused',
    label: 'New trade offers',
    detail: 'Blocks create_trade_offer. Existing offers are not deleted.'
  }
];

async function renderOpsControls() {
  if (!opsPanel) return;
  try {
    const access = await getMyStaffAccess();
    if (!access.canManageRoles) {
      opsPanel.hidden = true;
      return;
    }
    const [pauses, release, cohort] = await Promise.all([
      getOpsPauses(),
      getOpsReleaseStage(),
      listOpsReleaseCohort()
    ]);
    const cohortRows = Array.isArray(cohort) ? cohort : [];
    opsPanel.hidden = false;
    opsPanel.innerHTML = `
      <section class="ops-panel" aria-labelledby="opsPauseTitle">
        <div class="ops-panel__head">
          <h2 id="opsPauseTitle">Operational pauses</h2>
          <p>Pause collector money/trade surfaces without changing payout rules or deleting inventory. Actions write to the staff audit log.</p>
        </div>
        <div class="ops-pause-list">
          ${PAUSE_FEATURES.map((feature) => {
            const paused = Boolean(pauses?.[feature.pausedField]);
            return `
              <article class="ops-pause-row ${paused ? 'is-paused' : ''}">
                <div>
                  <strong>${esc(feature.label)}</strong>
                  <p>${esc(feature.detail)}</p>
                  <span class="ops-state">${paused ? 'Paused' : 'Live'}</span>
                </div>
                <button type="button" class="secondary-btn" data-ops-pause="${esc(feature.key)}" data-paused="${paused ? '1' : '0'}">
                  ${paused ? 'Resume' : 'Pause'}
                </button>
              </article>
            `;
          }).join('')}
        </div>
      </section>
      <section class="ops-panel" aria-labelledby="opsReleaseTitle">
        <div class="ops-panel__head">
          <h2 id="opsReleaseTitle">Release stage</h2>
          <p>Canary is staff-visible signaling only. Collectors keep stable reward behavior; Worker minimum stays pinned in the compatibility matrix.</p>
        </div>
        <div class="ops-release-row">
          <label>
            Stage
            <select id="opsReleaseStage">
              <option value="stable" ${release?.stage === 'stable' ? 'selected' : ''}>Stable</option>
              <option value="canary" ${release?.stage === 'canary' ? 'selected' : ''}>Canary</option>
            </select>
          </label>
          <label class="ops-release-notes">
            Notes
            <input id="opsReleaseNotes" type="text" maxlength="500" value="${esc(release?.notes || '')}" placeholder="Optional release note for staff">
          </label>
          <button type="button" class="primary-btn" id="saveOpsRelease">Save Stage</button>
        </div>
        <p class="ops-release-meta">Worker minimum: ${esc(release?.workerMin || '1.1.5')}. Canary features also require cohort membership (server-enforced).</p>
      </section>
      <section class="ops-panel" aria-labelledby="opsCohortTitle">
        <div class="ops-panel__head">
          <h2 id="opsCohortTitle">Canary cohort</h2>
          <p>Members may receive server-gated canary features when stage is canary and the feature flag is enabled. Adding members uses admin RPCs only — this panel is read-only.</p>
        </div>
        <ul class="ops-cohort-list">
          ${
            cohortRows.length
              ? cohortRows
                  .map(
                    (row) =>
                      `<li><strong>${esc(row.email || row.userId)}</strong>${row.note ? ` — ${esc(row.note)}` : ''}</li>`
                  )
                  .join('')
              : '<li>No cohort members yet.</li>'
          }
        </ul>
      </section>
    `;

    opsPanel.querySelectorAll('[data-ops-pause]').forEach((button) => {
      button.onclick = async () => {
        const feature = button.dataset.opsPause;
        const currentlyPaused = button.dataset.paused === '1';
        const nextPaused = !currentlyPaused;
        const label = PAUSE_FEATURES.find((item) => item.key === feature)?.label || feature;
        if (
          !(await window.StarlightUI.confirm({
            title: nextPaused ? `Pause ${label}?` : `Resume ${label}?`,
            message: nextPaused
              ? 'Collectors will see a temporary pause message. Inventory and odds are not changed.'
              : 'Collectors can use this surface again immediately.',
            confirmText: nextPaused ? 'Pause' : 'Resume',
            danger: nextPaused
          }))
        ) {
          return;
        }
        button.disabled = true;
        try {
          await setOpsPause(feature, nextPaused);
          window.StarlightUI?.toast?.(nextPaused ? `${label} paused.` : `${label} resumed.`, 'success');
          await renderOpsControls();
        } catch (error) {
          window.StarlightUI?.toast?.(error.message || 'Unable to update pause.', 'error');
          button.disabled = false;
        }
      };
    });

    document.getElementById('saveOpsRelease')?.addEventListener('click', async () => {
      const stage = document.getElementById('opsReleaseStage')?.value || 'stable';
      const notes = document.getElementById('opsReleaseNotes')?.value || '';
      if (
        !(await window.StarlightUI.confirm({
          title: `Set release stage to ${stage}?`,
          message:
            stage === 'canary'
              ? 'Staff will see a canary banner. Collector reward rules stay unchanged.'
              : 'Staff canary signaling will clear. Collectors remain on stable behavior.',
          confirmText: 'Save Stage'
        }))
      ) {
        return;
      }
      try {
        await setOpsReleaseStage(stage, notes);
        window.StarlightUI?.toast?.(`Release stage set to ${stage}.`, 'success');
        await renderOpsControls();
      } catch (error) {
        window.StarlightUI?.toast?.(error.message || 'Unable to save release stage.', 'error');
      }
    });
  } catch (error) {
    opsPanel.hidden = false;
    opsPanel.innerHTML = `<p class="error-text">${esc(error.message || 'Unable to load ops controls.')}</p>`;
  }
}

async function load() {
  status.textContent = 'Running database health checks…';
  status.className = 'status';
  content.classList.add('hidden');
  try {
    await renderOpsControls();
    const data = await getDatabaseHealth();
    const s = data.summary || {};
    summary.innerHTML = [
      ['Cards', s.cards],
      ['Published', s.publishedCards],
      ['Series', s.series],
      ['Active Boosters', s.activeBoosters],
      ['Categories', s.categories]
    ]
      .map(
        ([label, value]) =>
          `<div class="health-stat"><strong>${Number(value || 0)}</strong><span>${label}</span></div>`
      )
      .join('');
    checks.innerHTML = (data.checks || [])
      .map((c) => {
        const count = Number(c.count || 0);
        const items = c.items || [];
        return `<article class="health-check ${esc(c.severity)}"><div class="check-top"><div class="check-title">${count === 0 ? '✓ ' : ''}${esc(c.title)}</div><span class="count-pill">${count}</span></div>${
          count === 0
            ? '<p class="good">No issues found.</p>'
            : `<ul class="item-list">${items
                .slice(0, 100)
                .map(
                  (i) =>
                    `<li>${esc(describe(i))}${i.seriesId ? ` · ${esc(i.seriesId)}` : ''}${
                      i.total !== undefined ? ` · Total ${esc(i.total)}%` : ''
                    }</li>`
                )
                .join('')}</ul>`
        }<div class="check-actions">${
          c.repairable && count > 0
            ? `<button class="secondary-btn" data-repair="${esc(c.id)}">Repair Safe Issues</button>`
            : ''
        }${items.length > 100 ? `<span>Showing first 100 of ${items.length}</span>` : ''}</div></article>`;
      })
      .join('');
    status.textContent = `Health check completed ${new Date(data.generatedAt).toLocaleString()}.`;
    content.classList.remove('hidden');
  } catch (e) {
    status.textContent = e.message;
    status.className = 'status error-text';
  }
}

checks.addEventListener('click', async (e) => {
  const button = e.target.closest('[data-repair]');
  if (!button) return;
  const action = button.dataset.repair;
  if (
    !(await window.StarlightUI.confirm({
      title: 'Run safe repair?',
      message: 'A backup is recommended before repairing this issue.',
      confirmText: 'Run Repair'
    }))
  ) {
    return;
  }
  button.disabled = true;
  try {
    const result = await repairDatabaseHealth(action);
    window.StarlightUI?.toast?.(`Repair complete: ${result.affected || 0} row(s) updated.`);
    await load();
  } catch (err) {
    window.StarlightUI?.toast?.(err.message, 'error');
    button.disabled = false;
  }
});

document.getElementById('refresh').onclick = load;
document.getElementById('backup').onclick = async () => {
  const b = document.getElementById('backup');
  b.disabled = true;
  b.textContent = 'Preparing…';
  try {
    const data = await exportDatabaseBackup();
    downloadJson(data, `starlight-database-backup-${new Date().toISOString().slice(0, 10)}.json`);
    window.StarlightUI?.toast?.('Database backup downloaded.');
  } catch (e) {
    window.StarlightUI?.toast?.(e.message, 'error');
  } finally {
    b.disabled = false;
    b.textContent = '⬇ Download Backup';
  }
};

load();
