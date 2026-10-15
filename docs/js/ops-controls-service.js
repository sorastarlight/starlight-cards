import { supabase } from './supabase-client.js';

async function rpc(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export function getOpsPauses() {
  return rpc('admin_get_ops_pauses');
}

export function setOpsPause(feature, paused) {
  return rpc('admin_set_ops_pause', {
    requested_feature: feature,
    requested_paused: Boolean(paused)
  });
}

export function getOpsReleaseStage() {
  return rpc('admin_get_ops_release_stage');
}

export function setOpsReleaseStage(stage, notes = '') {
  return rpc('admin_set_ops_release_stage', {
    requested_stage: stage,
    requested_notes: notes || null
  });
}
