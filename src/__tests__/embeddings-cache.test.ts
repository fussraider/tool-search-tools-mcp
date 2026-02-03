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

    it('should save embeddings to cache correctly', async () => {
        const hash = 'test-save-hash';
        const embeddings = {
            'key1': new Float32Array([0.1, 0.2]),
            'key2': [0.3, 0.4]
        };

        await embeddingService.saveEmbeddingsToCache(hash, embeddings);

        const cachePath = path.join(CACHE_DIR, `${hash}.json`);
        const content = await fs.readFile(cachePath, 'utf-8');
        const loaded = JSON.parse(content);

        expect(loaded).toHaveProperty('key1');
        expect(loaded).toHaveProperty('key2');
        // Float32Array precision might cause tiny diffs if we are not careful, but for 0.1, 0.2 it is usually fine in JS doubles
        // Actually Float32Array(0.1) is not exactly 0.1 double.
        // So we should expect closeTo if strict equality fails.
        // But JSON.stringify(float32array) uses normal string conversion of the stored float values.

        // Let's verify what happens.
        // Float32Array([0.1])[0] -> 0.10000000149011612
        // JSON.stringify will output that long number or close to it.
        // When parsed back, it should be the same number.

        expect(loaded['key1'][0]).toBeCloseTo(0.1);
        expect(loaded['key1'][1]).toBeCloseTo(0.2);
        expect(loaded['key2']).toEqual([0.3, 0.4]);
    });
});
