import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CACHE_DIR, embeddingService} from '../utils/embeddings.js';
import fs from 'fs/promises';
import path from 'path';

vi.mock('../utils/logger.js', () => ({
    logger: {
        child: () => ({
            info: vi.fn(),
            debug: vi.fn(),
            error: vi.fn()
        })
    }
}));

describe('EmbeddingService Cache Management', () => {
    beforeEach(async () => {
        try {
            await fs.mkdir(CACHE_DIR, {recursive: true});
        } catch (e) {
        }
    });

    afterEach(async () => {
        try {
            const files = await fs.readdir(CACHE_DIR);
            for (const file of files) {
                await fs.unlink(path.join(CACHE_DIR, file));
            }
        } catch (e) {
        }
    });

    it('should calculate memory usage correctly', () => {
        const mockEmbeddings = {
            'tool1': [0.1, 0.2, 0.3], // key 5 chars * 2 = 10 bytes, vector 3 * 8 = 24 bytes. Total 34.
            't2': [0.5] // key 2 chars * 2 = 4 bytes, vector 1 * 8 = 8 bytes. Total 12.
        };
        const usage = (embeddingService.constructor as any).calculateMemoryUsage(mockEmbeddings);
        expect(usage).toBe(34 + 12);
    });

    it('should format bytes correctly', () => {
        const format = (embeddingService.constructor as any).formatBytes;
        expect(format(0)).toBe('0 Bytes');
        expect(format(1024)).toBe('1 KB');
        expect(format(1024 * 1024)).toBe('1 MB');
    });

    it('should cleanup unused cache files', async () => {
        const activeHash = 'active-hash';
        const unusedHash = 'unused-hash';

        await fs.writeFile(path.join(CACHE_DIR, `${activeHash}.json`), '{}');
        await fs.writeFile(path.join(CACHE_DIR, `${unusedHash}.json`), '{}');
        await fs.writeFile(path.join(CACHE_DIR, `other-file.txt`), 'hello');

        await embeddingService.cleanupUnusedCache(new Set([activeHash]));

        const files = await fs.readdir(CACHE_DIR);
        expect(files).toContain(`${activeHash}.json`);
        expect(files).not.toContain(`${unusedHash}.json`);
        expect(files).toContain(`other-file.txt`); // Should not touch non-json files
    });
});
