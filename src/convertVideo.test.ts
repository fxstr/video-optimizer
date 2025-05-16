import path from 'path';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import convertVideo from './convertVideo';
import type { NormalizedParameters } from './types/NormalizedParameters.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));

const generateFFmpegArguments = (): NormalizedParameters => ({
  source: path.join(currentDirectory, '../media/test.mp4'),
  height: null,
  width: null,
  trimStartMs: null,
  trimEndMs: null,
  format: 'h264',
  fps: null,
  quality: null,
  keyframeInterval: null,

});

test('returns a promise', async ():Promise<void> => {
  // Without valid arguments, FFmpeg will fail
  const promise = convertVideo({ ffmpegArguments: generateFFmpegArguments() });
  expect(promise).toBeInstanceOf(Promise);
  const { cancel, stream } = await promise;
  // Always consume the stream or it will remain open
  stream.on('data', ():void => {});
  await cancel();
}, 20000);

test('resolves with the expected params', async (): Promise<void> => {
  let resolveStream: () => void;
  const streamPromise = new Promise<void>((resolveFunction): void => {
    resolveStream = resolveFunction;
  });

  const ffmpegArguments = generateFFmpegArguments();
  ffmpegArguments.format = 'av1';
  const errorCallback = (error: Error): void => {
    console.error(error);
    // Make sure we fail here
    throw error;
  };
  const { stream, cancel } = await convertVideo({ ffmpegArguments, errorCallback });
  expect(stream).toBeInstanceOf(PassThrough);
  // We must consume the streams so that they are drained when the tests end
  const ffprobe = spawn('ffprobe', [
    '-v', 'error',
    '-show_format',
    '-show_streams',
    '-of', 'json',
    '-i', 'pipe:0',
  ]);
  ffprobe.stderr.on('data', console.error);
  ffprobe.on('error', console.error);

  const output: Buffer[] = [];
  ffprobe.stdout.on('data', (data: Buffer): void => {
    console.log('data');
    output.push(data);
  });

  ffprobe.on('close', (): void => {
    const result = Buffer.concat(output).toString();
    const resultAsObject = JSON.parse(result) as { streams: { codec_name: string }[] };
    expect(resultAsObject.streams[0].codec_name).toBe('av1');
  });

  // stream.pipe(ffprobe.stdin) continues writing to ffprobe's stdin even after ffprobe has closed.
  // If we don't handle that (expected) error, the test will fail.
  ffprobe.stdin.on('error', (error: Error): void => {
    // EPIPE error is expected here
    if (error.message.includes('write EPIPE')) return;
    console.error(error);
  });

  // pipe the converted video to ffprobe's stdin
  stream.pipe(ffprobe.stdin);

  // Without this consumer, the stream does not start and the function will not end 🤷‍♂️
  stream.on('data', (): void => {});
  stream.on('error', console.error);
  stream.on('end', (): void => {
    cancel().then((): void => {
      resolveStream();
    }).catch(console.error);
  });
  return streamPromise;
}, 20000);

test('returns a working cancel function', async (): Promise<void> => {
  const ffmpegArguments = generateFFmpegArguments();
  const errorCallback = (error: Error): void => {
    console.error(error);
    // Make sure we fail here
    throw error;
  };
  const { stream, cancel } = await convertVideo({ ffmpegArguments, errorCallback });
  // The stream must be consumed or it will not start
  stream.on('data', ():void => {});
  expect(typeof cancel).toBe('function');
  const cancelPromise = cancel();
  expect(cancelPromise).toBeInstanceOf(Promise);
  await cancelPromise;
}, 20000);

test('rejects with an inexistent source path', async (): Promise<void> => {
  const ffmpegArguments = generateFFmpegArguments();
  // Errors with an invalid source
  ffmpegArguments.source = path.join(currentDirectory, '../media/tes.mp4');
  const errorCallback = (error: Error): void => {
    expect(error.message.includes('No such file or directory')).toBe(true);
  };
  await expect(convertVideo({ ffmpegArguments, errorCallback })).rejects.toThrow();
});

test('rejects a source image', async (): Promise<void> => {
  const ffmpegArguments = generateFFmpegArguments();
  // Errors with an invalid source
  ffmpegArguments.source = path.join(currentDirectory, '../media/test.txt');
  const errorCallback = (error: Error): void => {
    expect(error.message.includes('Invalid data found when processing input')).toBe(true);
  };
  await expect(convertVideo({ ffmpegArguments, errorCallback })).rejects.toThrow();
});
