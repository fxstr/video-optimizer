# Install it

1. Make sure that `FFmpeg` is installed and can be invoked by calling `ffmpeg` in the terminal. 
2. Install the NPM modules: `npm i`.

# Run it

Run locally: `npm start`

Docker:
- `docker build -t video-optimizer .`
- `docker run -p 1234:3000 video-optimizer` to expose it on `localhost:1234`

# Deploy it

`flyctl deploy -c fly.toml`

# Test it

`npm test` or `npm run test:watch`

To test a single file: `npm test:watch -- path/to-file.ts`. 

To run a single test: `npm test:watch -t "name of the test"`.

## API
Tendenz: Längere Params, dafür wenigere und Infos via Values 
Params ohne Alias, wegen Caching

?source=https://fxstr.com/video.mp4&format=av1&size=1280/720&trim=2.85s/100f
frameRate: 25
keyFrames oder pFrames: 10
trim: start/end, start, /end; s (Seconds, float), f (Frames, int), hh:mm:ss.sss
quality: …
format: avif, webp, json (no param = original) …

?source=https://fxstr.com/out/test.mp4&format=avif&size=1280&focalPoint=1250/70%
focalPoint: x/y (in px), x (in px), x%, x/y%, /y%, face, highlight, auto, ""
size (always px): x, x/y, /y, "" (empty = original)
quality: … vbr/cbr – standardize to % or 0–10?

Separate endpoint for infos: duration, frameRate, format, size …


CacheBusting: Same URL = same result. ?nocache=true header? Or ?revalidate=true

Kern: API-Design: Viele Params oder Infos in den Werten, z.B. XxY resp. x/y resp. Frames vs Time?