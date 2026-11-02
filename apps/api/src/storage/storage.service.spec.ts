import { describe, expect, it, vi } from 'vitest';
const send = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = send;
  },
  CreateBucketCommand: class {
    constructor(public input: unknown) {}
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('signed'),
}));
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service.js';
describe('StorageService', () => {
  it('creates bucket and signs operations', async () => {
    const service = new StorageService();
    await service.onModuleInit();
    expect(send).toHaveBeenCalled();
    await expect(service.presignPut('k', 'text/plain', 1)).resolves.toBe('signed');
    await expect(service.presignGet('k')).resolves.toBe('signed');
    expect(getSignedUrl).toHaveBeenCalledTimes(2);
    await service.headObject('k');
    await service.deleteObject('k');
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('ignores existing bucket', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error(), { name: 'BucketAlreadyOwnedByYou' }));
    await expect(new StorageService().onModuleInit()).resolves.toBeUndefined();
  });
});
