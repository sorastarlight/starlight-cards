/**
 * Staff-visible release-stage banner. Collectors never change reward behavior
 * based on canary; this is ops signaling only.
 */
import { supabase } from './supabase-client.js';
import { getMyStaffAccess } from './staff-service.js';

const BANNER_ID = 'starlight-release-canary-banner';

function ensureBanner(stage) {
  let el = document.getElementById(BANNER_ID);
  if (stage !== 'canary') {
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
    'Canary release stage is active for staff visibility. Collector reward rules remain on the stable path.';
}

export async function mountReleaseChannelBanner() {
  try {
    const access = await getMyStaffAccess();
    if (!access?.isStaff) {
      ensureBanner('stable');
      return { stage: 'stable', staff: false };
    }
    const { data, error } = await supabase.rpc('get_ops_release_stage_public');
    if (error) throw error;
    const stage = String(data?.stage || 'stable').toLowerCase();
    ensureBanner(stage);
    return { stage, staff: true, workerMin: data?.workerMin || '1.1.5' };
  } catch {
    ensureBanner('stable');
    return { stage: 'stable', staff: false };
  }
}

