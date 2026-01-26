import { MCPRegistry } from "./mcp/registry.js"
import { searchTools } from "./mcp/search.js"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { logger } from "./utils/logger.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
    const query = process.argv.slice(2).join(" ")
    if (!query) {
        console.error("Please provide a search query.")
        console.error('Example: pnpm search_tools "list directory contents"')
        process.exit(1)
    }

    const configPath = process.env.MCP_CONFIG_PATH || path.resolve(__dirname, "../mcp-config.json")
    
    if (!fs.existsSync(configPath)) {
        console.error(`Configuration file not found: ${configPath}`)
        process.exit(1)
    }

    const registry = new MCPRegistry()
    
    try {
        const data = fs.readFileSync(configPath, "utf-8")
        const config = JSON.parse(data)

        if (!config.mcpServers || Object.keys(config.mcpServers).length === 0) {
            console.error("No MCP servers found in configuration.")
            process.exit(1)
        }

        console.log(`Connecting to servers and loading tools...`)
        
        const servers = Object.entries(config.mcpServers)
        const connections = servers.map(async ([name, serverConfig]) => {
            const { command, args, env } = serverConfig as any
            if (!command) {
                console.warn(`Skipping server ${name}: command is missing`)
                return
            }
            try {
                await registry.connectServer(name, command, args || [], env)
            } catch (e) {
                console.error(`Error connecting to server ${name}:`, e instanceof Error ? e.message : String(e))
            }
        })

        await Promise.all(connections)

        console.log(`Searching for: "${query}"...\n`)
        const results = await searchTools(registry, query)

        if (results.length === 0) {
            console.log("No tools found.")
        } else {
            results.forEach((tool, index) => {
                console.log(`${index + 1}. [${tool.server}] ${tool.name}`)
                if (tool.description) {
                    console.log(`   Description: ${tool.description}`)
                }
                console.log(`   Parameters: ${JSON.stringify(tool.schema.properties || {}, null, 2).split('\n').join('\n   ')}`)
                console.log('-'.repeat(40))
            })
        }
    } catch (error) {
        console.error("An error occurred:", error instanceof Error ? error.message : String(error))
        process.exit(1)
    } finally {
        // MCPRegistry creates connections that might keep the process alive
        // In this case we just exit
        process.exit(0)
    }
}

main().catch(err => {
    console.error(err)
    process.exit(1)
})
