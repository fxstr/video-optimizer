import { NormalizedParameters } from './types/NormalizedParameters.js';
import mapQuality from './mapQuality.js';

interface ReturnProperties {
  ffmpegArguments: string[],
  fileType: string,
}

export default (normalizedParameters: NormalizedParameters): ReturnProperties => {
  const ffmpegArguments: string[] = [];
  let fileType: string = '';

  if (normalizedParameters.source) {
    ffmpegArguments.push('-i', normalizedParameters.source);
  }

  const { height, width } = normalizedParameters;
  // As the requirement for even numbers is quite ffmpeg specific, we'll check for it here
  // Reason: RGB to YUV, see https://stackoverflow.com/a/23614652/25041219
  if ((height && height % 2 !== 0)) {
    throw new Error(`Height must be an even number; you used ${height.toString()} instead.`);
  }
  if ((width && width % 2 !== 0)) {
    throw new Error(`Width must be an even number; you used ${width.toString()} instead.`);
  }
  if (width && !height) {
    ffmpegArguments.push('-vf', `scale=${width.toString()}:trunc(ow/a/2)*2`);
  } else if (height && !width) {
    ffmpegArguments.push('-vf', `scale=trunc(oh*a/2)*2:${height.toString()}`);
  } else if (height && width) {
    // Scale video first; make sure it fills the new height or width (like cover) but overlaps it
    // to keep the original aspect ratio
    // a is the input's aspect ratio; if it is larger (i.e. input is wider than the output), resize
    // the input to the output's height and let width overlap the desired size. And vice versa.
    const outputAspectRatio = `${width.toString()}/${height.toString()}`;
    // Format is scale=width:height; before the : we therefore calculate the width, after the : the
    // height.
    const scale = `scale='if(gt(a,${outputAspectRatio}),-1,${width.toString()})':'if(gt(a,${outputAspectRatio}),${height.toString()},-1)'`;
    const crop = `crop=${width.toString()}:${height.toString()}`;
    // Crop
    ffmpegArguments.push('-vf', [scale, crop].join(','));
  }

  // Trim (this is all quick and dirty and needs refactoring! Too much DRY here.)
  const { trimStartMs, trimEndMs } = normalizedParameters;
  if (trimStartMs) ffmpegArguments.push('-ss', (trimStartMs / 1000).toFixed(3));
  if (trimEndMs) ffmpegArguments.push('-t', ((trimEndMs - (trimStartMs ?? 0)) / 1000).toFixed(3));

  // FPS
  if (normalizedParameters.fps) ffmpegArguments.push('-r', normalizedParameters.fps.toString());

  // Type – should be at the very end
  // We could remove the default here; it's now handled in the before-executed normalizeParameters
  // function.
  const { format } = normalizedParameters;
  if (format === 'h264') {
    ffmpegArguments.push('-c:v', 'libx264');
    ffmpegArguments.push('-preset', 'ultrafast');
    ffmpegArguments.push('-f', 'mp4');
    if (normalizedParameters.quality) {
      const adjustedQuality = mapQuality([0, 100], [51, 0], normalizedParameters.quality);
      ffmpegArguments.push('-crf', Math.round(adjustedQuality).toString());
    }
    // +faststart does not do the job here; we get "muxer does not support non seekable output"
    // and the HTTP request fails. If we use both (frag_keyframe+empty_moov plus +faststart),
    // faststart is ignored. Therefore, we can leave it out.
    ffmpegArguments.push('-movflags', 'frag_keyframe+empty_moov');
    fileType = 'mp4';
  } else if (format === 'av1') {
    // libaom-av1 is slow AF
    ffmpegArguments.push('-c:v', 'libsvtav1');
    // TODO: Use optimized converter based on hardware
    // ffmpegArguments.push('-c:v', 'librav1e'); for Nvidia or stuff
    if (normalizedParameters.quality) {
      const adjustedQuality = mapQuality([0, 100], [63, 0], normalizedParameters.quality);
      ffmpegArguments.push('-crf', Math.round(adjustedQuality).toString());
    }
    ffmpegArguments.push('-f', 'mp4');
    ffmpegArguments.push('-movflags', 'frag_keyframe+empty_moov');
    fileType = 'mp4';
  } else if (format === 'jpg') {
    ffmpegArguments.push('-vframes', '1');
    ffmpegArguments.push('-f', 'image2');
    ffmpegArguments.push('-vcodec', 'mjpeg');
    if (normalizedParameters.quality) {
      const adjustedQuality = mapQuality([0, 100], [31, 1], normalizedParameters.quality);
      ffmpegArguments.push('-q:v', Math.round(adjustedQuality).toString());
    }
    fileType = 'jpg';
  }

  if (normalizedParameters.keyframeInterval) {
    ffmpegArguments.push('-g', normalizedParameters.keyframeInterval.toString());
  }

  ffmpegArguments.push('-an');

  // Make things verbose to simplify debugging (also on live data)
  ffmpegArguments.push('-v', 'verbose');
  // Make sure output is streamed to stdout
  ffmpegArguments.push('-');

  // console.log('ffmpegArguments are %o', ffmpegArguments);

  return {
    ffmpegArguments,
    fileType,
  };
};
