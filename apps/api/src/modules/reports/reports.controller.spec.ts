import { describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/auth.js';
import { AdminController, ReportsController } from './reports.controller.js';

describe('ReportsController', () => {
  it('delegates report creation to ReportsService', async () => {
    const reportsService = { create: vi.fn().mockResolvedValue({ id: 'rep-1' }) };
    const controller = new ReportsController(reportsService as never);
    const user: AuthUser = { id: 'u1', role: 'USER' };
    const body = { targetType: 'USER' as const, targetId: 'u2', reason: 'SPAM' as const };
    const res = await controller.create(user, body);
    expect(res).toEqual({ id: 'rep-1' });
    expect(reportsService.create).toHaveBeenCalledWith(user, body);
  });
});

describe('AdminController', () => {
  it('delegates admin endpoints to AdminService', async () => {
    const adminService = {
      stats: vi.fn().mockResolvedValue({ users: {} }),
      users: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      updateUser: vi.fn().mockResolvedValue({ id: 'u1' }),
      listings: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      removeListing: vi.fn().mockResolvedValue({ id: 'l1' }),
      restoreListing: vi.fn().mockResolvedValue({ id: 'l1' }),
      reports: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      resolveReport: vi.fn().mockResolvedValue({ id: 'r1' }),
      audit: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    };
    const controller = new AdminController(adminService as never);
    const adminUser: AuthUser = { id: 'admin-1', role: 'ADMIN' };

    await controller.stats();
    expect(adminService.stats).toHaveBeenCalled();

    await controller.users({ limit: 10 });
    expect(adminService.users).toHaveBeenCalledWith({ limit: 10 });

    await controller.updateUser(adminUser, { id: 'u2' }, { role: 'USER' });
    expect(adminService.updateUser).toHaveBeenCalledWith('admin-1', 'u2', { role: 'USER' });

    await controller.listings({ limit: 10 });
    expect(adminService.listings).toHaveBeenCalledWith({ limit: 10 });

    await controller.removeListing(adminUser, { id: 'l1' }, { reason: 'policy' });
    expect(adminService.removeListing).toHaveBeenCalledWith('admin-1', 'l1', 'policy');

    await controller.restoreListing(adminUser, { id: 'l1' }, { reason: 'appeal' });
    expect(adminService.restoreListing).toHaveBeenCalledWith('admin-1', 'l1', 'appeal');

    await controller.reports({ limit: 10 });
    expect(adminService.reports).toHaveBeenCalledWith({ limit: 10 });

    await controller.resolve(adminUser, { id: 'r1' }, { action: 'DISMISS', note: 'reviewed' });
    expect(adminService.resolveReport).toHaveBeenCalledWith('admin-1', 'r1', {
      action: 'DISMISS',
      note: 'reviewed',
    });

    await controller.audit({ limit: 10 });
    expect(adminService.audit).toHaveBeenCalledWith({ limit: 10 });
  });
});
