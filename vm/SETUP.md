# Setting up the server

Written for: Luke, doing this once. About an hour. The design is in [DESIGN §11.1](../docs/DESIGN.md#111-server-a-google-cloud-vm).

You'll create four things in Google Cloud (a project, a storage bucket, a service account and the VM), then run one script on the VM. Steps marked **(you)** need your accounts; everything else is scripted.

## 1. Google Cloud project and budget alert (you)

1. Go to <https://console.cloud.google.com>, sign in, and create a project named `dashboard`.
2. Billing → link a billing account. The free tier still needs a card on file.
3. Billing → **Budgets & alerts** → Create budget: scope the `dashboard` project, amount **$1**, alerts at 50% and 100%. Any charge at all then emails you.

## 2. The backup bucket (you)

Cloud Storage → Buckets → **Create**:

| Setting | Value |
|---|---|
| Name | something unique, e.g. `dashboard-backups-lukeyawn` |
| Location type | **Region**, `us-central1` (the free tier only covers US regions) |
| Storage class | Standard |
| Public access | **Enforce public access prevention** (on) |
| Access control | Uniform |
| Soft delete | Off. Litestream already keeps 30 days of history, and soft-deleted files count toward the 5 GB free tier. |

## 3. A service account that can reach only that bucket (you)

1. IAM & Admin → Service accounts → **Create**: name `dashboard-vm`. Skip the optional roles.
2. Back on the bucket → **Permissions** → Grant access: principal `dashboard-vm@<project>.iam.gserviceaccount.com`, role **Storage Object Admin**.

It gets this one bucket and nothing else in your account.

## 4. The VM (you)

Compute Engine → VM instances → **Create instance**:

| Setting | Value | Why |
|---|---|---|
| Name | `dashboard` | becomes its Tailscale name |
| Region / zone | `us-central1`, any zone | free tier |
| Machine type | **e2-micro** | the only free one |
| VM provisioning model | **Standard**, not Spot | the free tier needs a non-preemptible VM |
| Boot disk | Debian 13, **Standard persistent disk**, 30 GB | "Balanced" (10 GB) is the default and isn't free |
| Disk snapshots / backup schedule | **None** | snapshots aren't free, and Litestream already backs up the data |
| Service account | `dashboard-vm` | |
| Access scopes | Allow full access to all Cloud APIs | the account's own permissions are what limit it |
| Firewall | leave HTTP and HTTPS **unchecked** | nothing should reach it from the internet |

**The page's monthly estimate (about $7) is expected.** It always shows full price; the free tier is taken off the bill itself, as "Other savings" in Billing → Reports. A day after creating the VM, check that report: every cost should have a matching saving. The $1 budget alert from step 1 catches anything that doesn't.

Then open it with the **SSH** button in the console and run the commands below. They fetch `setup.sh` from `main`, so phase 3 must be merged first.

```sh
curl -fsSLO https://raw.githubusercontent.com/lukeyawn/dashboard/main/vm/setup.sh
sudo LITESTREAM_BUCKET=<your bucket name> bash setup.sh
```

It installs Node 24, Litestream and rclone, creates a `dashboard` user, clones the repo to `/opt/dashboard`, writes `/opt/dashboard/.env` with two new random tokens, gives your user passwordless `sudo` (the deploy script needs it over Tailscale SSH), and starts the server, Litestream and the nightly backup timer. If it stops partway, fix the cause and run the same two commands again: it picks up where it left off and pulls the latest code.

## 5. Tailscale (you)

Create an account at <https://login.tailscale.com> (sign in with Google). In its admin console, **DNS page**: make sure **MagicDNS** is on and turn on **HTTPS Certificates**. `serve` needs them; without them it prints a link instead of serving.

Still in the console SSH window:

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh          # open the link it prints and approve the machine
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3000
sudo tailscale serve status      # shows the dashboard's address
```

The address is `https://dashboard.<tailnet>.ts.net:8443`, where `<tailnet>` is your tailnet's name (like `tail1a2b3c`; it's also on the admin console's DNS page). It's on port 8443 because 443 is kept for the claude.ai connector, the only thing ever made public ([CONNECTOR.md](CONNECTOR.md)). Then, in the admin console's **Machines** page: `dashboard` → ⋯ → **Disable key expiry**, or its login lapses after 180 days and the server drops off your network.

**On the laptop**, Tailscale goes in two places: the Windows app (from <https://tailscale.com/download>) for the browser, and inside WSL for SSH, the deploy script and Claude:

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

`ssh dashboard` has to log in as your VM username (the name before the `@` in the console SSH prompt). If it differs from your WSL username, add this to `~/.ssh/config` in WSL:

```
Host dashboard
    User <your VM username>
```

Test from WSL: `curl -fsS https://dashboard.<tailnet>.ts.net:8443/api/health && echo reachable` and `ssh dashboard true`.

**Only once `ssh dashboard` works**, close the VM to the internet: VPC network → **Firewall** → delete `default-allow-ssh`, `default-allow-rdp` and `default-allow-icmp`. Delete them before that, and you lose the console's SSH button with no other way in.

## 6. Fill in .env (you)

```sh
ssh dashboard
sudo -u dashboard nano /opt/dashboard/.env
```

Set `GCAL_ICS_URL` to the calendar's **Secret address in iCal format** (Google Calendar → Settings → your calendar → Integrate calendar). Values can't contain spaces. Then `sudo systemctl restart dashboard`.

Keep a copy of `API_TOKEN` in your password manager: it's what you type at the login screen, and what Claude's MCP server uses. `KIOSK_TOKEN` goes on the Pi in phase 6.

## 7. Google Drive for the nightly copy (you)

The VM has no browser, so the Google sign-in happens on Windows. Start on the VM, which prints the exact command to run there:

```sh
ssh dashboard
sudo -u dashboard rclone config
```

New remote → name **`drive`** → at `Storage>`, **type the word `drive`** (picking a number makes it easy to land on "Google Cloud Storage", which is not Drive) → leave client id and secret **blank** (rclone's own is fine for two small files a night; your own OAuth app would expire every 7 days while in "Testing") → scope **`drive.file`** (it can only see files it makes itself) → no service account → no advanced config → **No** to "Use web browser to automatically authenticate". It prints `rclone authorize "drive" "…"`.

On Windows, in PowerShell:

```powershell
winget install Rclone.Rclone
rclone authorize "drive" "…"      # exactly what the VM printed
```

Sign in in the browser that opens, copy the token PowerShell prints, paste it at the VM's `config_token>` prompt, then no shared drive → confirm. Check: `sudo -u dashboard rclone lsd drive:` prints nothing and no error. The token is a credential: paste it only into that prompt.

## 8. First deploy and a test restore

From the laptop, once main's CI is green:

```sh
vm/deploy.sh
```

Until the first deploy, the address answers `/api/health` but shows no page. To see a backup happen without waiting for 03:00: `ssh dashboard sudo systemctl start backup.service`, then look for a `dashboard-backups` folder in Google Drive.

Then follow [RESTORE.md](RESTORE.md) once, on a copy, so you know the backups work before real data depends on them. Check the first nightly backup the next morning: `ls /var/lib/dashboard/backups` on the VM, and a `dashboard-backups` folder in Google Drive.

## 9. claude.ai (optional)

To use the dashboard from claude.ai chats, follow [CONNECTOR.md](CONNECTOR.md).
