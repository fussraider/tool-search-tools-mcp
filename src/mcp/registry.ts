import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js"
import { logger } from "../utils/logger.js"
import { Readable } from "stream"
import { z } from "zod"

export type MCPTool = {
    server: string
    name: string
    description: string
    schema: any
    schemaKeywords?: string
    client: Client
}

export class MCPRegistry {
    private _tools: MCPTool[] = []

    get tools(): ReadonlyArray<MCPTool> {
        return this._tools
    }

    async connectServer(
        serverName: string,
        command: string,
        args: string[],
        env?: Record<string, string>
    ) {
        const mcpLogger = logger.child(`MCP:${serverName}`);
        
        try {
            const transport = new StdioClientTransport({
                command,
                args,
                env,
                stderr: "pipe"
            })

            const client = new Client({
                name: "tool-search-tools-mcp",
                version: "0.1.0"
            }, {
                capabilities: {}
            })

            this.setupStderrLogging(transport, mcpLogger)

            await client.connect(transport)
            await this.registerToolsFromClient(serverName, client)
            
            mcpLogger.info(`Successfully connected and loaded tools`)
        } catch (error) {
            mcpLogger.error(`Failed to connect to server:`, error)
            throw error
        }
    }

    private setupStderrLogging(transport: StdioClientTransport, mcpLogger: any) {
        const stderr = transport.stderr
        if (stderr) {
            (stderr as Readable).on("data", (data: Buffer) => {
                const lines = data.toString().split("\n")
                for (const line of lines) {
                    const trimmed = line.trim()
                    if (trimmed) {
                        mcpLogger.debug(trimmed)
                    }
                }
            })
        }
    }

    public async registerToolsFromClient(serverName: string, client: Client) {
        const result = await client.listTools()
        const { tools } = ListToolsResultSchema.parse(result)

        for (const tool of tools) {
            logger.child(`MCP:${serverName}`).debug(`Registering tool: ${tool.name}`)
            
            const keywords = this.extractKeywords(tool)

            this._tools.push({
                server: serverName,
                name: tool.name,
                description: tool.description ?? "",
                schema: tool.inputSchema,
                schemaKeywords: keywords.join(" "),
                client
            })
        }
        
        logger.child(`MCP:${serverName}`).info(`Registered ${tools.length} tools`)
    }

    public extractKeywords(tool: any): string[] {
        const keywords: string[] = []
        
        // Части имени
        if (tool.name.includes("_")) {
            keywords.push(...tool.name.split("_"))
        } else if (tool.name.includes("-")) {
            keywords.push(...tool.name.split("-"))
        } else {
            keywords.push(tool.name)
        }

        // Ключевые слова из описания (простые слова > 3 букв)
        if (tool.description) {
            const descWords = tool.description.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter((w: string) => w.length > 3)
            keywords.push(...descWords)
        }

        // Параметры
        if (tool.inputSchema?.properties) {
            Object.entries(tool.inputSchema.properties).forEach(([propName, propDef]: [string, any]) => {
                keywords.push(propName)
                if (propDef.description) {
                    const propDescWords = propDef.description.toLowerCase()
                        .replace(/[^\w\s]/g, ' ')
                        .split(/\s+/)
                        .filter((w: string) => w.length > 3)
                    keywords.push(...propDescWords)
                }
            })
        }

        return Array.from(new Set(keywords))
    }
}
