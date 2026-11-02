import { describe, expect, it } from 'vitest';
import { StorageService } from '../src/storage/storage.service.js';
import { parseEnv } from '../src/common/env.js';
describe('storage', () => {
  it('puts, gets and heads signed objects', async () => {
    const storage = new StorageService(parseEnv(process.env));
    await storage.onModuleInit();
    await storage.onModuleInit();
    const key = `test/${Date.now()}.txt`;
    const put = await storage.presignPut(key, 'text/plain', 5);
    await expect(
      fetch(put, { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'hello' }),
    ).resolves.toMatchObject({ ok: true });
    const get = await storage.presignGet(key);
    expect(await (await fetch(get)).text()).toBe('hello');
    expect((await storage.headObject(key)).ContentLength).toBe(5);
    await storage.deleteObject(key);
  });
});
