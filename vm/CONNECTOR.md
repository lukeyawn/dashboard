# Connecting claude.ai

Written for: Luke, doing this once, after the connector PR is merged. About 15 minutes. The design is in [docs/CONNECTOR.md](../docs/CONNECTOR.md).

This opens one public door, port 443, with only the claude.ai connector behind it, and connects claude.ai chats to it. The dashboard itself moves to port 8443, `https://dashboard.tail354c76.ts.net:8443`, which stays reachable only on your tailnet. It has to be this way round, because claude.ai's servers only connect to port 443 (docs/CONNECTOR.md §3). The scheduled agent's own connector is a second one, added afterwards: see [The agent's connector](#the-agents-connector).

**Already set up on port 8443?** Follow [Moving the door to port 443](#moving-the-door-to-port-443) instead, then steps 6 and 7.

## 1. Deploy

From the laptop, once `main`'s CI is green:

```sh
vm/deploy.sh
```

It runs the two new migrations (the sign-in tables, and a column in the change record) after its usual snapshot.

## 2. Turn the connector on, on the server

```sh
ssh dashboard
sudo bash /opt/dashboard/vm/oauth-client.sh https://dashboard.tail354c76.ts.net
sudo systemctl restart dashboard
sudo journalctl -u dashboard -n 5
```

- **The script** adds `PUBLIC_URL`, `TAILNET_URL` (the same address on `:8443`), the client ID and secret, and the refresh-token key to `/opt/dashboard/.env`. It never changes anything already there, so running it twice is harmless.
- **The journal** should end with `claude.ai connector on http://127.0.0.1:3002, public as https://dashboard.tail354c76.ts.net`.

## 3. Move the dashboard to 8443, and open 443 with Tailscale Funnel

Still on the VM. The order matters: port 443 must never be public while it still leads to the dashboard.

```sh
sudo tailscale serve --https=443 off
sudo tailscale serve --bg --https=8443 http://127.0.0.1:3000
sudo tailscale funnel --bg --https=443 http://127.0.0.1:3002
tailscale funnel status
```

- **If it says Funnel isn't enabled** for this tailnet or machine, it prints a link. Open it, approve, and run the last command again. That adds the `funnel` attribute to your tailnet policy.
- **`tailscale funnel status`** should show two entries:
  - `https://dashboard.tail354c76.ts.net (Funnel on)`, proxying to `http://127.0.0.1:3002`;
  - `https://dashboard.tail354c76.ts.net:8443 (tailnet only)`, proxying to `http://127.0.0.1:3000`, the dashboard.

  If port 8443 ever says Funnel on, turn it off at once: `sudo tailscale funnel --https=8443 off`.

Then change the dashboard's address everywhere you use it (see [Your devices](#your-devices)).

## 4. Check the door from outside

On your phone, with **Wi-Fi off and Tailscale disconnected**:

| Open | You should see |
|---|---|
| `https://dashboard.tail354c76.ts.net/api/health` | `{"error":{"message":"Not found",…}}`. The API isn't there. |
| `https://dashboard.tail354c76.ts.net/.well-known/oauth-authorization-server` | A short JSON description of the sign-in |
| `https://dashboard.tail354c76.ts.net:8443` | Nothing loads. The dashboard is tailnet-only. |

Then reconnect Tailscale. On the VM, `sudo journalctl -u dashboard -n 20 | grep public` shows those requests, with `from=` followed by your phone's carrier address.

## 5. Add the connector in claude.ai

Do this on the **laptop**, in the browser where you're logged in to the dashboard, with Tailscale on.

1. On the VM, show the client ID and secret: `sudo grep '^OAUTH_CHAT_CLIENT' /opt/dashboard/.env`. Treat the secret like your tokens: paste it only into claude.ai.
2. In claude.ai: **Customize → Connectors → Add custom connector**.
   - Name: `Dashboard`
   - URL: `https://dashboard.tail354c76.ts.net/mcp`, with no port
   - **Advanced settings** (or "Use your own OAuth client"): the client ID and the client secret.
3. Click **Add**, then **Connect**. Your browser goes to the dashboard's **Connect claude.ai** page, on `:8443`. Check that it says *Dashboard* and *can't delete anything*, then tap **Approve**. You land back in claude.ai, connected.

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

**If you're testing the agent's email reading** as a scheduled task, give it [its own connector](#the-agents-connector) first. It can reach this one too, and its changes would then count as a chat's.

## The agent's connector

Written for: Luke, once the agent's-connector PR is merged and deployed. About 10 minutes. The design is in [docs/AGENT.md](../docs/AGENT.md). This is a second connector, `/mcp/agent`, for the scheduled agent (phase 9). It adds and changes things directly, like chats, but can't delete anything, change settings or start night mode, and it stops at 30 changes a day. Its changes are recorded as *the agent* and show on the dock as "✦ *n* new from the agent".

1. **Make its client, on the VM.** The same script adds only what's missing, so the chat connector's ID and secret stay as they are:
   ```sh
   ssh dashboard
   sudo bash /opt/dashboard/vm/oauth-client.sh
   sudo systemctl restart dashboard
   sudo journalctl -u dashboard -n 5
   ```
   It should say `Added to /opt/dashboard/.env: OAUTH_AGENT_CLIENT_ID OAUTH_AGENT_CLIENT_SECRET`, and the journal should end with the `claude.ai connector on …` line as before.
2. **Add it in claude.ai,** on the laptop, in the browser where you're logged in to the dashboard, with Tailscale on:
   - Show its client ID and secret: `sudo grep '^OAUTH_AGENT_CLIENT' /opt/dashboard/.env`.
   - **Customize → Connectors → Add custom connector.** Name: `Dashboard (agent)`. URL: `https://dashboard.tail354c76.ts.net/mcp/agent`. Under **Advanced settings**, the agent's client ID and secret (not the chat's).
   - **Add**, then **Connect**. The Connect page should say *Dashboard (agent)* and *no deleting*. Tap **Approve**.
3. **Its permissions:** reading tools **Always allow**, and writing tools **Always allow** too, because a scheduled run has nobody to approve each change. The chip and Undo are the review.
4. **Try it.** In a new chat, turn on **Dashboard (agent)** and turn off **Dashboard**, then:
   1. *"Add a task to test the agent's connector."*
   2. Within 30 seconds the dock shows **✦ 1 new from the agent**. Tap it. The task is listed, with **Undo**. Tap **Undo**, then **Done**. The chip goes away, on the kiosk too.
   3. On `/manage`, under **Claude**: *The agent: on*, with *1 of 30 agent changes today*. The change is listed under **Claude's changes** as *The agent*.
   4. *"Delete a task"* and *"Start night mode"*: it has no tools for either, and should say so.
5. **When you set up the scheduled task (phase 9):** give it **Dashboard (agent)**. If claude.ai lets a scheduled task leave a connector out, leave out **Dashboard**, the chat's. Otherwise its instructions say to use only its own.

If it uses up its 30 changes, the dock says *Today's limit of 30 agent changes is used up*, and it can write again after midnight.

## Your devices

The dashboard's address is now `https://dashboard.tail354c76.ts.net:8443`. You stay logged in, because cookies don't depend on the port. Update:

- **Bookmarks, and the phone's home-screen icon.** Remove the icon and add it again from the new address.
- **Claude Code's dashboard MCP server.** In WSL, from the repo, with your `API_TOKEN`:
  ```sh
  claude mcp remove dashboard --scope user
  claude mcp add dashboard --scope user \
    --env DASHBOARD_URL=https://dashboard.tail354c76.ts.net:8443 \
    --env DASHBOARD_TOKEN=<API_TOKEN> \
    -- node "$(pwd)/mcp/index.js"
  ```
- **The kiosk,** once it's set up: `kiosk/SETUP.md` already uses `:8443`.

## Moving the door to port 443

For a server where the door was set up on port 8443. claude.ai never reached it there. From the laptop, on `main` with this change pulled:

1. **Change the addresses in `.env` first.** The new server refuses to start with a port in `PUBLIC_URL`, so this comes before the deploy. It runs the new `oauth-client.sh` from your laptop's copy:
   ```sh
   ssh dashboard "sudo sed -i '/^PUBLIC_URL=/d' /opt/dashboard/.env"
   ssh dashboard sudo bash -s -- https://dashboard.tail354c76.ts.net < vm/oauth-client.sh
   ```
   It should say `Added to /opt/dashboard/.env: PUBLIC_URL TAILNET_URL`. The client ID, secret and refresh key stay as they were.
2. **Deploy:** `vm/deploy.sh`. Then `ssh dashboard sudo journalctl -u dashboard -n 5` should end with `public as https://dashboard.tail354c76.ts.net`.
3. **Swap the ports,** on the VM. Again, 443 is never public while it leads to the dashboard:
   ```sh
   ssh dashboard
   sudo tailscale funnel --https=8443 off
   sudo tailscale serve --https=443 off
   sudo tailscale serve --bg --https=8443 http://127.0.0.1:3000
   sudo tailscale funnel --bg --https=443 http://127.0.0.1:3002
   tailscale funnel status
   ```
   Check the status as in step 3, and the door from outside as in step 4.
4. **Update [your devices](#your-devices).**
5. **In claude.ai,** remove the Dashboard connector and add it again with `https://dashboard.tail354c76.ts.net/mcp` and the same client ID and secret, as in step 5. Then steps 6 and 7.

## If something goes wrong

| Symptom | Likely cause |
|---|---|
| claude.ai says it couldn't connect | Funnel isn't on for 443 (step 3), the connector's URL has a port, or the service didn't pick up `.env` (step 2's journal line). `sudo journalctl -u dashboard -n 30 \| grep public` shows whether claude.ai's requests arrive. |
| The service won't start after a deploy | `sudo journalctl -u dashboard -n 5` says which setting is wrong. A `PUBLIC_URL` with a port, or a missing `TAILNET_URL`, means [Moving the door to port 443](#moving-the-door-to-port-443), step 1. |
| The dashboard shows `{"error":{"message":"Not found"…` | That's the public door. The dashboard is on `:8443`. |
| The Connect page doesn't load | This device isn't on the tailnet. |
| "Started in a different browser" | The Connect click and the approval happened in different browsers. Start again from claude.ai in the browser where you're logged in to the dashboard. |
| "This sign-in has expired" | More than 5 minutes passed. Click Connect again. |
| claude.ai forgets the client ID and secret after adding | A known claude.ai issue ([claude-ai-mcp#344](https://github.com/anthropics/claude-ai-mcp/issues/344)). Remove the connector and add it again. If it keeps happening, tell me and we'll switch to claude.ai's published client identity (docs/CONNECTOR.md §12). |
| The dock says "claude.ai disconnected: reconnect" | The connection went 30 days unused, or a copied token was detected. Click **Connect** in claude.ai again. `/manage` shows which. |

## Turning it off

| How much | How |
|---|---|
| One connection | `/manage` → **Claude** → **Revoke** |
| Every chat connection, at once | `/manage` → **Claude** → **Switch off** beside *claude.ai chats* (on the kiosk too). Turn it back on and reconnect from claude.ai. |
| The agent, at once | `/manage` → **Claude** → **Switch off** beside *The agent*. Chats keep working. |
| The door itself | On the VM: `sudo tailscale funnel --https=443 off`. Nothing from the internet reaches the server any more. The dashboard on 8443 is unaffected. |
| A new client secret | Delete the `OAUTH_CHAT_CLIENT_SECRET` line (or `OAUTH_AGENT_CLIENT_SECRET`, for the agent) from `/opt/dashboard/.env`, run `oauth-client.sh` again, restart, then remove and re-add that connector in claude.ai with the new secret. |
