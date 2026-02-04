import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeSkill, loadSkillsConfig } from '../src/mcp/skills.js';
import { executeTool } from '../src/mcp/executor.js';
import { MCPRegistry, MCPTool } from '../src/mcp/registry.js';
import fs from 'fs/promises';
import path from 'path';

// Mock dependencies
vi.mock('../src/mcp/executor.js', () => ({
    executeTool: vi.fn(async (tool, args, registry) => {
        if (tool.name === 'echo') {
            return { content: [{ type: 'text', text: `Echo: ${args.message}` }] };
        }
        if (tool.name === 'upper') {
             return { content: [{ type: 'text', text: args.text.toUpperCase() }] };
        }
        return { content: [] };
    })
}));

describe('Skills Module', () => {

    describe('loadSkillsConfig', () => {
        it('should load and parse valid yaml', async () => {
            const yamlContent = `
skills:
  - name: test_skill
    description: A test skill
    parameters: { foo: string }
    steps:
      - tool: echo
        args: { message: "{{foo}}" }
            `;

            vi.spyOn(fs, 'readFile').mockResolvedValue(yamlContent);

            const skills = await loadSkillsConfig('dummy/path');
            expect(skills).toHaveLength(1);
            expect(skills[0].name).toBe('test_skill');
            expect(skills[0].steps).toHaveLength(1);
        });
    });

    describe('executeSkill', () => {
        let registry: MCPRegistry;

        beforeEach(() => {
            registry = new MCPRegistry();
            // Manually add mock tools
            (registry as any)._tools = [
                {
                    name: 'echo',
                    server: 'test-server',
                    description: 'Echoes message',
                    schema: {},
                    client: {} as any
                },
                {
                    name: 'upper',
                    server: 'test-server',
                    description: 'Uppercases text',
                    schema: {},
                    client: {} as any
                }
            ];
        });

        it('should execute a simple skill with variable substitution', async () => {
            const skill: MCPTool = {
                name: 'simple_skill',
                server: 'internal',
                description: 'Simple skill',
                schema: {},
                isSkill: true,
                steps: [
                    {
                        tool: 'echo',
                        args: { message: '{{input}}' },
                        result_var: 'output'
                    }
                ]
            };

            const result = await executeSkill(skill, { input: 'Hello' }, registry);
            expect(result).toEqual({ content: [{ type: 'text', text: 'Echo: Hello' }] });
        });

        it('should execute a multi-step skill with data passing', async () => {
             const skill: MCPTool = {
                name: 'chain_skill',
                server: 'internal',
                description: 'Chain skill',
                schema: {},
                isSkill: true,
                steps: [
                    {
                        tool: 'echo',
                        args: { message: '{{val}}' },
                        result_var: 'echoed'
                    },
                    {
                        tool: 'upper',
                        args: { text: '{{echoed}}' }, // Should receive 'Echo: test'
                        result_var: 'final'
                    }
                ]
            };

            const result = await executeSkill(skill, { val: 'test' }, registry);
            expect(result).toEqual({ content: [{ type: 'text', text: 'ECHO: TEST' }] });
        });

        it('should handle partial string replacement', async () => {
             const skill: MCPTool = {
                name: 'partial_skill',
                server: 'internal',
                description: 'Partial skill',
                schema: {},
                isSkill: true,
                steps: [
                    {
                        tool: 'echo',
                        args: { message: 'Prefix {{val}} Suffix' },
                    }
                ]
            };

            const result = await executeSkill(skill, { val: 'Middle' }, registry);
            expect(result).toEqual({ content: [{ type: 'text', text: 'Echo: Prefix Middle Suffix' }] });
        });

        it('should throw error if tool not found', async () => {
             const skill: MCPTool = {
                name: 'broken_skill',
                server: 'internal',
                description: 'Broken skill',
                schema: {},
                isSkill: true,
                steps: [
                    {
                        tool: 'non_existent_tool',
                        args: {},
                    }
                ]
            };

            await expect(executeSkill(skill, {}, registry)).rejects.toThrow('Tool non_existent_tool not found');
        });

        it('should warn and pick first if multiple tools found', async () => {
             // Add duplicate tool
            (registry as any)._tools.push({
                name: 'echo',
                server: 'another-server',
                description: 'Another echo',
                schema: {},
                client: {} as any
            });

             const skill: MCPTool = {
                name: 'ambiguous_skill',
                server: 'internal',
                description: 'Ambiguous skill',
                schema: {},
                isSkill: true,
                steps: [
                    {
                        tool: 'echo',
                        args: { message: 'hi' },
                    }
                ]
            };

            // We just expect it not to throw and to succeed (using the first one found)
            const result = await executeSkill(skill, {}, registry);
            expect(result).toBeDefined();
        });

        it('should fail if a step fails', async () => {
            (executeTool as any).mockRejectedValueOnce(new Error('Step failed'));

             const skill: MCPTool = {
                name: 'failing_skill',
                server: 'internal',
                description: 'Failing skill',
                schema: {},
                isSkill: true,
                steps: [
                    {
                        tool: 'echo',
                        args: { message: 'hi' },
                    }
                ]
            };

            await expect(executeSkill(skill, {}, registry)).rejects.toThrow('Step failed');
        });
    });
});
