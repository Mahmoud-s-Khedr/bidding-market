import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Attachment, UploadPresignInput, UploadPresignResponse } from '@market/shared';
import type { AuthUser } from '../../common/auth.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../../storage/storage.service.js';
import { generateCuid, sanitizeFileName } from './uploads.util.js';

/**
 * UploadsService handles presigned upload URLs, upload completion validation,
 * and authorized short-lived read URLs.
 *
 * Out of scope: Scheduled cleanup of uncompleted PENDING uploads. In production,
 * stale PENDING uploads should be cleaned up via S3 bucket lifecycle rules (e.g. abort incomplete
 * multipart / expire uncommitted objects) or a background cron job.
 */
@Injectable()
export class UploadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async presign(userId: string, input: UploadPresignInput): Promise<UploadPresignResponse> {
    const sanitized = sanitizeFileName(input.fileName);
    const cuid = generateCuid();
    const key = `${input.purpose.toLowerCase()}/${userId}/${cuid}/${sanitized}`;

    const upload = await this.prisma.upload.create({
      data: {
        id: cuid,
        uploaderId: userId,
        purpose: input.purpose,
        status: 'PENDING',
        key,
        fileName: sanitized,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
      },
    });

    const url = await this.storage.presignPut(key, input.mimeType, input.sizeBytes);
    const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();

    return {
      uploadId: upload.id,
      url,
      headers: {
        'content-type': input.mimeType,
      },
      key: upload.key,
      expiresAt,
    };
  }

  async complete(userId: string, id: string): Promise<Attachment> {
    const upload = await this.prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      throw new NotFoundException('Upload not found');
    }

    if (upload.uploaderId !== userId) {
      throw new ForbiddenException('You are not the owner of this upload');
    }

    let head;
    try {
      head = await this.storage.headObject(upload.key);
    } catch {
      throw new BadRequestException('Uploaded file not found in storage');
    }

    if (head.ContentLength !== upload.sizeBytes) {
      throw new BadRequestException('Uploaded file size mismatch');
    }

    if (head.ContentType && head.ContentType !== upload.mimeType) {
      throw new BadRequestException('Uploaded file content type mismatch');
    }

    const updated = await this.prisma.upload.update({
      where: { id },
      data: {
        status: 'READY',
        completedAt: new Date(),
      },
    });

    const url = await this.storage.presignGet(updated.key);

    return {
      id: updated.id,
      key: updated.key,
      url,
      fileName: updated.fileName,
      mimeType: updated.mimeType,
      sizeBytes: updated.sizeBytes,
    };
  }

  async isAuthorizedForUpload(user: AuthUser, id: string, uploaderId: string): Promise<boolean> {
    if (user.role === 'ADMIN' || uploaderId === user.id) {
      return true;
    }

    // 1. Attached to a publicly visible listing
    const publicListing = await this.prisma.listing.findFirst({
      where: {
        OR: [{ images: { some: { uploadId: id } } }, { attachments: { some: { uploadId: id } } }],
        status: { in: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CLOSED'] },
      },
      select: { id: true },
    });
    if (publicListing) return true;

    // 2. Attached to a listing owned by user (e.g. DRAFT)
    const ownerListing = await this.prisma.listing.findFirst({
      where: {
        ownerId: user.id,
        OR: [{ images: { some: { uploadId: id } } }, { attachments: { some: { uploadId: id } } }],
      },
      select: { id: true },
    });
    if (ownerListing) return true;

    // 3. Attached to a bid where user is bidder or listing owner
    const bidParty = await this.prisma.bid.findFirst({
      where: {
        attachments: { some: { uploadId: id } },
        OR: [{ bidderId: user.id }, { listing: { ownerId: user.id } }],
      },
      select: { id: true },
    });
    if (bidParty) return true;

    // 4. Attached to a message where user is participant
    const messageParty = await this.prisma.message.findFirst({
      where: {
        attachments: { some: { uploadId: id } },
        conversation: {
          participants: { some: { userId: user.id } },
        },
      },
      select: { id: true },
    });
    if (messageParty) return true;

    // 5. Attached to a deliverable where user is agreement buyer or provider
    const deliverableParty = await this.prisma.deliverable.findFirst({
      where: {
        attachments: { some: { uploadId: id } },
        agreement: {
          OR: [{ buyerId: user.id }, { providerId: user.id }],
        },
      },
      select: { id: true },
    });
    if (deliverableParty) return true;

    return false;
  }

  async getUrl(user: AuthUser, id: string): Promise<{ url: string; expiresAt: string }> {
    const upload = await this.prisma.upload.findUnique({ where: { id } });
    if (!upload) {
      throw new NotFoundException('Upload not found');
    }

    const authorized = await this.isAuthorizedForUpload(user, id, upload.uploaderId);
    if (!authorized) {
      throw new NotFoundException('Upload not found');
    }

    const url = await this.storage.presignGet(upload.key);
    const expiresAt = new Date(Date.now() + 300 * 1000).toISOString();

    return { url, expiresAt };
  }
}
