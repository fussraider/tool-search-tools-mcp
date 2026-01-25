import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { MCPRegistry, MCPTool } from "./mcp/registry.js"
import { searchTools } from "./mcp/search.js"
import { executeTool } from "./mcp/executor.js"
import fs from "fs"
import fsPromises from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { z } from "zod"
import { logger } from "./utils/logger.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf-8"))

class ToolSearchToolsMcpServer {
    private server: McpServer
    private registry: MCPRegistry
    private logger = logger.child("Server")

    constructor() {
        this.server = new McpServer({
            name: pkg.name || "tool-search-tools-mcp",
            version: pkg.version || "0.0.0"
        })
        this.registry = new MCPRegistry()
    }

    public async start() {
        try {
            await this.loadConfig()
            this.registerInternalTools()

            const transport = new StdioServerTransport()
            await this.server.connect(transport)
            this.logger.info("Tool search tools MCP running on stdio")
        } catch (error) {
            this.logger.error("Failed to start server:", error)
            process.exit(1)
        }
    }

    private async loadConfig() {
        const configPath = process.env.MCP_CONFIG_PATH || path.resolve(__dirname, "../mcp-config.json")
        this.logger.info(`Loading config from ${configPath}`)
        
        try {
            const data = await fsPromises.readFile(configPath, "utf-8")
            const config = JSON.parse(data)
            
            if (config.mcpServers) {
                const servers = Object.entries(config.mcpServers)
                this.logger.info(`Found ${servers.length} servers in config`)
                
                for (const [name, serverConfig] of servers) {
                    const { command, args, env } = serverConfig as any
                    this.logger.debug(`Connecting to server: ${name}`)
                    await this.registry.connectServer(name, command, args, env)
                }
            }
        } catch (error) {
            this.logger.error(`Failed to load config from ${configPath}:`, error)
            throw error // Пробрасываем ошибку, так как без конфига сервер бесполезен
        }
    }

    private registerInternalTools() {
        this.server.registerTool("search_tools", {
            description: "Search for tools across all connected MCP servers. " +
                "IMPORTANT: This is a search engine, not a complete list. " +
                "Always try 2-3 different queries if your initial search doesn't yield the desired tool.",
            inputSchema: {
                query: z.string().describe("Search query. Use 3-5 descriptive words for better results (e.g. 'read text file contents' instead of 'read')")
            }
        }, async ({ query }) => {
            this.logger.info(`Searching tools with query: "${query}"`)
            const results = searchTools(this.registry, query)
            this.logger.debug(`Found ${results.length} results`)
            
            const resultsText = results.length > 0 
                ? JSON.stringify(results.map(r => ({
                    name: r.name,
                    description: r.description,
                    server: r.server,
                    inputSchema: r.schema
                })), null, 2)
                : "No tools found matching your query.";

            return {
                content: [{
                    type: "text",
                    text: `Search results for "${query}":\n\n${resultsText}\n\n` + 
                        "NOTE: This list contains only the most relevant matches. If you don't see the tool you're looking for, try a different, more specific query."
                }]
            }
        })

        this.server.registerTool("call_tool", {
            description: "Execute a tool from one of the connected MCP servers",
            inputSchema: {
                server: z.string().describe("Name of the server providing the tool"),
                toolName: z.string().describe("Name of the tool to execute"),
                arguments: z.record(z.string(), z.any()).optional().describe("Arguments for the tool")
            }
        }, async ({ server, toolName, arguments: args }) => {
            this.logger.info(`Executing tool ${toolName} from server ${server}`)
            const tool = this.registry.tools.find(t => t.server === server && t.name === toolName)
            
            if (!tool) {
                return {
                    isError: true,
                    content: [{
                        type: "text",
                        text: `Tool ${toolName} not found on server ${server}`
                    }]
                }
            }

            try {
                const result = await executeTool(tool, args || {})
                return result as any
            } catch (error) {
                this.logger.error(`Error executing tool ${toolName}:`, error)
                return {
                    isError: true,
                    content: [{
                        type: "text",
                        text: `Error executing tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`
                    }]
                }
            }
        })
    }

}

const app = new ToolSearchToolsMcpServer()
await app.start()
