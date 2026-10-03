import { processImage } from '../core/pipeline.js';

self.onmessage = async (event) => {
  const { id, file, settings } = event.data;
  try {
    const result = await processImage(file, settings);
    self.postMessage({ id, ok: true, result });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
};
