import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadFile, validateFileForPurpose } from './upload';
import * as uploadsApi from './api/uploads';

describe('Upload utilities', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateFileForPurpose', () => {
    it('accepts valid images for LISTING_IMAGE', () => {
      const file = new File(['image-bytes'], 'photo.png', { type: 'image/png' });
      const res = validateFileForPurpose(file, 'LISTING_IMAGE');
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects unsupported MIME types for LISTING_IMAGE', () => {
      const file = new File(['text-bytes'], 'notes.txt', { type: 'text/plain' });
      const res = validateFileForPurpose(file, 'LISTING_IMAGE');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('not permitted');
    });

    it('rejects images exceeding 10 MB limit', () => {
      const largeFile = new File([''], 'big.jpg', { type: 'image/jpeg' });
      Object.defineProperty(largeFile, 'size', { value: 11 * 1024 * 1024 });

      const res = validateFileForPurpose(largeFile, 'LISTING_IMAGE');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('exceeds the maximum limit of 10MB');
    });

    it('accepts documents within 25 MB for LISTING_ATTACHMENT', () => {
      const doc = new File(['pdf-bytes'], 'spec.pdf', { type: 'application/pdf' });
      const res = validateFileForPurpose(doc, 'LISTING_ATTACHMENT');
      expect(res.valid).toBe(true);
    });

    it('rejects documents exceeding 25 MB limit for LISTING_ATTACHMENT', () => {
      const largeDoc = new File([''], 'giant.pdf', { type: 'application/pdf' });
      Object.defineProperty(largeDoc, 'size', { value: 26 * 1024 * 1024 });

      const res = validateFileForPurpose(largeDoc, 'LISTING_ATTACHMENT');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('exceeds the maximum limit of 25MB');
    });
  });

  describe('uploadFile', () => {
    it('performs presign -> PUT/XHR upload -> complete flow', async () => {
      const mockFile = new File(['content'], 'test.png', { type: 'image/png' });
      const mockPresign = {
        uploadId: 'up-123',
        url: 'https://s3.example/upload',
        key: 'uploads/test.png',
        expiresAt: '2026-11-03T00:00:00Z',
      };
      const mockAttachment = {
        id: 'att-123',
        key: 'uploads/test.png',
        url: 'https://cdn.example/test.png',
        fileName: 'test.png',
        mimeType: 'image/png',
        sizeBytes: 7,
      };

      vi.spyOn(uploadsApi, 'presignUpload').mockResolvedValue(mockPresign);
      vi.spyOn(uploadsApi, 'completeUpload').mockResolvedValue(mockAttachment);

      // Mock XMLHttpRequest
      const mockXHR = {
        open: vi.fn(),
        send: vi.fn(function (this: {
          onload?: () => void;
          status: number;
          upload: {
            onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void;
          };
        }) {
          if (this.upload.onprogress) {
            this.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
          }
          this.status = 200;
          this.onload?.();
        }),
        setRequestHeader: vi.fn(),
        abort: vi.fn(),
        status: 200,
        upload: {
          onprogress: null,
        },
      };

      function MockXHR() {
        return mockXHR;
      }

      vi.stubGlobal('XMLHttpRequest', MockXHR);

      const onProgress = vi.fn();
      const result = await uploadFile(mockFile, 'LISTING_IMAGE', { onProgress });

      expect(uploadsApi.presignUpload).toHaveBeenCalledWith({
        purpose: 'LISTING_IMAGE',
        fileName: 'test.png',
        mimeType: 'image/png',
        sizeBytes: mockFile.size,
      });

      expect(mockXHR.open).toHaveBeenCalledWith('PUT', mockPresign.url);
      expect(onProgress).toHaveBeenCalledWith(50);
      expect(onProgress).toHaveBeenCalledWith(100);
      expect(uploadsApi.completeUpload).toHaveBeenCalledWith('up-123');
      expect(result).toEqual(mockAttachment);
    });

    it('supports S3 POST multipart presigned uploads when fields are present', async () => {
      const mockFile = new File(['doc-bytes'], 'spec.pdf', { type: 'application/pdf' });
      const mockPresign = {
        uploadId: 'up-456',
        url: 'https://s3.example/bucket',
        key: 'uploads/spec.pdf',
        fields: {
          key: 'uploads/spec.pdf',
          bucket: 'market-bucket',
        },
        expiresAt: '2026-11-03T00:00:00Z',
      };
      const mockAttachment = {
        id: 'att-456',
        key: 'uploads/spec.pdf',
        url: 'https://cdn.example/spec.pdf',
        fileName: 'spec.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 9,
      };

      vi.spyOn(uploadsApi, 'presignUpload').mockResolvedValue(mockPresign);
      vi.spyOn(uploadsApi, 'completeUpload').mockResolvedValue(mockAttachment);

      const mockXHR = {
        open: vi.fn(),
        send: vi.fn(function (this: { onload?: () => void; status: number }) {
          this.status = 204;
          this.onload?.();
        }),
        setRequestHeader: vi.fn(),
        abort: vi.fn(),
        status: 204,
        upload: { onprogress: null },
      };

      function MockXHR2() {
        return mockXHR;
      }

      vi.stubGlobal('XMLHttpRequest', MockXHR2);

      const result = await uploadFile(mockFile, 'LISTING_ATTACHMENT');
      expect(mockXHR.open).toHaveBeenCalledWith('POST', mockPresign.url);
      expect(result).toEqual(mockAttachment);
    });

    it('supports cancellation via AbortSignal', async () => {
      const mockFile = new File(['data'], 'test.png', { type: 'image/png' });
      vi.spyOn(uploadsApi, 'presignUpload').mockResolvedValue({
        uploadId: 'up-cancel',
        url: 'https://s3.example/cancel',
        key: 'key',
        expiresAt: '2026-11-03T00:00:00Z',
      });

      const abortController = new AbortController();

      const mockXHR = {
        open: vi.fn(),
        send: vi.fn(function (this: { onabort?: () => void }) {
          abortController.abort();
        }),
        setRequestHeader: vi.fn(),
        abort: vi.fn(function (this: { onabort?: () => void }) {
          this.onabort?.();
        }),
        status: 0,
        upload: { onprogress: null },
      };

      function MockXHR3() {
        return mockXHR;
      }

      vi.stubGlobal('XMLHttpRequest', MockXHR3);

      await expect(
        uploadFile(mockFile, 'LISTING_IMAGE', { signal: abortController.signal }),
      ).rejects.toThrow();
      expect(mockXHR.abort).toHaveBeenCalled();
    });

    it('rejects when HTTP status is not 2xx', async () => {
      const mockFile = new File(['data'], 'test.png', { type: 'image/png' });
      vi.spyOn(uploadsApi, 'presignUpload').mockResolvedValue({
        uploadId: 'up-err',
        url: 'https://s3.example/err',
        key: 'key',
        expiresAt: '2026-11-03T00:00:00Z',
      });

      const mockXHR = {
        open: vi.fn(),
        send: vi.fn(function (this: { onload?: () => void; status: number }) {
          this.status = 500;
          this.onload?.();
        }),
        setRequestHeader: vi.fn(),
        abort: vi.fn(),
        status: 500,
        upload: { onprogress: null },
      };

      function MockXHR4() {
        return mockXHR;
      }

      vi.stubGlobal('XMLHttpRequest', MockXHR4);

      await expect(uploadFile(mockFile, 'LISTING_IMAGE')).rejects.toThrow(
        'Upload failed with HTTP status 500',
      );
    });
  });
});
