import {MCPRegistry, MCPTool} from "./registry.js"
import { executeSkill } from "./skills.js"

export async function executeTool(
    tool: MCPTool,
    args: any,
    registry?: MCPRegistry
) {
    if (tool.isSkill) {
        if (!registry) {
            throw new Error("Registry is required to execute skills");
        }
        return executeSkill(tool, args, registry);
    }

    if (!tool.client) {
        throw new Error(`Tool ${tool.name} has no client and is not a skill`);
    }

    return tool.client.callTool({
        name: tool.name,
        arguments: args
    })
}
