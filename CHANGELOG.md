# Changelog

## 0.1.0 – minimal version

The first version: a panel anyone with a basic Home Assistant can use on day one.

- **The house:** a pixel cottage cut away to show four rooms (living room, kitchen, bedroom
  and bathroom), with a garden, a picket fence and a tree. Tap a room to zoom in, and tap
  things in it.
- **Ambient layer:** a sky that follows `sun.sun` (dawn, day, dusk and a starry night), or,
  without one, a sun worked out from the date and Home Assistant's location, and the
  weather from any `weather.*` entity: clouds, rain on the windows, snow on the roof, fog and
  thunder. The tree and the flowers follow the seasons. Lamps come on room by room in the
  evening, and a cat wanders from room to room (it can be turned off).
- **A welcome header:** a greeting, the time, the date and the weather, over the sky.
- **Celebrations:** a birthday party (bunting, balloons and confetti) from any `calendar.*`
  entity, a Halloween house, a Christmas house and New Year fireworks. More take one line in
  `public/celebrations.js`.
- **Controls, in the house:** the living room's lamp (on, off and brightness, or on and off
  for a smart plug), the speaker on its shelf (play, pause, volume and favourites), and the
  bed for Goodnight, which turns off the lamp, pauses the music and can run a script of your
  own. The fridge's calendar shows today, and there's a rubber duck in the bath.
- **A TV** in the living room, just part of the picture for now: it's on in the evenings, so
  the house looks lived in. The full version will make it a remote.
- Every entity is set in one config file. Anything that isn't there stays part of the
  picture, or isn't drawn, and nothing breaks.
- The cosy theme, including the house's paint and the cat's fur, lives in `public/theme.css`.
- An app icon (the cottage at dusk), so Add to Home Screen gives a proper wee hoose.
- Demo mode with a pretend house, and previews of any date, time, weather, celebration or room.
- The Home Assistant token stays on the server, which only lets through the configured entities.
