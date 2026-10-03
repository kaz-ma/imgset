import { DEFAULT_SETTINGS } from '../core/pipeline.js';

export function initSettings(onChange) {
  const widths = document.getElementById('set-widths');
  const webp = document.getElementById('set-webp');
  const jpeg = document.getElementById('set-jpeg');
  const avif = document.getElementById('set-avif');
  const quality = document.getElementById('set-quality');
  const qualityOut = document.getElementById('set-quality-out');
  const sizesPreset = document.getElementById('set-sizes-preset');
  const sizes = document.getElementById('set-sizes');
  const noUpscale = document.getElementById('set-noupscale');

  function read() {
    const parsed = widths.value
      .split(/[,\s]+/)
      .map((v) => parseInt(v, 10))
      .filter((v) => Number.isFinite(v) && v > 0 && v <= 10000);

    return {
      ...DEFAULT_SETTINGS,
      widths: parsed.length ? [...new Set(parsed)].sort((a, b) => a - b) : DEFAULT_SETTINGS.widths,
      formats: { avif: avif.checked, webp: webp.checked, jpegFallback: jpeg.checked },
      quality: Number(quality.value),
      noUpscale: noUpscale.checked,
      sizesAttr: sizesPreset.value === 'custom' ? sizes.value.trim() || '100vw' : sizesPreset.value,
    };
  }

  quality.addEventListener('input', () => { qualityOut.textContent = quality.value; });

  const sizesLabel = document.getElementById('set-sizes-label');
  sizesPreset.addEventListener('change', () => {
    const custom = sizesPreset.value === 'custom';
    sizes.hidden = !custom;
    sizesLabel.hidden = !custom;
    if (custom) sizes.focus();
  });

  for (const el of [widths, webp, jpeg, avif, quality, sizesPreset, sizes, noUpscale]) {
    el.addEventListener('change', () => onChange(read()));
  }
  sizes.addEventListener('input', () => onChange(read()));

  return { read };
}
