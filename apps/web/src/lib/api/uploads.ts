import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import { queryKeys } from './query-keys';
import type {
  Attachment,
  PresignUploadRequest,
  PresignUploadResponse,
  PresignedGetUrlResponse,
} from './types';

export async function presignUpload(data: PresignUploadRequest): Promise<PresignUploadResponse> {
  return api.post<PresignUploadResponse>('/uploads/presign', data);
}

export async function completeUpload(uploadId: string): Promise<Attachment> {
  return api.post<Attachment>(`/uploads/${uploadId}/complete`);
}

export async function getAttachmentUrl(id: string): Promise<PresignedGetUrlResponse> {
  return api.get<PresignedGetUrlResponse>(`/uploads/${id}/url`);
}

export function useAttachmentUrl(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.uploads.url(id),
    queryFn: () => getAttachmentUrl(id),
    enabled: options?.enabled ?? Boolean(id),
    staleTime: 1000 * 60 * 10, // 10 minutes cache for signed GET URLs
  });
}
