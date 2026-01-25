# Tool search tools MCP

![License](https://img.shields.io/github/license/fussraider/tool-search-tools-mcp)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-blue)

English | [Русский](./README.ru.md)

A tool for searching and using MCP tools. This project implements an MCP server that acts as an aggregator and proxy for other servers.

## What problem does the project solve?

Modern LLMs (e.g., Claude) have context limits. When you connect multiple MCP servers directly:
1.  **Context Overflow**: All tool descriptions are passed in the system prompt with every request. If there are dozens or hundreds of tools, they "eat up" the useful context volume and increase the cost of each message.
2.  **Reduced Response Quality**: Due to the abundance of available functions, the model may get confused when choosing a suitable tool or ignore important instructions.
3.  **Client Limitations**: Many clients (e.g., Claude Desktop) have limits on the number of simultaneously active tools.

**Tool search tools MCP** solves these problems by acting as a "tool for tools":
*   It hides all real tools behind two universal ones: `search_tools` and `call_tool`.
*   The model sees only these two tools, leaving the context clean.
*   When the model needs something, it first searches for a suitable tool by keywords, gets its schema, and then calls it via the proxy.

## Key Features

*   **Aggregation**: Access tools from different MCP servers (e.g., filesystem, git, sqlite) through a single server.
*   **Smart Search**: A dedicated `search_tools` tool for filtering available functions. Uses fuzzy search and considers tool names, descriptions, and parameters.
*   **Context Saving**: Instead of hundreds of tools, the model sees only two, which is critical for long dialogues.
*   **Dynamic Calling**: The `call_tool` tool for executing commands from found servers.
*   **Improved Logging**: Support for file output and detailed log level configuration.
*   **Security**: Validation of responses from connected servers using Zod.

## Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    pnpm install # or npm install, yarn
    ```

## Usage

### Running the Server

For development (with auto-reload):
```bash
pnpm dev # or npm run dev, yarn dev
```

For production (build and run):
```bash
pnpm build # or npm run build, yarn build
pnpm start # or npm start, yarn start
```

### Connecting to Claude Desktop or Other Clients
Add this server to your MCP client configuration. For example, for Claude Desktop:

#### Method 1: Using Node.js (recommended)
```json
{
  "mcpServers": {
    "tool-search-tools-mcp": {
      "command": "node",
      "args": [
        "/path/to/tool-search-tools-mcp/dist/server.js"
      ]
    }
  }
}
```

#### Method 2: Using tsx (for development)
```json
{
  "mcpServers": {
    "tool-search-tools-mcp": {
      "command": "npx",
      "args": [
        "tsx",
        "/path/to/tool-search-tools-mcp/src/server.ts"
      ]
    }
  }
}
```

## Configuration
The list of connected servers is configured in the `mcp-config.json` file in the project root or at the path specified in the `MCP_CONFIG_PATH` environment variable.

### Example `mcp-config.json`
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/your/path"]
    }
  }
}
```

### Environment Variables
*   `MCP_CONFIG_PATH`: Path to the configuration file (default: `mcp-config.json` in the project directory).
*   `LOG_LEVEL`: Logging level (`DEBUG`, `INFO`, `WARN`, `ERROR`). Default: `INFO`.
*   `LOG_FILE_PATH`: Path to the file for writing logs. If not set, logs are output to `stderr`.
*   `LOG_SHOW_TIMESTAMP`: Enables displaying date and time in logs. Default: `false`. Supported values to enable: `true`, `1`, `yes` (case-insensitive).

## Project Structure

*   `src/server.ts` — Main MCP server file.
*   `src/mcp/` — MCP logic:
    *   `registry.ts` — Connection management for other servers.
    *   `search.ts` — Search algorithm.
    *   `executor.ts` — Command execution.

## License

MIT
