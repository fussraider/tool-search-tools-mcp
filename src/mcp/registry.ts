import {Client} from "@modelcontextprotocol/sdk/client/index.js"
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js"
import {ListToolsResultSchema} from "@modelcontextprotocol/sdk/types.js"
import {logger} from "../utils/logger.js"
import {embeddingService, EmbeddingService} from "../utils/embeddings.js"
import {extractKeywords, tokenize, normalizeText} from "../utils/text.js"
import {Readable} from "stream"
import { Skill, SkillStep } from "./skills.js"

export type MCPTool = {
    server: string
    name: string
    description: string
    schema: any
    schemaKeywords?: string
    normalizedText?: string
    client?: Client
    embedding?: Float32Array | number[]
    isSkill?: boolean
    steps?: SkillStep[]
}

export class MCPRegistry {
    private _tools: MCPTool[] = []
    private _updatedAt: number = 0

    get tools(): ReadonlyArray<MCPTool> {
        return this._tools
    }

    get updatedAt(): number {
        return this._updatedAt
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

        const results = [];
        const CONCURRENCY_LIMIT = 10;

        for (let i = 0; i < tools.length; i += CONCURRENCY_LIMIT) {
            const batch = tools.slice(i, i + CONCURRENCY_LIMIT);
            const batchResults = await Promise.all(batch.map(async (tool) => {
                mcpLogger.debug(`Registering tool: ${tool.name}`)

                const keywords = this.extractToolKeywords(tool)
                const {embedding, isNew} = await this.getOrGenerateEmbedding(
                    tool,
                    keywords,
                    {
                        cachedEmbeddings,
                        isVectorMode,
                        logger: mcpLogger
                    }
                );
                return {tool, keywords, embedding, isNew};
            }));
            results.push(...batchResults);
        }

        for (const {tool, keywords, embedding, isNew} of results) {
            if (embedding) {
                currentEmbeddings[tool.name] = embedding;
                if (isNew) newEmbeddingsCount.value++;
            }

            this._tools.push({
                server: serverName,
                name: tool.name,
                description: tool.description ?? "",
                schema: tool.inputSchema,
                schemaKeywords: keywords.join(" "),
                normalizedText: normalizeText(`${tool.name} ${tool.description ?? ""} ${keywords.join(" ")}`),
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

        this._updatedAt = Date.now()
        mcpLogger.info(`Registered ${tools.length} tools`)
    }

    public async registerSkill(skill: Skill) {
        const mcpLogger = logger.child(`MCP:Skills`);
        mcpLogger.debug(`Registering skill: ${skill.name}`);

        const keywords = this.extractToolKeywords({
            name: skill.name,
            description: skill.description,
            inputSchema: { properties: skill.parameters }
        });

        const isVectorMode = process.env.MCP_SEARCH_MODE === 'vector';
        // For skills, we probably don't cache embeddings the same way as servers,
        // or we treat "Skills" as a virtual server for caching?
        // For simplicity, let's generate embedding every time or skip caching for now.
        // Actually, we can reuse getOrGenerateEmbedding if we treat it properly.
        // But skills are usually few.

        let embedding: Float32Array | number[] | undefined;
        if (isVectorMode) {
            const textToEmbed = `${skill.name} ${skill.description} ${keywords.join(" ")}`;
            try {
                embedding = await embeddingService.generateEmbedding(textToEmbed);
            } catch (e) {
                mcpLogger.error(`Failed to generate embedding for skill ${skill.name}`, e);
            }
        }

        this._tools.push({
            server: "internal", // or 'skills'
            name: skill.name,
            description: skill.description,
            schema: {
                type: "object",
                properties: skill.parameters
            },
            schemaKeywords: keywords.join(" "),
            normalizedText: normalizeText(`${skill.name} ${skill.description} ${keywords.join(" ")}`),
            isSkill: true,
            steps: skill.steps,
            embedding
        });

        this._updatedAt = Date.now();
    }

    private async getOrGenerateEmbedding(
        tool: any,
        keywords: string[],
        options: {
            cachedEmbeddings: Record<string, Float32Array | number[]> | null,
            isVectorMode: boolean,
            logger: any
        }
    ): Promise<{ embedding?: Float32Array | number[], isNew: boolean }> {
        const {cachedEmbeddings, isVectorMode, logger} = options;
        if (!isVectorMode) return {isNew: false};

        let embedding = cachedEmbeddings ? cachedEmbeddings[tool.name] : undefined;
        let isNew = false;

        if (!embedding) {
            try {
                const textToEmbed = `${tool.name} ${tool.description ?? ""} ${keywords.join(" ")}`;
                embedding = await embeddingService.generateEmbedding(textToEmbed);
                isNew = true;
            } catch (error) {
                logger.error(`Failed to generate embedding for tool ${tool.name}: ${error}`);
            }
        }
        return {embedding, isNew};
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
