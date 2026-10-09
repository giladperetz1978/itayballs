# Courtside

A Hebrew, mobile-responsive workspace for single-hoop 3-on-3 basketball video. React, TypeScript, Gemini 3.8 Flash, TensorFlow.js and an FFmpeg export service.

## Published site

https://giladperetz1978.github.io/itayballs/

Pushes to `main` run tests, lint, and a production build, then deploy only `dist` to GitHub Pages using GitHub Actions. The repository's Pages source must be set to GitHub Actions.

GitHub Pages hosts the browser app only. Video selection, playback, manual markers, browser-side analysis and JSON downloads run in the browser. Gemini requires a personal key and access to the configured model. MP4 export requires the Node/FFmpeg server and is unavailable on Pages; run the app locally for MP4 export. No API keys belong in repository secrets or build variables for this deployment.

## Run locally

Requires Node.js 22.18+ (tested on Node 26) and npm. FFmpeg is supplied by `ffmpeg-static`; its installation script must be permitted. No Python, external FFmpeg install, or server-side Gemini key is needed.

```sh
npm install
npm run dev
```

Open the Vite URL printed in the terminal, normally http://localhost:5173. The export service binds to 127.0.0.1:3001. If that API port is occupied, change `PORT` and the target in `vite.config.ts` together. Vite selects another free frontend port when necessary.

For a production build served by the same export service:

```sh
npm run build
npm start
```

Open http://localhost:3001. Keep the Node process running for MP4 exports.

## Workflow

1. Select a browser-decodable MP4, MOV or WebM video (500 MB and 30 minutes maximum). H.264 MP4 is the most portable option.
2. In Settings, enter your personal Gemini API key and a password of at least 10 characters. The model is exactly `gemini-3.8-flash`.
3. Choose Gemini analysis and approve sending the video directly to Google. Your account must have access to that model and sufficient quota/billing. Model availability is not guaranteed by this app.
4. Review detected candidates. Confirm genuine baskets, remove false positives, correct the time in seconds, or add a missed basket manually at the current playhead.
5. Each basket plays from three seconds before to three seconds after the ball passes the rim, clamped at the start/end of the recording.
6. Download one basket or combine all confirmed baskets into a single MP4 with the original audio. Export supports up to 100 clips per request. Markers can also be downloaded as JSON.

The local experimental engine needs the rim center and width marked in the preview. It detects sports balls with COCO-SSD at five sampled frames per second and flags downward rim crossings. The tracking switch overlays currently detected ball positions during playback. Local inference does not upload the video; model weights are downloaded from Google Cloud Storage. A fixed camera and clearly visible ball/rim are important.

## Personal key security

- The key is encrypted in browser localStorage with AES-256-GCM. A random 128-bit salt and 96-bit IV are generated for each save; a key is derived from your password with PBKDF2-SHA256, 600,000 iterations.
- Neither the plaintext key nor the password is persisted or sent to the application server. The password cannot be recovered. Deleting browser storage removes the vault.
- Unlocking holds the API key in JavaScript memory for direct requests to Google. Reload, explicit lock, 15 minutes since unlock, or one minute in the background locks the UI and aborts active work. JavaScript cannot guarantee immediate memory zeroization.
- Encryption at rest does not protect an unlocked, compromised device, malicious browser extensions, or injected application code. Production responses restrict scripts, media and network sources with CSP.
- Each browser profile/origin has its own vault. Keys are not synchronized between users or devices. Never put keys in `VITE_*` variables or source files.

## Phone access and HTTPS

Web Crypto requires a secure context: HTTPS on a phone, or localhost on the computer running the app. A plain `http://192.168...` address is not sufficient for the encrypted vault.

For phone use with MP4 export, serve the production build behind a trusted HTTPS reverse proxy to `127.0.0.1:3001`, on a private/authenticated network. Set `APP_ORIGIN` to the exact public HTTPS origin when the proxy rewrites the Host header. Allow upload bodies of 500 MB and long export requests in the proxy configuration. The app is a responsive web application, not a packaged native app. The public GitHub Pages deployment uses HTTPS but does not include the export server.

The export service is intended for personal/private use. It has a single-export concurrency limit, bounded clip windows, MIME/size limits, explicit input demuxers, timeouts, no shell interpolation, and temporary-file cleanup. It does not provide accounts or authentication: do not expose it to the public internet without an authenticated gateway and deployment-level rate limiting.

## Privacy and limitations

- Gemini uploads go straight from the browser to Google after consent. Usage may incur charges. Obtain permission from people in the recording and review Google's API data policy for your account tier.
- Gemini analysis samples at 4 FPS in overlapping 120-second segments. All timestamps are validated against the original video. Confirmations are never automatic.
- The application requests deletion of Google uploads in `finally`. Cancellation during upload or closing the tab may prevent deletion; failed deletion is reported. Google's Files API normally expires uploads after 48 hours. This is not a promise about all provider logs or data use.
- MP4 export sends the video to the app server, never the API key. Temporary files are removed after success, errors or normal cancellation. An OS/process crash can leave `courtside-*` directories in the system temp folder; remove those when the server is stopped.
- Shot lists and the selected video exist only in the current page session. Export the clips/JSON before leaving; the browser warns before unloading when there are markers. The encrypted key is the only persisted app data. JSON import is not implemented.
- Neither Gemini nor a generic ball detector guarantees every basket. Occlusion, motion blur, a distant ball, camera motion and image-plane rim crossings can produce misses or false positives. Reported model confidence is not calibrated accuracy. No player identification or team scoring is inferred.
- Browser support depends on video codecs, WebGL and current Web Crypto APIs. Chromium was tested at desktop and phone-sized viewports; physical iPhone/Android devices have not been tested. Analysis should stay in the foreground; background key locking cancels it.

## Verification

```sh
npm test
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

Unit tests cover clip boundaries, rim crossing, deduplication, strict Gemini response parsing, password encryption and export bounds. Browser tests cover uploads, nonblank decoded video frames, replay stop times, clip editing, audio-preserving MP4 export, combined highlights, silent portrait video, responsive screenshots, vault persistence, and a mocked Gemini upload/analyze/delete flow. One browser test downloads real COCO-SSD weights and runs inference; internet access is required.

Real Gemini inference and basketball recognition accuracy have **not** been validated without a user-supplied API key and representative basketball footage. Tests use synthetic video, not claimed real game detections.

Photo: [Unsplash basketball court](https://images.unsplash.com/photo-1544919982-b61976f0ba43). Fonts are locally hosted Heebo and Barlow Condensed; icons are Lucide.
