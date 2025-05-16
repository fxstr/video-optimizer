export type OutputFormats = 'h264' | 'av1' | 'jpg';

export type NormalizedParameters = {
  source: string;
  height: number | null;
  width: number | null;
  trimStartMs: number | null;
  trimEndMs: number | null;
  format: OutputFormats;
  fps: number | null;
  quality: number | null;
  keyframeInterval: number | null,
};
