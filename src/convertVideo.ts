import { spawn } from 'child_process';
import { PassThrough } from 'node:stream';
import convertTimeToMs from './convertTimeToMs.js';
import type { NormalizedParameters } from './types/NormalizedParameters.js';
import generateFFmpegArguments from './generateFFmpegArguments.js';

type ReturnPromiseValue = { stream: PassThrough, cancel: () => Promise<void> };

/**
 * If promise has not yet been fulfilled, reject it with the error provided; else call the error
 * callback function with it.
 */
const returnError = ({
  reject,
  promiseFulfilled,
  errorCallback,
  error,
}: {
  reject: (reason: Error) => void,
  promiseFulfilled: boolean,
  errorCallback: (error: Error) => void,
  error: Error,
}): void => {
  if (!promiseFulfilled) reject(error);
  else errorCallback(error);
};

/**
 * Converts a video with FFmpeg.
 * Before our server can respond with the converted data, it must know the mime type which in case
 * of errors is text, else a video; therefore we have to return the mime type as soon as we
 * know it, which is only when we get the first chunk of data; therefore we return a Promise.
 *
 * !!! CAREFUL: The promise is not resolved when the video has been completely converted, but
 * already when its *first chunk of data* has been so. !!!
 *
 * As errors can happen heavily asynchronously, we pass a callback to handle them whenever they
 * may happen.
 * Some browsers cancel the first request they made once they get a "Content-Type: video/mp4";
 * therefore we also have to return a cancel method to make sure we don't waste resources
 * transcoding a video that's not needed.
*/
export default ({
  ffmpegArguments,
  errorCallback = (): void => {},
} : {
  ffmpegArguments: NormalizedParameters,
  errorCallback?: (error: Error) => void,
}): Promise<ReturnPromiseValue> => {
  let resolve: (value: { stream: PassThrough, cancel: () => Promise<void> }) => void;
  let reject: (reason: Error) => void;

  // Things happen highly asynchronously here. As soon as the promise is fulfilled, use
  // errorCallback (instead of a rejection) in case of an error. To do so, we must know if the
  // promise is still pending.
  let promiseFulfilled = false;

  // Main promise to return
  const promise = new Promise<ReturnPromiseValue>((resolveFunction, rejectFunction): void => {
    resolve = resolveFunction;
    reject = rejectFunction;
  });

  const startTime = performance.now();
  const consoleArguments = generateFFmpegArguments(ffmpegArguments).ffmpegArguments;

  // Use pure ffmpeg command; if we'd use ffmpeg-static or similar, the static version (which is
  // precompiled for easy installation that we don't need because we got Docker) might not
  // be as optimized as it should/could be.
  const ffmpeg = spawn('ffmpeg', consoleArguments);

  ffmpeg.on('error', (error: Error): void => {
    returnError({
      reject,
      promiseFulfilled,
      error,
      errorCallback,
    });
    promiseFulfilled = true;
  });

  let duration: number | undefined;
  const stderrData: Buffer[] = [];

  /*
   * ffmpeg uses stderr for regular status updates while everything is going great; don't treat
   * output as an error until we run into one.
   */
  ffmpeg.stderr.on('data', (data: Buffer): void => {
    stderrData.push(data);
    const currentBufferValue = data.toString();
    if (!duration) {
      const durationMatch = currentBufferValue.match(/Duration:\s*([0-9:.]+)/);
      if (durationMatch) duration = convertTimeToMs(durationMatch[1]);
    }
    const timeMatch = currentBufferValue.match(/time=([0-9:.]+)/);
    if (timeMatch && duration) {
      const progress = convertTimeToMs(timeMatch[1]) / duration;
      console.log('Progress: %d%', (progress * 100).toFixed(0));
    }
    const threadsMatch = currentBufferValue.match(/threads=([0-9]+)/);
    if (threadsMatch) console.log('Using %d threads', threadsMatch[1]);
  });

  ffmpeg.on('exit', (code): void => {
    console.log('Exited with code %o', code);
    if (duration) {
      console.log(
        'Converted %d ms of video in %d ms, speed is %ds/s',
        Math.round(duration),
        Math.round(performance.now() - startTime),
        (duration / (performance.now() - startTime)).toFixed(3),
      );
    }
    const errorMessage = Buffer.concat(stderrData).toString();

    // If we kill the process, exit code will be 255 (which is not fine); check string to see
    // if process was killed and everything is fine.
    const wasKilled = errorMessage.includes('Exiting normally, received signal 15.');
    const fileNotFound = errorMessage.includes('No such file or directory');
    const isError = code !== 0 && !wasKilled;

    if (wasKilled) {
      console.log('Killed 🔫');
      return;
    }

    // If an error happens *after* the first chunk of data was received, the promise is already
    // resolved. In that case use errorCallback, else reject.
    if (isError) {
      const error = fileNotFound
        ? new Error('Source movie not found.') 
        : new Error(`FFmpeg process exited with code ${code?.toString() ?? ''}:\n ${errorMessage}`);
      returnError({
        reject,
        promiseFulfilled,
        error,
        errorCallback,
      });
      promiseFulfilled = true;
      console.log('Error 🚨: code %d, message %s', code, errorMessage);
    }

    console.log('Done ✨');
  });

  // Provide a kill method to make sure the ffmpeg process ends when a request is terminated.
  // Call a callback function when the process exits to make sure from the outside that the process
  // is dead before we continue e.g. to the next test.
  const cancel = (): Promise<void> => {
    ffmpeg.kill();
    return new Promise((resolveKill): void => {
      ffmpeg.on('exit', resolveKill);
    });
  };

  /**
   * Wait until first parsed data is received, only then resolve the promise. Before that, we don't
   * know if we will fail and can not send the correct header (as soon as we send
   * 'Content-Type: video/mp4' errors that are strings will not be displayed correctly any more
   * in the browser).
   */
  ffmpeg.stdout.once('data', (chunk): void => {
    const stream = new PassThrough();
    resolve({ stream, cancel });
    promiseFulfilled = true;
    stream.write(chunk);
    ffmpeg.stdout.pipe(stream);
  });

  return promise;
};
