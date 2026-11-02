import { completeUpload, presignUpload } from './api/uploads';
import type { Attachment, UploadPurpose } from './api/types';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

export const UPLOAD_LIMITS = {
  IMAGE_MAX_BYTES: 10 * 1024 * 1024, // 10 MB
  DOC_MAX_BYTES: 25 * 1024 * 1024, // 25 MB
  VOICE_MAX_BYTES: 10 * 1024 * 1024, // 10 MB
};

export const ALLOWED_MIME_TYPES: Record<UploadPurpose, string[]> = {
  LISTING_IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  AVATAR: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  LISTING_ATTACHMENT: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
  ],
  BID_ATTACHMENT: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
  ],
  DELIVERABLE: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
  ],
  MESSAGE_ATTACHMENT: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
  ],
};

export function validateFileForPurpose(file: File, purpose: UploadPurpose): FileValidationResult {
  const allowedMimes = ALLOWED_MIME_TYPES[purpose];

  // Extension fallback check if MIME type is generic or empty
  const fileExt = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
  const validExtensionForImage = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fileExt);
  const validExtensionForDoc = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.txt', '.zip'].includes(
    fileExt,
  );

  let isMimeValid = allowedMimes.includes(file.type);
  if (!isMimeValid && !file.type) {
    if (purpose === 'LISTING_IMAGE' || purpose === 'AVATAR') {
      isMimeValid = validExtensionForImage;
    } else {
      isMimeValid = validExtensionForDoc;
    }
  }

  if (!isMimeValid) {
    const readablePurpose = purpose.toLowerCase().replace(/_/g, ' ');
    return {
      valid: false,
      error: `File type "${file.type || fileExt}" is not permitted for ${readablePurpose}.`,
    };
  }

  let maxBytes = UPLOAD_LIMITS.DOC_MAX_BYTES;
  if (purpose === 'LISTING_IMAGE' || purpose === 'AVATAR') {
    maxBytes = UPLOAD_LIMITS.IMAGE_MAX_BYTES;
  }

  if (file.size > maxBytes) {
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    const fileMb = (file.size / (1024 * 1024)).toFixed(1);
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

  const presign = await presignUpload({
    purpose,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });

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

    if (presign.fields && Object.keys(presign.fields).length > 0) {
      xhr.open('POST', presign.url);
      const formData = new FormData();
      for (const [key, value] of Object.entries(presign.fields)) {
        formData.append(key, value);
      }
      formData.append('file', file);
      xhr.send(formData);
    } else {
      xhr.open('PUT', presign.url);
      if (presign.headers) {
        for (const [key, value] of Object.entries(presign.headers)) {
          xhr.setRequestHeader(key, value);
        }
      }
      if (!presign.headers || !presign.headers['Content-Type']) {
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      }
      xhr.send(file);
    }
  });

  return completeUpload(presign.uploadId);
}
