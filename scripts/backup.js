// The nightly backup (DESIGN §2, §11): `node scripts/backup.js [label]`.
// Writes a snapshot and the JSON export into BACKUP_DIR, keeping the newest
// BACKUP_KEEP dated ones. vm/backup.sh then copies them to Google Drive.
// The label defaults to today's date; deploys pass their own (pre-deploy-<sha>).
import { today } from '../shared/dates.js';
import { prune, snapshot } from '../server/backup.js';
import { openDatabase } from '../server/db.js';

const {
    DATABASE = 'data/dashboard.db',
    BACKUP_DIR = 'data/backups',
    BACKUP_KEEP = '14',
} = process.env;

const label = process.argv[2] ?? today();
const db = openDatabase(DATABASE);
const { dbPath, jsonPath } = snapshot(db, BACKUP_DIR, label);
db.close();
console.log(`Wrote ${dbPath} and ${jsonPath}`);

const deleted = prune(BACKUP_DIR, Number(BACKUP_KEEP));
if (deleted.length) console.log(`Removed old backups: ${deleted.join(', ')}`);
