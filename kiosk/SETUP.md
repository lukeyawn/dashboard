# Setting up the kiosk Pi

Written for: Luke, once the server is running ([vm/SETUP.md](../vm/SETUP.md)). About 30 minutes. The design is in [DESIGN §11.2](../docs/DESIGN.md#112-kiosk-the-pi).

The Pi only shows the dashboard. It holds no data, so it can be switched off or reinstalled at any time.

## 1. Raspberry Pi OS (you)

1. Flash **Raspberry Pi OS (64-bit), with desktop**, using Raspberry Pi Imager. In its settings, set a username, Wi-Fi and the time zone (**America/Chicago**), and turn on SSH.
2. Boot it on the touchscreen and finish any first-boot prompts.
3. Raspberry Pi Configuration:
   - **Display → Screen Blanking: off.** The kiosk's own night mode decides when the screen turns off; blanking would turn it off during the day.
   - **Display → On-screen keyboard: enabled.** That's squeekboard, for typing in the editors.

## 2. Tailscale (you)

```sh
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up        # open the link and approve the Pi
curl -fsS https://dashboard.<tailnet>.ts.net/api/health && echo reachable
```

## 3. The kiosk scripts

```sh
git clone https://github.com/lukeyawn/dashboard ~/dashboard
DASHBOARD_URL=https://dashboard.<tailnet>.ts.net ~/dashboard/kiosk/setup.sh
```

It asks for the **`KIOSK_TOKEN`** from the server's `.env` (not the `API_TOKEN`) and saves it where only you can read it. Then it installs `swayidle` and `wlopm`, sets the time zone, and replaces the desktop's autostart with the kiosk's. Your old autostart is kept as `autostart.before-dashboard`.

`sudo reboot`. The Pi now boots straight into the dashboard, logged in.

## What runs at boot

| Piece | What it does |
|---|---|
| `kiosk/start.sh` | Waits until the server answers, opens the login link with the kiosk token, and restarts Chromium if it ever exits |
| `swayidle` with `kiosk/display-off-if-night.sh` | After 6 idle minutes, turns the display off, but only at night. A touch turns it back on. |
| `squeekboard` | The on-screen keyboard |

The page itself darkens after 5 idle minutes at night, reloads after a deploy, and reloads around 04:00 (DESIGN §6.4).

## Changing things later

- **Update the scripts:** `cd ~/dashboard && git pull`, then reboot.
- **New kiosk token** (after changing `KIOSK_TOKEN` on the server): `rm ~/.config/dashboard/kiosk-token` and run `setup.sh` again.
- **Back to the normal desktop:** `mv ~/.config/labwc/autostart.before-dashboard ~/.config/labwc/autostart`, or delete `~/.config/labwc/autostart`, then reboot.
- **Checking the blur's speed** (DESIGN §16): with the kiosk running, `vcgencmd measure_temp` should stay reasonable, and swiping between screens of editors should feel smooth.
