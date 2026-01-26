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

describe('MCPRegistry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.MCP_SEARCH_MODE;
    });
    it('should correctly extract keywords from tool', () => {
        const registry = new MCPRegistry();
        const tool = {
            name: 'calculate_sum',
            description: 'Calculates the sum of two numbers.',
            inputSchema: {
                type: 'object',
                properties: {
                    a: {type: 'number', description: 'First number'},
                    b: {type: 'number', description: 'Second number'}
                }
            }
        };

        const keywords = (registry as any).extractToolKeywords(tool);

        // From name
        expect(keywords).toContain('calculate');
        expect(keywords).toContain('sum');

        // From description
        expect(keywords).toContain('calculates');
        expect(keywords).toContain('numbers');

        // From properties
        expect(keywords).toContain('a');
        expect(keywords).toContain('b');
        expect(keywords).toContain('first');
        expect(keywords).toContain('second');
        expect(keywords).toContain('number');
    });

    it('should handle tools without description or schema', () => {
        const registry = new MCPRegistry();
        const tool = {
            name: 'simple-tool'
        };

        const keywords = (registry as any).extractToolKeywords(tool);
        expect(keywords).toContain('simple');
        expect(keywords).toContain('tool');
    });

    it('should generate embeddings when mode is vector', async () => {
        process.env.MCP_SEARCH_MODE = 'vector';
        const registry = new MCPRegistry();
        const mockClient = {
            listTools: vi.fn().mockResolvedValue({
                tools: [
                    {
                        name: 'tool1',
                        description: 'desc1',
                        inputSchema: {type: 'object', properties: {}}
                    }
                ]
            })
        } as any;

        (embeddingService.generateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);
        (embeddingService.getCachedEmbeddings as any).mockResolvedValue(null);

        await registry.registerToolsFromClient('test-server', mockClient, 'test-hash');

        expect(embeddingService.generateEmbedding).toHaveBeenCalled();
        expect(registry.tools[0].embedding).toEqual([0.1, 0.2, 0.3]);
        expect(embeddingService.saveEmbeddingsToCache).toHaveBeenCalledWith('test-hash', {'tool1': [0.1, 0.2, 0.3]});
    });

    it('should use cached embeddings if available', async () => {
        process.env.MCP_SEARCH_MODE = 'vector';
        const registry = new MCPRegistry();
        const mockClient = {
            listTools: vi.fn().mockResolvedValue({
                tools: [
                    {
                        name: 'tool1',
                        description: 'desc1',
                        inputSchema: {type: 'object', properties: {}}
                    }
                ]
            })
        } as any;

        const mockCache = {'tool1': [0.4, 0.5, 0.6]};
        (embeddingService.getCachedEmbeddings as any).mockResolvedValue(mockCache);

        await registry.registerToolsFromClient('test-server', mockClient, 'test-hash');

        expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
        expect(registry.tools[0].embedding).toEqual([0.4, 0.5, 0.6]);
    });

    it('should NOT generate embeddings when mode is NOT vector', async () => {
        delete process.env.MCP_SEARCH_MODE;
        const registry = new MCPRegistry();
        const mockClient = {
            listTools: vi.fn().mockResolvedValue({
                tools: [
                    {
                        name: 'tool1',
                        description: 'desc1',
                        inputSchema: {type: 'object', properties: {}}
                    }
                ]
            })
        } as any;

        await registry.registerToolsFromClient('test-server', mockClient, 'test-hash');

        expect(embeddingService.generateEmbedding).not.toHaveBeenCalled();
        expect(embeddingService.getCachedEmbeddings).not.toHaveBeenCalled();
        expect(registry.tools[0].embedding).toBeUndefined();
    });

    it('should handle tools without inputSchema', () => {
        const registry = new MCPRegistry();
        const tool = {
            name: 'no-schema',
            description: 'No schema here'
        };

        const keywords = (registry as any).extractToolKeywords(tool);
        expect(keywords).toContain('schema');
        expect(keywords).not.toContain(undefined);
    });
});
