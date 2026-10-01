# Connecting claude.ai

Written for: Luke, doing this once, after the connector PR is merged. About 15 minutes. The design is in [docs/CONNECTOR.md](../docs/CONNECTOR.md).

This opens one public door, port 8443, with only the claude.ai connector behind it, and connects claude.ai chats to it. The dashboard itself, on the usual address, stays reachable only on your tailnet. The agent's suggest-only connector comes later, with its own steps.

## 1. Deploy

From the laptop, once `main`'s CI is green:

```sh
vm/deploy.sh
```

It runs the two new migrations (the sign-in tables, and a column in the change record) after its usual snapshot.

## 2. Turn the connector on, on the server

```sh
ssh dashboard
sudo bash /opt/dashboard/vm/oauth-client.sh https://dashboard.tail354c76.ts.net:8443
sudo systemctl restart dashboard
sudo journalctl -u dashboard -n 5
```

- **The script** adds `PUBLIC_URL`, the client ID and secret, and the refresh-token key to `/opt/dashboard/.env`. It never changes anything already there, so running it twice is harmless.
- **The journal** should end with `claude.ai connector on http://127.0.0.1:3002, public as https://dashboard.tail354c76.ts.net:8443`.

## 3. Open port 8443 with Tailscale Funnel

Still on the VM:

```sh
sudo tailscale funnel --bg --https=8443 http://127.0.0.1:3002
tailscale funnel status
```

- **If it says Funnel isn't enabled** for this tailnet or machine, it prints a link. Open it, approve, and run the command again. That adds the `funnel` attribute to your tailnet policy.
- **`tailscale funnel status`** should show two entries:
  - `https://dashboard.tail354c76.ts.net:8443 (Funnel on)`, proxying to `http://127.0.0.1:3002`;
  - `https://dashboard.tail354c76.ts.net (tailnet only)`, the dashboard as before.

  If port 443 ever says Funnel on, turn it off at once: `sudo tailscale funnel --https=443 off`.

## 4. Check the door from outside

On your phone, with **Wi-Fi off and Tailscale disconnected**:

| Open | You should see |
|---|---|
| `https://dashboard.tail354c76.ts.net:8443/api/health` | `{"error":{"message":"Not found",…}}`. The API isn't there. |
| `https://dashboard.tail354c76.ts.net:8443/.well-known/oauth-authorization-server` | A short JSON description of the sign-in |
| `https://dashboard.tail354c76.ts.net` | Nothing loads. The dashboard is tailnet-only. |

Then reconnect Tailscale. On the VM, `sudo journalctl -u dashboard -n 20 | grep public` shows those requests. If they say `from=` followed by your phone's carrier address, rather than `from=unknown`, Funnel passes visitors' addresses on and the per-visitor limits work. Note which, for DECISIONS.md.

## 5. Add the connector in claude.ai

Do this on the **laptop**, in the browser where you're logged in to the dashboard, with Tailscale on.

1. On the VM, show the client ID and secret: `sudo grep '^OAUTH_CHAT_CLIENT' /opt/dashboard/.env`. Treat the secret like your tokens: paste it only into claude.ai.
2. In claude.ai: **Customize → Connectors → Add custom connector**.
   - Name: `Dashboard`
   - URL: `https://dashboard.tail354c76.ts.net:8443/mcp`
   - **Advanced settings** (or "Use your own OAuth client"): the client ID and the client secret.
3. Click **Add**, then **Connect**. Your browser goes to the dashboard's **Connect claude.ai** page. Check that it says *Dashboard* and *can't delete anything*, then tap **Approve**. You land back in claude.ai, connected.

## 6. Set the connector's permissions in claude.ai

Under **Customize → Connectors**, open each connector:

| Connector | Setting |
|---|---|
| Dashboard | Reading tools: **Always allow**. Writing tools: your choice. **Always allow** is smoothest; **Needs approval** has claude.ai ask before each change. |
| Gmail | Send, draft, modify, label and delete: **Blocked** |
| Google Calendar | Create, update and delete: **Blocked** |
| Google Drive | Create, upload and share: **Blocked** |

The Gmail, Calendar and Drive blocks apply to every chat and task on your account. They're what stop a chat, or later the agent, that's been fooled by an email from sending your data anywhere (docs/CONNECTOR.md §2, §10).

## 7. Try it

In a new claude.ai chat with the Dashboard connector on:

1. *"What's on my dashboard today?"*
2. *"Add a task to test the connector, due Friday, low priority."*
3. On the dashboard, the task appears within 30 seconds with a ✦. Tap the ✦: it says *Added by Claude (claude.ai)*. Tap **Undo**.
4. On `/manage`, under **Claude**, the connection is listed, and the change shows under **Claude's changes**.

**If you're testing the agent's email reading** as a scheduled task: it can reach this connector too, and could write to the dashboard directly. Run the trial as chats you start yourself for now, or check Claude's changes after its runs (docs/CONNECTOR.md §14).

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| claude.ai says it couldn't connect | Funnel isn't on (step 3), or the service didn't pick up `.env` (step 2's journal line). `sudo journalctl -u dashboard -n 30 \| grep public` shows whether claude.ai's requests arrive. |
| The Connect page doesn't load | This device isn't on the tailnet. |
| "Started in a different browser" | The Connect click and the approval happened in different browsers. Start again from claude.ai in the browser where you're logged in to the dashboard. |
| "This sign-in has expired" | More than 5 minutes passed. Click Connect again. |
| claude.ai forgets the client ID and secret after adding | A known claude.ai issue ([claude-ai-mcp#344](https://github.com/anthropics/claude-ai-mcp/issues/344)). Remove the connector and add it again. If it keeps happening, tell me and we'll switch to claude.ai's published client identity (docs/CONNECTOR.md §12). |
| The dock says "claude.ai disconnected: reconnect" | The connection went 30 days unused, or a copied token was detected. Click **Connect** in claude.ai again. `/manage` shows which. |

## Turning it off

| How much | How |
|---|---|
| One connection | `/manage` → **Claude** → **Revoke** |
| Every chat connection, at once | `/manage` → **Claude** → **Switch off** (on the kiosk too). Turn it back on and reconnect from claude.ai. |
| The door itself | On the VM: `sudo tailscale funnel --https=8443 off`. Nothing from the internet reaches the server any more. |
| A new client secret | Delete the `OAUTH_CHAT_CLIENT_SECRET` line from `/opt/dashboard/.env`, run `oauth-client.sh` again, restart, then remove and re-add the connector in claude.ai with the new secret. |
