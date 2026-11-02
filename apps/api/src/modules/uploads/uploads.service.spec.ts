import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadsController } from './uploads.controller.js';
import { UploadsService } from './uploads.service.js';
import { sanitizeFileName } from './uploads.util.js';

describe('uploads.util', () => {
  it('sanitizes file names correctly', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFileName('C:\\Windows\\System32\\driver.sys')).toBe('driver.sys');
    expect(sanitizeFileName('hello\x00world\x1ftest.pdf')).toBe('helloworldtest.pdf');
    expect(sanitizeFileName('my file (1) & special.png')).toBe('my_file_1_special.png');
    expect(sanitizeFileName('...')).toBe('file');
    const longName = 'a'.repeat(120) + '.pdf';
    const sanitized = sanitizeFileName(longName, 50);
    expect(sanitized.length).toBeLessThanOrEqual(50);
    expect(sanitized.endsWith('.pdf')).toBe(true);
  });
});

describe('UploadsService', () => {
  let service: UploadsService;
  let prisma: {
    upload: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    listing: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    bid: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    message: {
      findFirst: ReturnType<typeof vi.fn>;
    };
    deliverable: {
      findFirst: ReturnType<typeof vi.fn>;
    };
  };
  let storage: {
    presignPut: ReturnType<typeof vi.fn>;
    presignGet: ReturnType<typeof vi.fn>;
    headObject: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    prisma = {
      upload: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      listing: { findFirst: vi.fn() },
      bid: { findFirst: vi.fn() },
      message: { findFirst: vi.fn() },
      deliverable: { findFirst: vi.fn() },
    };
    storage = {
      presignPut: vi.fn(),
      presignGet: vi.fn(),
      headObject: vi.fn(),
    };
    service = new UploadsService(prisma as never, storage as never);
  });

  describe('presign', () => {
    it('creates PENDING upload and returns presigned PUT url', async () => {
      prisma.upload.create.mockResolvedValueOnce({
        id: 'c123',
        key: 'listing_image/u1/c123/photo.jpg',
      });
      storage.presignPut.mockResolvedValueOnce('https://s3/put-photo');

      const res = await service.presign('u1', {
        purpose: 'LISTING_IMAGE',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 5000,
      });

      expect(res.uploadId).toBe('c123');
      expect(res.url).toBe('https://s3/put-photo');
      expect(res.headers).toEqual({ 'content-type': 'image/jpeg' });
      expect(res.key).toBe('listing_image/u1/c123/photo.jpg');
      expect(res.expiresAt).toBeDefined();
    });
  });

  describe('complete', () => {
    it('throws 404 when upload not found', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce(null);
      await expect(service.complete('u1', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('throws 403 when user is not the uploader', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({ id: 'up1', uploaderId: 'other' });
      await expect(service.complete('u1', 'up1')).rejects.toThrow(ForbiddenException);
    });

    it('throws 409 when upload is already READY', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({
        id: 'up1',
        uploaderId: 'u1',
        status: 'READY',
      });
      await expect(service.complete('u1', 'up1')).rejects.toThrow(ConflictException);
    });

    it('throws 400 when storage HEAD response is missing ContentType', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({
        id: 'up1',
        uploaderId: 'u1',
        status: 'PENDING',
        key: 'k',
        sizeBytes: 100,
        mimeType: 'image/jpeg',
      });
      storage.headObject.mockResolvedValueOnce({ ContentLength: 100, ContentType: undefined });
      await expect(service.complete('u1', 'up1')).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when file not found in storage', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({
        id: 'up1',
        uploaderId: 'u1',
        key: 'k',
        sizeBytes: 100,
        mimeType: 'image/jpeg',
      });
      storage.headObject.mockRejectedValueOnce(new Error('NotFound'));

      await expect(service.complete('u1', 'up1')).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when file size does not match presigned size', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({
        id: 'up1',
        uploaderId: 'u1',
        key: 'k',
        sizeBytes: 100,
        mimeType: 'image/jpeg',
      });
      storage.headObject.mockResolvedValueOnce({ ContentLength: 90, ContentType: 'image/jpeg' });

      await expect(service.complete('u1', 'up1')).rejects.toThrow(BadRequestException);
    });

    it('throws 400 when content-type does not match', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({
        id: 'up1',
        uploaderId: 'u1',
        key: 'k',
        sizeBytes: 100,
        mimeType: 'image/jpeg',
      });
      storage.headObject.mockResolvedValueOnce({ ContentLength: 100, ContentType: 'text/plain' });

      await expect(service.complete('u1', 'up1')).rejects.toThrow(BadRequestException);
    });

    it('marks upload READY and returns Attachment with signed GET URL', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({
        id: 'up1',
        uploaderId: 'u1',
        key: 'k',
        sizeBytes: 100,
        mimeType: 'image/jpeg',
      });
      storage.headObject.mockResolvedValueOnce({ ContentLength: 100, ContentType: 'image/jpeg' });
      prisma.upload.update.mockResolvedValueOnce({
        id: 'up1',
        key: 'k',
        fileName: 'photo.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 100,
        status: 'READY',
      });
      storage.presignGet.mockResolvedValueOnce('https://s3/get-photo');

      const res = await service.complete('u1', 'up1');
      expect(res.id).toBe('up1');
      expect(res.url).toBe('https://s3/get-photo');
      expect(prisma.upload.update).toHaveBeenCalledWith({
        where: { id: 'up1' },
        data: { status: 'READY', completedAt: expect.any(Date) },
      });
    });
  });

  describe('isAuthorizedForUpload & getUrl', () => {
    const user = { id: 'u1', role: 'USER' as const };
    const admin = { id: 'a1', role: 'ADMIN' as const };

    it('authorizes uploader directly', async () => {
      expect(await service.isAuthorizedForUpload(user, 'up1', 'u1')).toBe(true);
    });

    it('authorizes admin directly', async () => {
      expect(await service.isAuthorizedForUpload(admin, 'up1', 'other')).toBe(true);
    });

    it('authorizes when attached to public listing', async () => {
      prisma.listing.findFirst.mockResolvedValueOnce({ id: 'l1' });
      expect(await service.isAuthorizedForUpload(user, 'up1', 'other')).toBe(true);
    });

    it('authorizes when attached to requester listing (draft)', async () => {
      prisma.listing.findFirst
        .mockResolvedValueOnce(null) // public listing
        .mockResolvedValueOnce({ id: 'l2' }); // owner listing
      expect(await service.isAuthorizedForUpload(user, 'up1', 'other')).toBe(true);
    });

    it('authorizes when attached to bid party', async () => {
      prisma.listing.findFirst.mockResolvedValue(null);
      prisma.bid.findFirst.mockResolvedValueOnce({ id: 'b1' });
      expect(await service.isAuthorizedForUpload(user, 'up1', 'other')).toBe(true);
    });

    it('authorizes when attached to message party', async () => {
      prisma.listing.findFirst.mockResolvedValue(null);
      prisma.bid.findFirst.mockResolvedValue(null);
      prisma.message.findFirst.mockResolvedValueOnce({ id: 'm1' });
      expect(await service.isAuthorizedForUpload(user, 'up1', 'other')).toBe(true);
    });

    it('authorizes when attached to deliverable party', async () => {
      prisma.listing.findFirst.mockResolvedValue(null);
      prisma.bid.findFirst.mockResolvedValue(null);
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.deliverable.findFirst.mockResolvedValueOnce({ id: 'd1' });
      expect(await service.isAuthorizedForUpload(user, 'up1', 'other')).toBe(true);
    });

    it('returns false when no relations match', async () => {
      prisma.listing.findFirst.mockResolvedValue(null);
      prisma.bid.findFirst.mockResolvedValue(null);
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.deliverable.findFirst.mockResolvedValue(null);
      expect(await service.isAuthorizedForUpload(user, 'up1', 'other')).toBe(false);
    });

    it('getUrl returns presigned get URL when authorized', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({
        id: 'up1',
        uploaderId: 'u1',
        key: 'k',
      });
      storage.presignGet.mockResolvedValueOnce('https://s3/get');

      const res = await service.getUrl(user, 'up1');
      expect(res.url).toBe('https://s3/get');
      expect(res.expiresAt).toBeDefined();
    });

    it('getUrl throws 404 when unauthorized', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce({
        id: 'up1',
        uploaderId: 'other',
        key: 'k',
      });
      prisma.listing.findFirst.mockResolvedValue(null);
      prisma.bid.findFirst.mockResolvedValue(null);
      prisma.message.findFirst.mockResolvedValue(null);
      prisma.deliverable.findFirst.mockResolvedValue(null);

      await expect(service.getUrl(user, 'up1')).rejects.toThrow(NotFoundException);
    });

    it('getUrl throws 404 when upload does not exist', async () => {
      prisma.upload.findUnique.mockResolvedValueOnce(null);
      await expect(service.getUrl(user, 'missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('UploadsController', () => {
    it('delegates presign, complete, getUrl', async () => {
      vi.spyOn(service, 'presign').mockResolvedValueOnce({ uploadId: '1' } as never);
      vi.spyOn(service, 'complete').mockResolvedValueOnce({ id: '1' } as never);
      vi.spyOn(service, 'getUrl').mockResolvedValueOnce({ url: 'u' } as never);

      const controller = new UploadsController(service);
      const user = { id: 'u1', role: 'USER' as const };

      expect(
        await controller.presign(user, {
          purpose: 'AVATAR',
          fileName: 'a.png',
          mimeType: 'image/png',
          sizeBytes: 10,
        }),
      ).toEqual({ uploadId: '1' });
      expect(await controller.complete(user, { id: '1' })).toEqual({ id: '1' });
      expect(await controller.getUrl(user, { id: '1' })).toEqual({ url: 'u' });
    });
  });
});
