/**
 * Validates starlight-database-backup-v90.2 shape for disposable restore drills.
 * Does not touch production data.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REQUIRED_KEYS = [
  'format',
  'exportedAt',
  'series',
  'categories',
  'subcategories',
  'variants',
  'finishes',
  'tags',
  'tagAssignments',
  'cards',
  'boosters',
  'boosterSlots',
  'boosterSlotRates',
  'boosterRewardCards'
];

const EXPECTED_FORMAT = 'starlight-database-backup-v90.2';

export function validateBackupShape(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return ['Backup root must be a JSON object.'];
  }
  if (payload.format !== EXPECTED_FORMAT) {
    errors.push(`Expected format ${EXPECTED_FORMAT}, got ${String(payload.format)}`);
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in payload)) errors.push(`Missing key: ${key}`);
  }
  for (const key of REQUIRED_KEYS.filter((k) => k !== 'format' && k !== 'exportedAt')) {
    if (key in payload && !Array.isArray(payload[key])) {
      errors.push(`Key ${key} must be an array.`);
    }
  }
  return errors;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  const fixturePath = join(dirname(thisFile), '..', 'tests', 'fixtures', 'database-backup-v90.2.sample.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const errors = validateBackupShape(fixture);
  if (errors.length) {
    console.error('Backup shape validation failed:');
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Backup shape OK (${REQUIRED_KEYS.length} keys, format ${EXPECTED_FORMAT}).`);
}
