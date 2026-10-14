import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('staff access lookup treats signed-out permission denials as not staff', async () => {
  const service = await read('docs/js/staff-service.js');
  assert.match(service, /isUnauthenticatedStaffLookup/);
  assert.match(service, /permission denied/);
  assert.match(service, /return \{ isStaff: false, role: null, roleLabel: null \}/);
  assert.match(service, /RPC is granted to authenticated only/);
});

test('staff service exposes custom role label RPCs', async () => {
  const service = await read('docs/js/staff-service.js');
  assert.match(service, /admin_list_staff_role_labels/);
  assert.match(service, /admin_create_staff_role_label/);
  assert.match(service, /admin_delete_staff_role_label/);
  assert.match(service, /requested_label_id/);
  assert.match(service, /export async function listStaffRoleLabels/);
  assert.match(service, /export async function createStaffRoleLabel/);
  assert.match(service, /export async function deleteStaffRoleLabel/);
});

test('staff service exposes per-user unlockable RPCs', async () => {
  const service = await read('docs/js/staff-service.js');
  assert.match(service, /admin_list_user_unlockables/);
  assert.match(service, /admin_grant_user_unlockable/);
  assert.match(service, /admin_revoke_user_unlockable/);
  assert.match(service, /admin_set_user_unlockables/);
  assert.match(service, /export async function listUserUnlockables/);
  assert.match(service, /export async function setUserUnlockables/);
  assert.match(service, /requested_title_ids/);
  assert.match(service, /requested_frame_ids/);
});

test('admin staff page wires custom role labels and assignment', async () => {
  const page = await read('docs/js/pages/admin-staff-page.js');
  const html = await read('docs/admin-staff.html');
  assert.match(html, /Custom role labels/);
  assert.match(html, /id="create-label-form"/);
  assert.match(html, /admin-staff-page\.js\?v=\d+\.\d+\.\d+/);
  assert.match(html, /admin-staff-page\.js\?v=1\.3\.0/);
  assert.match(html, /Manage unlocks/);
  assert.match(page, /createStaffRoleLabel/);
  assert.match(page, /deleteStaffRoleLabel/);
  assert.match(page, /listStaffRoleLabels/);
  assert.match(page, /listUserUnlockables/);
  assert.match(page, /setUserUnlockables/);
  assert.match(page, /silent: true/);
  assert.match(page, /replaceUnlockPanel/);
  assert.match(page, /data-unlock-save/);
  assert.match(page, /label:/);
  assert.match(page, /optgroup label="Custom labels"/);
  assert.match(page, /Maps to/);
});

test('admin user unlockables migration mirrors titles and frames', async () => {
  const migration = await read('supabase/migrations/20260723160000_admin_user_unlockables.sql');
  assert.match(migration, /admin_list_user_unlockables/);
  assert.match(migration, /admin_grant_user_unlockable/);
  assert.match(migration, /admin_revoke_user_unlockable/);
  assert.match(migration, /admin_set_user_unlockables/);
  assert.match(migration, /insert into public\.user_titles/);
  assert.match(migration, /insert into public\.user_avatar_frames/);
  assert.match(migration, /selected_title_id = null/);
  assert.match(migration, /selected_frame_id = null/);
  assert.match(migration, /actor_role not in \('owner', 'admin'\)/);
  assert.match(migration, /grant execute on function public\.admin_list_user_unlockables/);
});

test('staff role labels migration keeps permission tiers authoritative', async () => {
  const migration = await read('supabase/migrations/20260722150000_staff_role_labels.sql');
  assert.match(migration, /create table if not exists public\.staff_role_labels/);
  assert.match(migration, /add column if not exists label_id/);
  assert.match(migration, /admin_create_staff_role_label/);
  assert.match(migration, /requested_label_id uuid default null/);
  assert.match(migration, /'roleLabel', staff_label_value/);
  assert.match(migration, /site_roles\.role remains the authorization source of truth/i);
});
