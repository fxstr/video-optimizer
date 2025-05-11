import { convertVideo } from './index';

test('exports convertVideo', (): void => {
  expect(convertVideo).toBeInstanceOf(Function);
});

test('example in readme works', async (): Promise<void> => {
  let resolve: () => void;
  const promise = new Promise<void>((resolveFunction): void => {
    resolve = resolveFunction;
  });
  // ↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓↓

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
    resolve(); // ←←←←←←←←←←←←←←←←←←←←←←←←←←←←←← REMOVE THAT LINE
  });

  // ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
  return promise;
});
