# scripts/

Command-line scripts, run by hand, by CI or by the VM's services.

| File | Purpose |
|---|---|
| `backup.js` | Writes a database snapshot and the JSON export into `BACKUP_DIR`, keeping the newest dated ones. `vm/backup.sh` runs it nightly, and `vm/deploy.sh` runs it before each deploy. |
| `build-words.js` | Rebuilds `src/data/words.json`, the word-of-the-day list, from the HSK 1–3 vocabulary (see the README's Credits). Only needed to change the list. |
| `check-secrets.sh` | CI's secret check: fails if a `.env` file is tracked, or if a private Google Calendar address appears in the repo or the build (DESIGN §13). |
