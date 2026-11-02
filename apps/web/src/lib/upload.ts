import { completeUpload, presignUpload } from './api/uploads';
import type { Attachment } from './api/types';
import { uploadLimits, type UploadPurpose } from '@market/shared';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export function validateFileForPurpose(file: File, purpose: UploadPurpose): FileValidationResult {
  const config = uploadLimits[purpose];
  if (!config) {
    return { valid: false, error: `Invalid upload purpose: ${purpose}` };
  }

  // Reject empty MIME types client-side
  if (!file.type || !file.type.trim()) {
    return {
      valid: false,
      error: 'File must have a valid MIME type.',
    };
  }

  const allowedMimes = config.mimeTypes as readonly string[];
  const maxBytes = config.maxSizeBytes;

  const isMimeValid = allowedMimes.includes(file.type);
  if (!isMimeValid) {
    const readablePurpose = purpose.toLowerCase().replace(/_/g, ' ');
    return {
      valid: false,
      error: `File type "${file.type}" is not permitted for ${readablePurpose}.`,
    };
  }

  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / 1_000_000);
    const fileMb = (file.size / 1_000_000).toFixed(1);
    return {
      valid: false,
      error: `File size (${fileMb}MB) exceeds the maximum limit of ${maxMb}MB.`,
    };
  }

  return { valid: true };
}

export interface UploadOptions {
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export async function uploadFile(
  file: File,
  purpose: UploadPurpose,
  options: UploadOptions = {},
): Promise<Attachment> {
  const validation = validateFileForPurpose(file, purpose);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid file');
  }

  if (options.signal?.aborted) {
    throw new DOMException('Upload aborted', 'AbortError');
  }

  const presign = await presignUpload({
    purpose,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });

  if (options.signal?.aborted) {
    throw new DOMException('Upload aborted', 'AbortError');
  }

  const uploadUrl = presign.url || presign.uploadUrl;
  const uploadId = presign.uploadId || presign.upload?.id;

  if (!uploadUrl || !uploadId) {
    throw new Error('Invalid presign response: missing upload URL or upload ID');
  }

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    const cleanup = () => {
      if (options.signal) {
        options.signal.removeEventListener('abort', onAbort);
      }
    };

    const onAbort = () => {
      xhr.abort();
      cleanup();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    if (options.signal) {
      if (options.signal.aborted) {
        reject(new DOMException('Upload aborted', 'AbortError'));
        return;
      }
      options.signal.addEventListener('abort', onAbort);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        options.onProgress(percent);
      }
    };

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) {
        if (options.onProgress) {
          options.onProgress(100);
        }
        resolve();
      } else {
        reject(new Error(`Upload failed with HTTP status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      cleanup();
      reject(new Error('Network error occurred during file upload'));
    };

    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('Upload aborted', 'AbortError'));
    };

    xhr.open('PUT', uploadUrl);

    let hasContentType = false;
    if (presign.headers) {
      for (const [key, value] of Object.entries(presign.headers)) {
        xhr.setRequestHeader(key, value);
        if (key.toLowerCase() === 'content-type') {
          hasContentType = true;
        }
      }
    }
    if (!hasContentType) {
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    }
    xhr.send(file);
  });

  if (options.signal?.aborted) {
    throw new DOMException('Upload aborted', 'AbortError');
  }

  return completeUpload(uploadId);
}
