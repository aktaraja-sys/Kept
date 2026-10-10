import { Capacitor } from '@capacitor/core';

/**
 * Hand a decrypted document to the user. In a browser it downloads; on Android it is written to
 * the app's private cache and handed to the share sheet, then removed shortly after.
 */
export async function deliverBlob(blob: Blob, name: string) {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
    const data = await blobToBase64(blob);
    const safe = name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'document';
    const res = await Filesystem.writeFile({ path: safe, data, directory: Directory.Cache });
    try {
      await Share.share({ title: safe, url: res.uri });
    } finally {
      setTimeout(() => Filesystem.deleteFile({ path: safe, directory: Directory.Cache }).catch(() => undefined), 60_000);
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
