export function createProgress(onCancel) {
  const section = document.getElementById('progress');
  const fill = document.getElementById('progress-fill');
  const label = document.getElementById('progress-label');
  const cancelBtn = document.getElementById('cancel-btn');

  cancelBtn.addEventListener('click', onCancel);

  return {
    start(total) {
      section.hidden = false;
      cancelBtn.hidden = false;
      fill.style.width = '0%';
      label.textContent = `0 / ${total} 件`;
    },
    update(done, total, currentName) {
      fill.style.width = `${Math.round((done / total) * 100)}%`;
      label.textContent = currentName
        ? `${done} / ${total} 件　${currentName}`
        : `${done} / ${total} 件`;
    },
    message(text, { showCancel = false } = {}) {
      section.hidden = false;
      cancelBtn.hidden = !showCancel;
      label.textContent = text;
    },
    setFill(percent) {
      fill.style.width = `${Math.round(percent)}%`;
    },
    done() {
      section.hidden = true;
    },
  };
}
