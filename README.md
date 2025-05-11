# Intro

Basically makes [FFmpeg](https://www.ffmpeg.org/) easily accessible through an object-based
interface and transcodes videos to a stream. No dependencies – except for a local installation of
FFmpeg (not part of this package).

# Use

## Install
```bash
npm i video-optimizer`
```

**Important:** You must have a working installation of FFmpeg available under `ffmpeg`.

## Invoke
```javascript
import { convertVideo } from 'video-optimizer';

// Will be called when an error happens, which may be heavily asynchronously
const errorCallback = (error: Error): void => { console.error(error); };
// Define where to get and how to transcode the video
const ffmpegArguments = {
  source: 'https://fxstr.com/out/test.mp4',
  format: 'av1',
  height: 720,
  width: 1280,
  trimStartMs: 1000,
  trimEndMs: 2000,
  quality: 60,
  fps: 20,
  keyframeInterval: 10,
};

const { stream } = await convertVideo({ ffmpegArguments, errorCallback });

const chunks: Buffer[] = [];
stream.on('data', (chunk: Buffer): void => { chunks.push(chunk); });
stream.on('end', (): void => {
  const result = Buffer.concat(chunks);
  console.log('Transcoded video is %d bytes long', result.length);
});
```
## Arguments
See the [TypeScript definition](./src/types/NormalizedParameters.ts). 

# Test it

`npm test` or `npm run test:watch`

To test a single file: `npm run test:watch -- path/to-file.ts`. 

To run a single test: `npm run test:watch -- -t "name of the test"`.