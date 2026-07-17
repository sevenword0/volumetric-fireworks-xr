export async function copyTextToClipboard(value, environment = globalThis) {
  const text = String(value ?? '');
  const clipboard = environment?.navigator?.clipboard;
  let clipboardError = null;

  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return 'clipboard';
    } catch (error) {
      clipboardError = error;
    }
  }

  const document = environment?.document;
  if (document?.body && typeof document.createElement === 'function' && typeof document.execCommand === 'function') {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-hidden', 'true');
    field.style.position = 'fixed';
    field.style.left = '-9999px';
    field.style.opacity = '0';
    let copied = false;
    try {
      document.body.appendChild(field);
      field.focus();
      field.select();
      copied = document.execCommand('copy') === true;
    } finally {
      if (typeof field.remove === 'function') field.remove();
      else document.body.removeChild(field);
    }
    if (copied) return 'execCommand';
  }

  throw clipboardError ?? new Error('Clipboard copy is unavailable');
}
