import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MCPRegistry} from '../registry.js';
import {embeddingService} from '../../utils/embeddings.js';

vi.mock('../../utils/embeddings.js', () => ({
    embeddingService: {
        generateEmbedding: vi.fn(),
        getCachedEmbeddings: vi.fn(),
        saveEmbeddingsToCache: vi.fn(),
        cleanupUnusedCache: vi.fn()
    },
    EmbeddingService: {
        generateServerHash: vi.fn().mockReturnValue('mock-hash'),
        calculateMemoryUsage: vi.fn().mockReturnValue(100),
        formatBytes: vi.fn().mockReturnValue('100 Bytes')
    }
}));

describe('MCPRegistry Tool Map', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.MCP_SEARCH_MODE;
    });

    it('should retrieve a tool by server and name', async () => {
        const registry = new MCPRegistry();
        const mockClient = {
            listTools: vi.fn().mockResolvedValue({
                tools: [
                    { name: 'tool1', description: 'desc1', inputSchema: { type: 'object' } }
                ]
            })
        } as any;

        await registry.registerToolsFromClient('server1', mockClient, 'hash1');

        const tool = registry.getTool('server1', 'tool1');
        expect(tool).toBeDefined();
        expect(tool?.name).toBe('tool1');
        expect(tool?.server).toBe('server1');

        const notFound = registry.getTool('server1', 'tool2');
        expect(notFound).toBeUndefined();

        const wrongServer = registry.getTool('server2', 'tool1');
        expect(wrongServer).toBeUndefined();
    });

    it('should retrieve a skill by internal server and name', async () => {
        const registry = new MCPRegistry();
        const skill = {
            name: 'skill1',
            description: 'desc',
            parameters: {},
            steps: []
        };

        await registry.registerSkill(skill);

        const tool = registry.getTool('internal', 'skill1');
        expect(tool).toBeDefined();
        expect(tool?.name).toBe('skill1');
        expect(tool?.server).toBe('internal');

        const notFound = registry.getTool('internal', 'skill2');
        expect(notFound).toBeUndefined();
    });
});
