# Setting up the tablet

How to turn a spare tablet into a wall panel: a Home Assistant user for it, a kiosk
browser, and a screen that wakes up when someone walks past.

The tablet itself never logs in to Home Assistant. It only opens the panel's page
(`http://<the computer running the panel>:8080/`), and the panel talks to Home Assistant
for it. So if the tablet walks off, there's no password or token on it.

## A Home Assistant user for the tablet

The panel's token should belong to a user of its own, not your admin account. Then it can be
switched off on its own, and it's clear in Home Assistant's logs what the panel did.

1. In Home Assistant, go to **Settings > People** and choose **Add person**.
2. Give it a name that says what it is, such as *Wall panel*.
3. Turn on **Allow person to login**, and choose a user name and a long password.
4. Turn on **Can only log in from the local network**.
5. Make sure **Administrator** is *off*.
6. Log in as the new user (a private browser window is easiest), make the token as described in
   [README.md](../README.md#the-token), and log out again.

Even a non-admin user's token can call any service in Home Assistant, which is why the panel
only lets through the entities in its config. If you ever think the token has got out, delete
it under that user's profile > Security, and make a new one.

## Fully Kiosk Browser (Android)

[Fully Kiosk Browser](https://www.fully-kiosk.com/) is a browser made for wall panels. It shows
one page full screen, keeps it there, and can wake the screen when someone comes near. The free
version does the basics. Some settings need the paid **PLUS** licence (a one-off fee per
device), and the app marks those with *PLUS* in its settings, so check there as versions change.

Open Fully's settings by swiping in from the left edge, or with a long press if you've turned
swiping off.

### The essentials

- **Web Content Settings > Start URL:** `http://<the computer running the panel>:8080/`
- **Web Content Settings > Enable JavaScript:** on (it is by default).
- **Web Browsing Settings > Enable Pull to Refresh:** off, so a swipe down doesn't reload it.
- **Web Auto Reload > Auto reload on network reconnect:** on, so it comes back after a Wi-Fi blip.
- **Device Management > Keep Screen On:** on.
- **Device Management > Launch on Boot:** on, so it comes back by itself after a restart.

### Dimming the screen

The panel's sky darkens at night by itself, but the screen's own brightness is up to the tablet:

- **Device Management > Screen Brightness** sets how bright it is in the day.
- **Screensaver:** after a few quiet minutes, Fully can switch to a screensaver with its own,
  lower brightness (**Screensaver Brightness**). A tap brings the panel back. Try the
  screensaver's settings to choose what it shows while it's dimmed.
- **Sleep and wake times:** Fully can turn the screen off overnight and on again in the
  morning. Where this setting lives, and whether it needs PLUS, has moved between versions, so
  look under *Device Management* and *Power Settings*.
- From Home Assistant, the **Fully Kiosk Browser integration** (below) can set the
  brightness. An automation could dim it at sunset, and your Goodnight script could turn the
  screen down too.

### Waking up when someone walks past

- **Motion Detection (PLUS)** uses the tablet's front camera to wake the screen when someone
  moves in front of it. The camera is only used to spot movement. Fully doesn't save or send the
  pictures unless you set that up yourself. Set **Screen On on Motion** and choose how sensitive
  it should be. A hallway with a window may need it less sensitive so passing clouds don't
  wake it.
- Without PLUS, use the screensaver instead of turning the screen off: it stays dimly on, and
  a tap wakes it.

### Locking it down

- **Kiosk Mode (PLUS)** stops guests leaving the panel: no home button, no notifications, no
  other apps. It's protected by a PIN, so set one you'll remember.
- Without it, Android's own **App pinning** (Settings > Security) keeps the tablet on Fully until
  someone unpins it.

### Controlling the tablet from Home Assistant

Fully can be controlled over your network (**Remote Administration**, a PLUS setting, protected
by a password). Home Assistant's
[Fully Kiosk Browser integration](https://www.home-assistant.io/integrations/fully_kiosk/)
then gives you the tablet as a device, with entities for things like:

- the screen (on and off) and its brightness
- the screensaver
- loading the start page again, or a different page
- the battery level and whether it's charging
- motion from the camera (with Motion Detection on), which can trigger other automations

All of these work in automations and scripts. For example, your Goodnight script could turn the
tablet's brightness down, and a morning automation could turn it back up.

## Other tablets

- **iPad:** open the panel in Safari and choose **Share > Add to Home Screen**, so it opens
  full screen. **Guided Access** (Settings > Accessibility) keeps it there, and
  **Auto-Lock: Never** (Settings > Display & Brightness) keeps it awake, so it should stay on
  charge.
- **Any other browser:** the panel is an ordinary web page, so anything that can show one
  full screen will do.

## Looking after the tablet

- A tablet on charge all day, every day can swell its battery over the years. If your tablet
  can't limit its own charging, a smart plug with an automation can do it: charge it from
  20% to 80%, using the battery level from the Fully Kiosk integration.
- Mount it at about eye height, out of direct sunlight, and near a socket.
- Turn off the tablet's own notifications and updates pop-ups, so guests don't see them.
