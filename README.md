# Tool search tools MCP

![CI](https://github.com/fussraider/tool-search-tools-mcp/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/github/license/fussraider/tool-search-tools-mcp)
![Node.js Version](https://img.shields.io/badge/node-%3E%3D22-blue)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)

English | [Русский](./README.ru.md)

A tool for searching and using MCP tools. This project implements an MCP server that acts as an aggregator and proxy for
other servers.

## What problem does the project solve?

Modern LLMs (e.g., Claude) have context limits. When you connect multiple MCP servers directly:

1. **Context Overflow**: All tool descriptions are passed in the system prompt with every request. If there are dozens
   or hundreds of tools, they "eat up" the useful context volume and increase the cost of each message.
2. **Reduced Response Quality**: Due to the abundance of available functions, the model may get confused when choosing a
   suitable tool or ignore important instructions.
3. **Client Limitations**: Many clients (e.g., Claude Desktop) have limits on the number of simultaneously active tools.

**Tool search tools MCP** solves these problems by acting as a "tool for tools":

* It hides all real tools behind two universal ones: `search_tools` and `call_tool`.
* The model sees only these two tools, leaving the context clean.
* When the model needs something, it first searches for a suitable tool by keywords, gets its schema, and then calls it
  via the proxy.

## Key Features

* **Aggregation**: Access tools from different MCP servers (e.g., filesystem, git, sqlite) through a single server.
* **Smart Search**: A dedicated `search_tools` tool for filtering available functions. Uses fuzzy search and considers
  tool names, descriptions, and parameters.
* **Keyword Generation**: Automatic keyword extraction from tool definitions for improved search accuracy.
* **Hybrid Search**: Support for both fuzzy search (`fuse.js`) and semantic vector search (`transformers.js`) for better
  understanding of user intent.
* **Context Saving**: Instead of hundreds of tools, the model sees only two, which is critical for long dialogues.
* **Multilingual Support**: Improved text processing with support for Cyrillic and other characters.
* **Embedding Caching**: Persistent storage for tool embeddings to ensure fast startup and minimize CPU usage.
* **Dynamic Calling**: The `call_tool` tool for executing commands from found servers.
* **Improved Logging**: Support for file output, scope-based logging, and detailed log level configuration.
* **Security**: Validation of responses from connected servers using Zod.

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/fussraider/tool-search-tools-mcp.git
   cd tool-search-tools-mcp
   ```
   **Or** download the [latest release]( ).

2. Install dependencies:
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

### CLI Testing Utility

You can test the tool search directly from the command line:

```bash
pnpm search_tools "list directory contents"
```

This will connect to all servers defined in your `mcp-config.json`, load their tools, and display the search results in your terminal.

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
      ],
      "env": {
        "MCP_CONFIG_PATH": "/path/to/your/mcp-config.json",
        "MCP_SEARCH_MODE": "vector"
      }
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
      ],
      "env": {
        "MCP_CONFIG_PATH": "/path/to/your/mcp-config.json",
        "MCP_SEARCH_MODE": "vector"
      }
    }
  }
}
```

## Configuration

The list of connected servers is configured in the `mcp-config.json` file in the project root or at the path specified
in the `MCP_CONFIG_PATH` environment variable.

### Example `mcp-config.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-filesystem",
        "/your/path"
      ],
      "env": {
        "SOME_VAR": "value"
      }
    }
  }
}
```

### Environment Variables

* `MCP_CONFIG_PATH`: Path to the configuration file (default: `mcp-config.json` in the project directory).
* `LOG_LEVEL`: Logging level (`DEBUG`, `INFO`, `WARN`, `ERROR`). Default: `INFO`.
* `LOG_FILE_PATH`: Path to the file for writing logs. If not set, logs are output to `stderr`.
* `LOG_SHOW_TIMESTAMP`: Enables displaying date and time in logs. Default: `false`. Supported values to enable: `true`,
  `1`, `yes` (case-insensitive).
* `MCP_SEARCH_MODE`: Search mode. Options: `fuse` (default) or `vector` (semantic search).
* `MCP_EMBEDDING_MODEL`: The model used for generating embeddings. Default: `Xenova/all-MiniLM-L6-v2`.
* `MCP_CACHE_DIR`: Directory for storing cached embeddings. Default: `.cache/embeddings`.

## Troubleshooting

### Installation issues with `sharp`

The project uses `transformers.js`, which depends on the `sharp` library. On some systems (especially macOS Apple
Silicon), `pnpm` might block the installation of native dependencies for security reasons. If you see errors related to
`sharp`, ensure that you are using the latest `package.json` with the `pnpm.onlyBuiltDependencies` section, or run:

```bash
pnpm install
```

If the issue persists, you may need to explicitly allow building dependencies or reinstall them:

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

## Project Structure

* `src/server.ts` — Main MCP server file. Entry point that initializes the server and registered tools.
* `src/mcp/` — MCP logic:
    * `registry.ts` — Connection management for other servers, tool extraction, and keyword generation for search.
    * `search.ts` — Fuzzy search algorithm using `fuse.js` and semantic vector search.
    * `executor.ts` — Proxy logic for calling tools on connected servers.
* `src/utils/` — Utilities:
    * `logger.ts` — Custom logger with file support and log levels.
    * `embeddings.ts` — Service for generating and caching vector embeddings.
    * `text.ts` — Text processing and normalization utilities.
* `mcp-config.json` — Configuration file for connected MCP servers.

## License

MIT
