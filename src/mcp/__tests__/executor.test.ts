import {describe, expect, it, vi} from 'vitest';
import {executeTool} from '../executor.js';
import { executeSkill } from '../skills.js';

vi.mock('../skills.js', () => ({
    executeSkill: vi.fn()
}));

describe('executeTool', () => {
    it('should call callTool on the client with correct parameters', async () => {
        const mockCallTool = vi.fn().mockResolvedValue({content: [{type: 'text', text: 'result'}]});
        const mockTool = {
            name: 'test-tool',
            client: {
                callTool: mockCallTool
            }
        } as any;
        const args = {arg1: 'val1'};

        const result = await executeTool(mockTool, args);

        expect(mockCallTool).toHaveBeenCalledWith({
            name: 'test-tool',
            arguments: args
        });
        expect(result).toEqual({content: [{type: 'text', text: 'result'}]});
    });

    it('should throw error if tool execution fails', async () => {
        const mockError = new Error('Execution failed');
        const mockCallTool = vi.fn().mockRejectedValue(mockError);
        const mockTool = {
            name: 'fail-tool',
            client: {
                callTool: mockCallTool
            }
        } as any;

        await expect(executeTool(mockTool, {})).rejects.toThrow('Execution failed');
    });

    it('should execute a skill using executeSkill', async () => {
        const mockRegistry = {} as any;
        const mockTool = {
            name: 'test-skill',
            isSkill: true,
            steps: []
        } as any;
        const args = { arg1: 'val1' };

        (executeSkill as any).mockResolvedValue({ result: 'skill-result' });

        const result = await executeTool(mockTool, args, mockRegistry);

        expect(executeSkill).toHaveBeenCalledWith(mockTool, args, mockRegistry);
        expect(result).toEqual({ result: 'skill-result' });
    });
});
