import { describe, it, expect, vi } from 'vitest';
import { MCPRegistry } from '../registry.js';

describe('MCPRegistry', () => {
    it('should correctly extract keywords from tool', () => {
        const registry = new MCPRegistry();
        const tool = {
            name: 'calculate_sum',
            description: 'Calculates the sum of two numbers.',
            inputSchema: {
                type: 'object',
                properties: {
                    a: { type: 'number', description: 'First number' },
                    b: { type: 'number', description: 'Second number' }
                }
            }
        };

        const keywords = registry.extractKeywords(tool);
        
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

        const keywords = registry.extractKeywords(tool);
        expect(keywords).toContain('simple');
        expect(keywords).toContain('tool');
    });

    it('should register tools from client', async () => {
        const registry = new MCPRegistry();
        const mockClient = {
            listTools: vi.fn().mockResolvedValue({
                tools: [
                    {
                        name: 'tool1',
                        description: 'desc1',
                        inputSchema: { type: 'object', properties: {} }
                    }
                ]
            })
        } as any;

        await registry.registerToolsFromClient('test-server', mockClient);
        
        expect(registry.tools).toHaveLength(1);
        expect(registry.tools[0].name).toBe('tool1');
        expect(registry.tools[0].server).toBe('test-server');
        expect(registry.tools[0].client).toBe(mockClient);
    });

    it('should handle tools without inputSchema', () => {
        const registry = new MCPRegistry();
        const tool = {
            name: 'no-schema',
            description: 'No schema here'
        };

        const keywords = registry.extractKeywords(tool);
        expect(keywords).toContain('schema');
        expect(keywords).not.toContain(undefined);
    });
});
