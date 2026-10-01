# kiosk/

Setup for the wall-mounted Raspberry Pi 5 (DESIGN §11.2). The Pi is a screen only: it runs Chromium, Tailscale and the night-mode script, and holds no data. **[SETUP.md](SETUP.md)** is the step-by-step guide.

| File | Purpose |
|---|---|
| `SETUP.md` | How to set up the Pi, start to finish. |
| `setup.sh` | One-time setup on the Pi. It installs the autostart, the token file, `swayidle` and the scripts below. |
| `autostart` | labwc's autostart. It replaces the desktop with the on-screen keyboard, `swayidle` and `start.sh`. |
| `start.sh` | Waits until the server answers, opens the kiosk's login link, and restarts Chromium if it ever exits. |
| `display-off-if-night.sh` | Run by `swayidle` after 6 idle minutes. Turns the display off only if it's night: the server decides, or the night hours it last gave if it can't be reached. |
| `display-off.test.js` | Runs that script against a test server, with a fake `wlopm` that records what it would have done. |
