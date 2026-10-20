/** Hands `text` to the browser as a file download (an anchor click on a Blob URL, revoked afterwards). */
export function downloadTextFile(text: string, fileName: string, type = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke after the click has been handled; some browsers read the URL asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
