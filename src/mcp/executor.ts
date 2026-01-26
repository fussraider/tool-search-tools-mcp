import {MCPTool} from "./registry.js"

export async function executeTool(
    tool: MCPTool,
    args: any
) {
    return tool.client.callTool({
        name: tool.name,
        arguments: args
    })
}
