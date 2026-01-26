import {beforeEach, describe, expect, it, vi} from 'vitest';
import {MCPRegistry} from '../mcp/registry.js';
import {searchTools} from '../mcp/search.js';
import {embeddingService} from '../utils/embeddings.js';

// Мокаем эмбеддинги
vi.mock('../utils/embeddings.js', async () => {
    const actual = await vi.importActual('../utils/embeddings.js') as any;
    return {
        ...actual,
        embeddingService: {
            generateEmbedding: vi.fn(),
            getCachedEmbeddings: vi.fn().mockResolvedValue(null),
            saveEmbeddingsToCache: vi.fn(),
            cleanupUnusedCache: vi.fn()
        }
    };
});

describe('Search Integration', () => {
    let registry: MCPRegistry;

    beforeEach(() => {
        vi.clearAllMocks();
        registry = new MCPRegistry();
        delete process.env.MCP_SEARCH_MODE;

        // Добавляем тестовые инструменты вручную в приватное поле для тестов
        (registry as any)._tools = [
            {
                name: 'read_file',
                description: 'Read content from a file',
                server: 'fs',
                schemaKeywords: 'read file filesystem content',
                embedding: [1, 0, 0] // Mock vector
            },
            {
                name: 'write_file',
                description: 'Write content to a file',
                server: 'fs',
                schemaKeywords: 'write file filesystem save',
                embedding: [0, 1, 0] // Mock vector
            },
            {
                name: 'list_directory',
                description: 'List files in a directory',
                server: 'fs',
                schemaKeywords: 'list dir directory files',
                embedding: [0, 0, 1] // Mock vector
            }
        ];
    });

    it('should find tools using fuzzy search (default)', async () => {
        const results = await searchTools(registry, 'read file');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe('read_file');
    });

    it('should find tools using vector search', async () => {
        process.env.MCP_SEARCH_MODE = 'vector';
        // Настраиваем мок так, чтобы запрос "read" был близок к инструменту read_file [1,0,0]
        (embeddingService.generateEmbedding as any).mockResolvedValue([0.9, 0.1, 0.1]);

        const results = await searchTools(registry, 'read');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe('read_file');
    });

    it('should respect limits', async () => {
        const results = await searchTools(registry, 'file', 1);
        expect(results.length).toBe(1);
    });

    it('should return empty array when no matches found below threshold in vector mode', async () => {
        process.env.MCP_SEARCH_MODE = 'vector';
        // Запрос совсем не похож на наши инструменты
        (embeddingService.generateEmbedding as any).mockResolvedValue([-1, -1, -1]);

        const results = await searchTools(registry, 'something completely different');
        expect(results.length).toBe(0);
    });
});
