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

    it('rejects files with empty MIME type client-side', () => {
      const file = new File(['bytes'], 'photo.png', { type: '' });
      const res = validateFileForPurpose(file, 'LISTING_IMAGE');
      expect(res.valid).toBe(false);
      expect(res.error).toBe('File must have a valid MIME type.');
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
    it('performs presign -> PUT/XHR upload -> complete flow using real API presign shape', async () => {
      const mockFile = new File(['content'], 'test.png', { type: 'image/png' });
      const mockPresign = {
        uploadId: 'up-123',
        url: 'https://s3.example/upload',
        headers: { 'content-type': 'image/png', 'x-amz-acl': 'private' },
        key: 'listing_image/u-1/up-123/test.png',
        expiresAt: '2026-11-03T01:00:00Z',
      };
      const mockAttachment = {
        id: 'att-123',
        key: 'listing_image/u-1/up-123/test.png',
        url: 'https://cdn.example/test.png',
        fileName: 'test.png',
        mimeType: 'image/png',
        sizeBytes: 7,
      };

      vi.spyOn(uploadsApi, 'presignUpload').mockResolvedValue(mockPresign);
      const completeSpy = vi.spyOn(uploadsApi, 'completeUpload').mockResolvedValue(mockAttachment);

      const setHeaderCalls: [string, string][] = [];
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
        setRequestHeader: vi.fn((key: string, val: string) => {
          setHeaderCalls.push([key, val]);
        }),
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
      expect(completeSpy).toHaveBeenCalledWith('up-123');
      expect(result).toEqual(mockAttachment);

      // Verify no Authorization header is sent to the storage URL
      const hasAuthHeader = setHeaderCalls.some(([k]) => k.toLowerCase() === 'authorization');
      expect(hasAuthHeader).toBe(false);
    });

    it('sets content-type header only once when API returns lowercase content-type', async () => {
      const mockFile = new File(['content'], 'test.png', { type: 'image/png' });
      vi.spyOn(uploadsApi, 'presignUpload').mockResolvedValue({
        uploadId: 'up-case',
        url: 'https://s3.example/case',
        headers: {
          'content-type': 'image/png',
        },
        key: 'key',
        expiresAt: '2026-11-03T01:00:00Z',
      });
      vi.spyOn(uploadsApi, 'completeUpload').mockResolvedValue({
        id: 'att-case',
        key: 'key',
        fileName: 'test.png',
        mimeType: 'image/png',
        sizeBytes: 7,
      });

      const setHeaderCalls: [string, string][] = [];
      const mockXHR = {
        open: vi.fn(),
        send: vi.fn(function (this: { onload?: () => void; status: number }) {
          this.status = 200;
          this.onload?.();
        }),
        setRequestHeader: vi.fn((key: string, val: string) => {
          setHeaderCalls.push([key, val]);
        }),
        abort: vi.fn(),
        status: 200,
        upload: { onprogress: null },
      };

      vi.stubGlobal('XMLHttpRequest', function () {
        return mockXHR;
      });

      await uploadFile(mockFile, 'LISTING_IMAGE');

      // Filter headers for content-type case-insensitively
      const contentTypeCalls = setHeaderCalls.filter(([k]) => k.toLowerCase() === 'content-type');
      expect(contentTypeCalls).toHaveLength(1);
      expect(contentTypeCalls[0]![1]).toBe('image/png');
    });

    it('supports cancellation via AbortSignal and does not call completeUpload', async () => {
      const mockFile = new File(['data'], 'test.png', { type: 'image/png' });
      vi.spyOn(uploadsApi, 'presignUpload').mockResolvedValue({
        uploadId: 'up-cancel',
        url: 'https://s3.example/cancel',
        headers: {},
        key: 'key',
        expiresAt: '2026-11-03T01:00:00Z',
      });
      const completeSpy = vi.spyOn(uploadsApi, 'completeUpload');

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

      vi.stubGlobal('XMLHttpRequest', function () {
        return mockXHR;
      });

      await expect(
        uploadFile(mockFile, 'LISTING_IMAGE', { signal: abortController.signal }),
      ).rejects.toThrow();
      expect(mockXHR.abort).toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();
    });

    it('aborts before or during presign when signal is already aborted', async () => {
      const mockFile = new File(['data'], 'test.png', { type: 'image/png' });
      const presignSpy = vi.spyOn(uploadsApi, 'presignUpload');
      const completeSpy = vi.spyOn(uploadsApi, 'completeUpload');

      const controller = new AbortController();
      controller.abort();

      await expect(
        uploadFile(mockFile, 'LISTING_IMAGE', { signal: controller.signal }),
      ).rejects.toThrow();

      expect(presignSpy).not.toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();
    });

    it('rejects when HTTP status is not 2xx and does not call completeUpload', async () => {
      const mockFile = new File(['data'], 'test.png', { type: 'image/png' });
      vi.spyOn(uploadsApi, 'presignUpload').mockResolvedValue({
        uploadId: 'up-err',
        url: 'https://s3.example/err',
        headers: {},
        key: 'key',
        expiresAt: '2026-11-03T01:00:00Z',
      });
      const completeSpy = vi.spyOn(uploadsApi, 'completeUpload');

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

      vi.stubGlobal('XMLHttpRequest', function () {
        return mockXHR;
      });

      await expect(uploadFile(mockFile, 'LISTING_IMAGE')).rejects.toThrow(
        'Upload failed with HTTP status 500',
      );
      expect(completeSpy).not.toHaveBeenCalled();
    });
  });
});
