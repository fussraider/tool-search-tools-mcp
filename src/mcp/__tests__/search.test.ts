import {beforeEach, describe, expect, it, vi} from 'vitest';
import {searchTools} from '../search.js';
import {MCPRegistry} from '../registry.js';
import {embeddingService} from '../../utils/embeddings.js';

vi.mock('../../utils/embeddings.js', () => ({
    embeddingService: {
        generateEmbedding: vi.fn()
    }
}));

describe('searchTools', () => {
    const mockClient = {} as any;

    const mockRegistry = {
        updatedAt: Date.now(),
        tools: [
            {
                name: 'get_weather',
                description: 'Get current weather in a city',
                server: 'weather-server',
                schemaKeywords: 'weather city temperature',
                client: mockClient,
                embedding: [1, 0, 0]
            },
            {
                name: 'search_github',
                description: 'Search for repositories on GitHub',
                server: 'github-server',
                schemaKeywords: 'git repo code',
                client: mockClient,
                embedding: [0, 1, 0]
            },
            {
                name: 'list_files',
                description: 'List files in a directory',
                server: 'fs-server',
                schemaKeywords: 'file folder directory',
                client: mockClient,
                embedding: [0, 0, 1]
            }
        ]
    } as unknown as MCPRegistry;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.MCP_SEARCH_MODE;
    });

    describe('Fuse search (default)', () => {
        it('should find tools by name', async () => {
            const results = await searchTools(mockRegistry, 'weather');
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('get_weather');
        });

        it('should find tools by description', async () => {
            const results = await searchTools(mockRegistry, 'repositories');
            expect(results).toHaveLength(1);
            expect(results[0].name).toBe('search_github');
        });

        it('should rank exact matches higher', async () => {
            const results = await searchTools(mockRegistry, 'search');
            expect(results[0].name).toBe('search_github');
        });
    });

    describe('Vector search', () => {
        beforeEach(() => {
            process.env.MCP_SEARCH_MODE = 'vector';
        });

        it('should find tools using vector similarity', async () => {
            // Mock embedding for query to be close to 'get_weather' [1, 0, 0]
            (embeddingService.generateEmbedding as any).mockResolvedValue([0.9, 0.1, 0.1]);

            const results = await searchTools(mockRegistry, 'some weather query');
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].name).toBe('get_weather');
            expect(embeddingService.generateEmbedding).toHaveBeenCalled();
        });

        it('should find github tool when query is close to it', async () => {
            // Close to [0, 1, 0]
            (embeddingService.generateEmbedding as any).mockResolvedValue([0.1, 0.9, 0.1]);

            const results = await searchTools(mockRegistry, 'git search');
            expect(results[0].name).toBe('search_github');
        });
    });
});
