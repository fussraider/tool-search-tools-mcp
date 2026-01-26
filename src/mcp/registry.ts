import {Client} from "@modelcontextprotocol/sdk/client/index.js"
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js"
import {ListToolsResultSchema} from "@modelcontextprotocol/sdk/types.js"
import {logger} from "../utils/logger.js"
import {embeddingService, EmbeddingService} from "../utils/embeddings.js"
import {extractKeywords, tokenize} from "../utils/text.js"
import {Readable} from "stream"

export type MCPTool = {
    server: string
    name: string
    description: string
    schema: any
    schemaKeywords?: string
    client: Client
    embedding?: Float32Array | number[]
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

            const serverHash = EmbeddingService.generateServerHash(serverName, {command, args, env});
            await client.connect(transport)
            await this.registerToolsFromClient(serverName, client, serverHash)

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

    public async registerToolsFromClient(serverName: string, client: Client, serverHash?: string) {
        const result = await client.listTools()
        const {tools} = ListToolsResultSchema.parse(result)
        const mcpLogger = logger.child(`MCP:${serverName}`);

        const isVectorMode = process.env.MCP_SEARCH_MODE === 'vector';
        const cachedEmbeddings = (serverHash && isVectorMode) ? await embeddingService.getCachedEmbeddings(serverHash) : null;
        const currentEmbeddings: Record<string, Float32Array | number[]> = {...cachedEmbeddings};
        const newEmbeddingsCount = {value: 0};

        for (const tool of tools) {
            mcpLogger.debug(`Registering tool: ${tool.name}`)

            const keywords = this.extractToolKeywords(tool)
            let embedding = (cachedEmbeddings && isVectorMode) ? cachedEmbeddings[tool.name] : undefined;

            if (!embedding && isVectorMode) {
                try {
                    const textToEmbed = `${tool.name} ${tool.description ?? ""} ${keywords.join(" ")}`;
                    embedding = await embeddingService.generateEmbedding(textToEmbed);
                    currentEmbeddings[tool.name] = embedding;
                    newEmbeddingsCount.value++;
                } catch (error) {
                    mcpLogger.error(`Failed to generate embedding for tool ${tool.name}: ${error}`);
                }
            } else if (embedding) {
                currentEmbeddings[tool.name] = embedding;
            }

            this._tools.push({
                server: serverName,
                name: tool.name,
                description: tool.description ?? "",
                schema: tool.inputSchema,
                schemaKeywords: keywords.join(" "),
                client,
                embedding
            })
        }

        if (Object.keys(currentEmbeddings).length > 0) {
            const memoryUsage = EmbeddingService.calculateMemoryUsage(currentEmbeddings);
            mcpLogger.info(`Embeddings stats: ${Object.keys(currentEmbeddings).length} total tools, ${newEmbeddingsCount.value} newly generated. Approx. ${EmbeddingService.formatBytes(memoryUsage)} in memory`);
        }

        if (serverHash && newEmbeddingsCount.value > 0) {
            await embeddingService.saveEmbeddingsToCache(serverHash, currentEmbeddings);
        }

        mcpLogger.info(`Registered ${tools.length} tools`)
    }

    private extractToolKeywords(tool: any): string[] {
        const keywords = new Set<string>(extractKeywords(tool.name, tool.description));

        // Добавляем ключевые слова из параметров
        if (tool.inputSchema?.properties) {
            Object.entries(tool.inputSchema.properties).forEach(([propName, propDef]: [string, any]) => {
                keywords.add(propName.toLowerCase());
                if (propDef.description) {
                    tokenize(propDef.description).forEach(word => keywords.add(word));
                }
            });
        }

        return Array.from(keywords);
    }
}
