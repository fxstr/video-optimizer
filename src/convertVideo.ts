import { spawn } from 'child_process';
import { PassThrough } from 'node:stream';
import convertTimeToMs from './convertTimeToMs.js';
import QueryParameterError from './QueryParameterError.js';

type ReturnPromiseValue = { stream: PassThrough, cancel: () => void };

/**
 * Converts a video with FFmpeg.
 * Before our server can respond with the converted data, it must know the mime type which in case
 * of errors is text, else a video; therefore we have to return the mime type as soon as we
 * know it, which is only when we get the first chunk of data; therefore we return a Promise.
 * As errors can happen heavily asynchronously, we pass a callback to handle them whenever they
 * may happen.
 * Some browsers cancel the first request they made once they get a "Content-Type: video/mp4";
 * therefore we also have to return a cancel method to make sure we don't waste resources
 * transcoding a video that's not needed.
*/
export default ({
  ffmpegArguments = [],
  errorCallback = (): void => {},
} : {
  ffmpegArguments?: string[],
  errorCallback?: (error: Error) => void,
} = {}): Promise<ReturnPromiseValue> => {
  let resolve: (value: { stream: PassThrough, cancel: () => void }) => void;
  let reject: (reason: Error) => void;
  // Prevent multiple fulf
  let promiseFulfilled = false;

  const promise = new Promise<ReturnPromiseValue>((resolveFunction, rejectFunction): void => {
    resolve = resolveFunction;
    reject = rejectFunction;
  });

  const startTime = performance.now();
  // Use pure ffmpeg command; if we'd use ffmpeg-static or similar, the static version  might not
  // be as optimized as it should/could be.
  const ffmpeg = spawn('ffmpeg', ffmpegArguments);

  ffmpeg.on('error', (error: Error): void => {
    reject(error);
    errorCallback(error);
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
      const method = promiseFulfilled ? errorCallback : reject;
      const error = fileNotFound
        ? new QueryParameterError('The URL you passed as source could not be accessed.')
        // TODO: We should not expose our internal error messages and logic
        : new Error(`FFmpeg process exited with code ${code?.toString() ?? ''}:\n ${errorMessage}`);
      method(error);
      console.log('Error 🚨: code %d, message %s', code, errorMessage);
      return;
    }

    console.log('Done ✨');
  });

  const cancel = ffmpeg.kill.bind(ffmpeg);

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