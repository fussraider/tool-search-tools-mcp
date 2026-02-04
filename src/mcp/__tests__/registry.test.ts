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

    it('should handle partial cache hits (mix of cached and new tools)', async () => {
        process.env.MCP_SEARCH_MODE = 'vector';
        const registry = new MCPRegistry();
        const mockClient = {
            listTools: vi.fn().mockResolvedValue({
                tools: [
                    { name: 'cached-tool', description: 'Cached tool', inputSchema: { type: 'object' } },
                    { name: 'new-tool', description: 'New tool', inputSchema: { type: 'object' } }
                ]
            })
        } as any;

        const mockCache = {'cached-tool': [0.1, 0.1, 0.1]};
        (embeddingService.getCachedEmbeddings as any).mockResolvedValue(mockCache);
        (embeddingService.generateEmbedding as any).mockResolvedValue([0.2, 0.2, 0.2]);

        await registry.registerToolsFromClient('test-server', mockClient, 'test-hash');

        // Check cached tool
        const cachedTool = registry.tools.find(t => t.name === 'cached-tool');
        expect(cachedTool?.embedding).toEqual([0.1, 0.1, 0.1]);

        // Check new tool
        const newTool = registry.tools.find(t => t.name === 'new-tool');
        expect(newTool?.embedding).toEqual([0.2, 0.2, 0.2]);

        // Should call generate only once
        expect(embeddingService.generateEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should handle embedding generation errors gracefully', async () => {
        process.env.MCP_SEARCH_MODE = 'vector';
        const registry = new MCPRegistry();
        const mockClient = {
            listTools: vi.fn().mockResolvedValue({
                tools: [
                    { name: 'broken-tool', description: 'Broken tool', inputSchema: { type: 'object' } }
                ]
            })
        } as any;

        (embeddingService.getCachedEmbeddings as any).mockResolvedValue(null);
        (embeddingService.generateEmbedding as any).mockRejectedValue(new Error('API error'));

        await registry.registerToolsFromClient('test-server', mockClient, 'test-hash');

        const tool = registry.tools.find(t => t.name === 'broken-tool');
        expect(tool).toBeDefined();
        expect(tool?.embedding).toBeUndefined(); // Should still be registered, but without embedding
    });

    it('should update updatedAt timestamp when tools are registered', async () => {
        const registry = new MCPRegistry();
        const initialUpdatedAt = registry.updatedAt;

        expect(initialUpdatedAt).toBe(0);

        const mockClient = {
            listTools: vi.fn().mockResolvedValue({
                tools: [
                    { name: 'new-tool', description: 'New tool', inputSchema: { type: 'object' } }
                ]
            })
        } as any;

        await registry.registerToolsFromClient('test-server', mockClient);

        expect(registry.updatedAt).toBeGreaterThan(initialUpdatedAt);
    });

    it('should register a skill correctly', async () => {
        const registry = new MCPRegistry();
        const skill = {
            name: 'test-skill',
            description: 'A test skill',
            parameters: { param1: 'string' },
            steps: []
        };

        // Mock generateEmbedding to return a dummy embedding
        (embeddingService.generateEmbedding as any).mockResolvedValue([0.1, 0.2, 0.3]);

        // Mock process.env to ensure vector mode if needed for embedding generation check,
        // though registerSkill logic uses env var check.
        process.env.MCP_SEARCH_MODE = 'vector';

        await registry.registerSkill(skill);

        const registeredSkill = registry.tools.find(t => t.name === 'test-skill');
        expect(registeredSkill).toBeDefined();
        expect(registeredSkill?.isSkill).toBe(true);
        expect(registeredSkill?.description).toBe('A test skill');
        expect(registeredSkill?.schemaKeywords).toContain('test');
        expect(registeredSkill?.schemaKeywords).toContain('skill');
        expect(registeredSkill?.schemaKeywords).toContain('param1');
        expect(registeredSkill?.embedding).toEqual([0.1, 0.2, 0.3]);
    });
});
