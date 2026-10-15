/**
 * Release-stage signaling + server-gated canary feature exposure.
 * Canary UI appears only when get_canary_feature returns allowed=true.
 */
import { supabase } from './supabase-client.js';
import { getMyStaffAccess } from './staff-service.js';

const BANNER_ID = 'starlight-release-canary-banner';
const FEATURE_ID = 'starlight-canary-feature-panel';
export const CANARY_GALLERY_DENSITY = 'gallery_density_preview';

function ensureBanner(stage, staff) {
  let el = document.getElementById(BANNER_ID);
  if (!(staff && stage === 'canary')) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('div');
    el.id = BANNER_ID;
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:sticky;top:0;z-index:1200;padding:8px 12px;background:#fff4d6;color:#5c4210;border-bottom:1px solid #efd48a;font:650 0.9rem/1.35 system-ui,sans-serif;text-align:center';
    document.body.prepend(el);
  }
  el.textContent =
    'Canary release stage is active. Unreleased features still require server cohort membership.';
}

function ensureFeaturePanel(result) {
  let el = document.getElementById(FEATURE_ID);
  if (!result?.allowed) {
    el?.remove();
    document.documentElement.removeAttribute('data-canary-gallery-density');
    return;
  }
  const density = String(result.payload?.density || 'compact');
  document.documentElement.setAttribute('data-canary-gallery-density', density);
  if (!el) {
    el = document.createElement('div');
    el.id = FEATURE_ID;
    el.setAttribute('role', 'status');
    el.style.cssText =
      'margin:8px 12px;padding:10px 12px;border:1px solid #c9daf5;border-radius:12px;background:#f5f9ff;color:#27468b;font:650 0.9rem/1.4 system-ui,sans-serif';
    const host =
      document.getElementById('main-content') ||
      document.querySelector('main') ||
      document.body;
    host.prepend(el);
  }
  el.textContent = `${result.label || 'Canary preview'} is enabled for your account (${density}).`;
}

export async function fetchCanaryFeature(feature = CANARY_GALLERY_DENSITY) {
  const { data, error } = await supabase.rpc('get_canary_feature', {
    requested_feature: feature
  });
  if (error) throw error;
  return data;
}

export async function mountReleaseChannelBanner() {
  try {
    const access = await getMyStaffAccess();
    const { data: stageData, error: stageError } = await supabase.rpc('get_ops_release_stage_public');
    if (stageError) throw stageError;
    const stage = String(stageData?.stage || 'stable').toLowerCase();
    ensureBanner(stage, Boolean(access?.isStaff));

    let feature = { allowed: false, feature: CANARY_GALLERY_DENSITY, reason: 'not_checked' };
    if (access?.isStaff || stage === 'canary') {
      try {
        feature = await fetchCanaryFeature(CANARY_GALLERY_DENSITY);
      } catch {
        feature = { allowed: false, feature: CANARY_GALLERY_DENSITY, reason: 'rpc_error' };
      }
    }
    ensureFeaturePanel(feature);

    return {
      stage,
      staff: Boolean(access?.isStaff),
      workerMin: stageData?.workerMin || '1.1.5',
      canaryFeature: feature
    };
  } catch {
    ensureBanner('stable', false);
    ensureFeaturePanel(null);
    return { stage: 'stable', staff: false, canaryFeature: { allowed: false } };
  }
}
