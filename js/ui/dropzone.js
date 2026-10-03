export function initDropzone(zone, input, onFiles) {
  const open = () => input.click();

  zone.addEventListener('click', open);
  zone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      open();
    }
  });

  input.addEventListener('change', () => {
    if (input.files?.length) onFiles([...input.files]);
    input.value = '';
  });

  for (const type of ['dragenter', 'dragover']) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.add('is-over');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    zone.addEventListener(type, (event) => {
      event.preventDefault();
      zone.classList.remove('is-over');
    });
  }
  zone.addEventListener('drop', (event) => {
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) onFiles(files);
  });

  // ブラウザ既定のドロップ（画像をそのページで開いてしまう）を止める
  for (const type of ['dragover', 'drop']) {
    window.addEventListener(type, (event) => {
      if (!zone.contains(event.target)) event.preventDefault();
    });
  }

  window.addEventListener('paste', (event) => {
    const files = [...(event.clipboardData?.files ?? [])];
    if (files.length) onFiles(files);
  });
}
