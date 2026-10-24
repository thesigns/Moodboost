# Moodboost

A simple web app that lifts your mood, built on the fact that laughter is contagious.

One laughing face appears on screen, then another joins, and another, until a whole crowd is laughing. Every character moves its mouth, eyes and body in time with a real laughter recording. Press Start and let it get to you.

Moodboost is a mood booster, not a therapeutic tool.

## How it works

- The first 12 characters join every 6 seconds. Each one has its own laughter recording (men, women, children).
- After that the crowd keeps growing, faster and faster, up to 120 characters (fewer on a phone, as many as fit). They add no new sound, since 12 voices already sound like a crowd, but each laughs in the rhythm of one of the recordings.
- The laughter goes on until you press **Stop**. If the tab stays hidden for more than 3 minutes, the sound fades out gently.
- Characters are drawn procedurally in SVG with random hair styles, skin tones and small traits (beards, glasses, earrings, freckles), so every session's crowd looks different.
- Motion follows the loudness of each recording, analysed up front when the files load, so the mouths catch the rhythm of every "ha-ha".

## Running locally

The app is a static site with no build step, but it needs an HTTP server (browsers won't load the recordings or the JS modules from `file://`).

```sh
python -m http.server
```

Then open http://localhost:8000.

## Publishing on GitHub Pages

1. Push the repository to GitHub.
2. In **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. After a moment the app is live at `https://<user>.github.io/<repository>/`.

GitHub Pages serves the site over HTTPS, which the screen wake lock (keeping the screen on during a session) requires.

## Requirements

- Current desktop browsers: Chrome, Firefox, Safari, Edge.
- Phones: Chrome on Android, Safari on iOS 16.4 or later (on iPhone the sound plays even in silent mode).
- The app follows system settings: light and dark theme, and reduced motion (`prefers-reduced-motion`).

## Privacy

The app collects no data and connects to nothing but its own files. The font is hosted with the app, not loaded from Google Fonts.

## Project structure

```
index.html        page and screens
style.css         styling, themes, animations
js/
  main.js         session flow, screens, all tunable constants
  audio.js        loading, looping, playback and mixing
  envelope.js     loudness envelopes and "laugh intensity"
  faces.js        procedural SVG characters and their expressions
  layout.js       character grid
audio/            12 laughter recordings (mp3, mono, loudness-matched)
fonts/            Fredoka font (woff2) and its license
dev/faces.html    character preview for tuning the looks
docs/moodboost.md full specification (in Polish)
```

## Tuning

- Timings, crowd limits, mix levels and animation thresholds are constants at the top of `js/main.js`.
- `dev/faces.html` shows random characters with an intensity slider and simulated laughter. `?n=120` shows more of them, e.g. to check performance.
- Background colours are CSS variables (`--blob-1` … `--blob-4`) at the top of `style.css`, one set per theme.

## License

Code and recordings: [MIT](LICENSE), © 2026 Jakub W. Adamczyk.

The laughter recordings were generated with [ElevenLabs](https://elevenlabs.io) on a paid plan.

The [Fredoka](https://fonts.google.com/specimen/Fredoka) font in `fonts/` is licensed separately under the [SIL Open Font License 1.1](fonts/OFL.txt).
