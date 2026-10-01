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
| Boot disk | Debian 13, **Standard persistent disk**, 30 GB | "Balanced" is the default and isn't free |
| Service account | `dashboard-vm` | |
| Access scopes | Allow full access to all Cloud APIs | the account's own permissions are what limit it |
| Firewall | leave HTTP and HTTPS **unchecked** | nothing should reach it from the internet |

Then open it with the **SSH** button in the console and run the commands below. They fetch `setup.sh` from `main`, so phase 3 must be merged first.

```sh
curl -fsSLO https://raw.githubusercontent.com/lukeyawn/dashboard/main/vm/setup.sh
sudo LITESTREAM_BUCKET=<your bucket name> bash setup.sh
```

It installs Node 24, Litestream and rclone, creates a `dashboard` user, clones the repo to `/opt/dashboard`, writes `/opt/dashboard/.env` with two new random tokens, and starts the server, Litestream and the nightly backup timer.

## 5. Tailscale (you)

Still in the console SSH window:

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh          # open the link it prints and approve the machine
sudo tailscale serve --bg 3000
```

In the [Tailscale admin console](https://login.tailscale.com/admin): turn on **MagicDNS** and **HTTPS certificates** (DNS page) if they aren't already. The dashboard is now at `https://dashboard.<tailnet>.ts.net`, reachable only from your devices.

Then close the VM to the internet: VPC network → **Firewall** → delete `default-allow-ssh`, `default-allow-rdp` and `default-allow-icmp`. From now on, SSH goes through Tailscale: `ssh dashboard` from the laptop.

## 6. Fill in .env (you)

```sh
ssh dashboard
sudo -u dashboard nano /opt/dashboard/.env
```

Set `GCAL_ICS_URL` to the calendar's **Secret address in iCal format** (Google Calendar → Settings → your calendar → Integrate calendar). Values can't contain spaces. Then `sudo systemctl restart dashboard`.

Keep a copy of `API_TOKEN` in your password manager: it's what you type at the login screen, and what Claude's MCP server uses. `KIOSK_TOKEN` goes on the Pi in phase 6.

## 7. Google Drive for the nightly copy (you)

The VM has no browser, so rclone's sign-in happens on the laptop:

```sh
# on the laptop (install rclone first: https://rclone.org/install/)
rclone authorize drive --drive-scope drive.file
```

Sign in, then copy the token it prints. On the VM:

```sh
sudo -u dashboard rclone config
```

New remote → name **`drive`** → type **drive** → leave client id and secret blank → scope **`drive.file`** (it can only see files it makes itself) → no advanced config → **No** to auto config → paste the token → no shared drive → confirm.

## 8. First deploy and a test restore

From the laptop, once main's CI is green:

```sh
vm/deploy.sh
```

Then follow [RESTORE.md](RESTORE.md) once, on a copy, so you know the backups work before real data depends on them. Check the first nightly backup the next morning: `ls /var/lib/dashboard/backups` on the VM, and a `dashboard-backups` folder in Google Drive.
