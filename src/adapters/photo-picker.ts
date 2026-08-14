import { toError, type AdapterResult, type PhotoPickerPort, type PickedPhoto } from './types';

/**
 * WEB implementation, and the file `tsc` resolves.
 *
 * Deliberately dependency-free: a DOM `<input type=file>` covers the library
 * case, and the `capture` attribute makes mobile browsers open the camera
 * (desktop browsers ignore it and fall back to the file dialog). Keeping
 * expo-image-picker out of this file keeps it out of the web bundle entirely.
 *
 * The returned URI is an object URL, alive for this page session only — which
 * matches how far a photo can travel on web anyway (no Object Storage yet).
 */
function pickViaInput(capture: boolean): Promise<AdapterResult<PickedPhoto | null>> {
  return new Promise((resolve) => {
    try {
      if (typeof globalThis.document === 'undefined') {
        resolve({ ok: false, error: 'No DOM available for a file input.' });
        return;
      }
      const input = globalThis.document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (capture) input.setAttribute('capture', 'environment');

      let settled = false;
      const settle = (result: AdapterResult<PickedPhoto | null>) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      input.onchange = () => {
        const file = input.files?.[0] ?? null;
        settle({ ok: true, value: file === null ? null : { uri: URL.createObjectURL(file) } });
      };
      // Fired by modern browsers when the dialog is dismissed. Older ones fire
      // nothing on cancel; the promise then stays pending, which is harmless
      // here — the screen only reacts to a resolved pick.
      input.addEventListener('cancel', () => settle({ ok: true, value: null }));

      input.click();
    } catch (error) {
      resolve(toError(error));
    }
  });
}

export const photoPicker: PhotoPickerPort = {
  isAvailable: true,

  pickFromLibrary() {
    return pickViaInput(false);
  },

  captureWithCamera() {
    return pickViaInput(true);
  },
};
