import { describe, it, expect } from 'vitest';
import { searchTools } from '../search.js';
import { MCPRegistry, MCPTool } from '../registry.js';

describe('searchTools', () => {
    const mockClient = {} as any;
    
    const mockRegistry = {
        tools: [
            {
                name: 'get_weather',
                description: 'Get current weather in a city',
                server: 'weather-server',
                schemaKeywords: 'weather city temperature',
                client: mockClient
            },
            {
                name: 'search_github',
                description: 'Search for repositories on GitHub',
                server: 'github-server',
                schemaKeywords: 'git repo code',
                client: mockClient
            },
            {
                name: 'list_files',
                description: 'List files in a directory',
                server: 'fs-server',
                schemaKeywords: 'file folder directory',
                client: mockClient
            }
        ]
    } as unknown as MCPRegistry;

    it('should find tools by name', () => {
        const results = searchTools(mockRegistry, 'weather');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('get_weather');
    });

    it('should find tools by description', () => {
        const results = searchTools(mockRegistry, 'repositories');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('search_github');
    });

    it('should find tools by keywords', () => {
        const results = searchTools(mockRegistry, 'directory');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('list_files');
    });

    it('should respect limit parameter', () => {
        const results = searchTools(mockRegistry, 'e', 1);
        expect(results).toHaveLength(1);
    });

    it('should rank exact matches higher', () => {
        // 'search' matches 'search_github' in name and description
        const results = searchTools(mockRegistry, 'search');
        expect(results[0].name).toBe('search_github');
    });

    it('should handle multi-word queries', () => {
        const results = searchTools(mockRegistry, 'weather city');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe('get_weather');
    });

    it('should return empty array if no matches found', () => {
        const results = searchTools(mockRegistry, 'nonexistenttoolname12345');
        expect(results).toHaveLength(0);
    });

    it('should handle empty or very short queries', () => {
        const resultsEmpty = searchTools(mockRegistry, '');
        expect(resultsEmpty.length).toBeLessThanOrEqual(5);

        const resultsShort = searchTools(mockRegistry, 'a');
        expect(resultsShort.length).toBeLessThanOrEqual(5);
    });

    it('should handle tools with missing descriptions', () => {
        const minimalRegistry = {
            tools: [
                {
                    name: 'minimal_tool',
                    description: '',
                    server: 'test-server',
                    client: mockClient
                }
            ]
        } as unknown as MCPRegistry;

        const results = searchTools(minimalRegistry, 'minimal');
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('minimal_tool');
    });

    it('should combine results from multiple words if phrase search fails', () => {
        const results = searchTools(mockRegistry, 'weather repositories');
        // It should find both 'get_weather' and 'search_github'
        const names = results.map(r => r.name);
        expect(names).toContain('get_weather');
        expect(names).toContain('search_github');
    });
});
