import {MCPRegistry, MCPTool} from "./registry.js"
import {logger} from "../utils/logger.js"
import {embeddingService} from "../utils/embeddings.js"
import {normalizeText, tokenize} from "../utils/text.js"
import type {FuseResult} from "fuse.js"
import Fuse from "fuse.js"

const DEFAULT_LIMIT = 5;
const VECTOR_THRESHOLD = 0.5; // Минимальная схожесть для векторного поиска (примерно)

const searchLogger = logger.child("Search")

/**
 * Вычисляет косинусное сходство между двумя векторами.
 * Оптимизировано для нормализованных векторов (каковыми являются векторы из embeddingService).
 * Если векторы нормализованы, косинусное сходство равно их скалярному произведению.
 */
function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
    let dotProduct = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
    }
    return dotProduct;
}

async function vectorSearch(
    tools: ReadonlyArray<MCPTool>,
    query: string,
    limit: number
): Promise<MCPTool[]> {
    const queryEmbedding = await embeddingService.generateEmbedding(query);
    const results = tools
        .filter(tool => tool.embedding)
        .map(tool => ({
            tool,
            score: cosineSimilarity(queryEmbedding, tool.embedding!)
        }))
        .filter(r => r.score > VECTOR_THRESHOLD)
        .sort((a, b) => b.score - a.score);

    return results.slice(0, limit).map(r => r.tool);
}

function fuzzySearch(
    tools: ReadonlyArray<MCPTool>,
    query: string,
    limit: number
): MCPTool[] {
    const fuse = new Fuse(tools, {
        keys: [
            {name: "name", weight: 0.5},
            {name: "description", weight: 0.3},
            {name: "schemaKeywords", weight: 0.15},
            {name: "server", weight: 0.05}
        ],
        threshold: 0.4,
        includeScore: true,
        useExtendedSearch: false,
        ignoreLocation: true,
        findAllMatches: true
    })

    let results = fuse.search(query)
    searchLogger.debug(`Fuzzy search for "${query}" found ${results.length} results`)

    // Если по всей фразе не нашли, попробуем по отдельным словам и объединим
    if (results.length < limit) {
        const words = tokenize(query);
        for (const word of words) {
            const wordResults = fuse.search(word)
            // Добавляем новые результаты, которых еще нет
            wordResults.forEach(wr => {
                if (!results.find(r => r.item.name === wr.item.name && r.item.server === wr.item.server)) {
                    results.push(wr)
                }
            })
        }
    }

    // Сортировка:
    // 1. По количеству совпадений слов из запроса (точное вхождение подстроки)
    // 2. По оригинальному score от Fuse
    if (results.length > 0) {
        results = sortFuzzyResults(results, query)
    }

    searchLogger.debug(`Fuzzy search found ${results.length} raw results`)

    return results
        .slice(0, limit)
        .map(result => {
            searchLogger.debug(`Match: ${result.item.name} (score: ${result.score})`)
            return result.item
        })
}

function sortFuzzyResults(results: FuseResult<MCPTool>[], query: string): FuseResult<MCPTool>[] {
    const queryWords = tokenize(query, 2);

    searchLogger.debug(`Sorting results by match count for words: ${queryWords.join(", ")}`)

    return [...results].sort((a, b) => {
        const weightA = getMatchWeight(a.item, queryWords)
        const weightB = getMatchWeight(b.item, queryWords)

        if (Math.abs(weightA - weightB) > 0.1) {
            return weightB - weightA
        }

        return (a.score ?? 1) - (b.score ?? 1)
    })
}

function getMatchWeight(tool: MCPTool, queryWords: string[]): number {
    const text = normalizeText(`${tool.name} ${tool.description} ${tool.schemaKeywords || ""}`);

    let weight = 0
    for (const word of queryWords) {
        if (text.includes(word)) {
            // Точное совпадение слова дает больше веса
            weight += 1
            // Если это часть имени или само имя - еще больше
            if (tool.name.toLowerCase().includes(word)) {
                weight += 0.5
            }
        }
    }
    return weight
}

export async function searchTools(
    registry: MCPRegistry,
    query: string,
    limit = DEFAULT_LIMIT
): Promise<MCPTool[]> {
    const startTime = performance.now()
    const q = query.toLowerCase()
    const mode = process.env.MCP_SEARCH_MODE || 'fuse'
    searchLogger.debug(`Searching for "${q}" in ${registry.tools.length} tools using ${mode} mode`)

    let finalResults: MCPTool[] = []

    if (mode === 'vector') {
        finalResults = await vectorSearch(registry.tools, q, limit)
    } else {
        finalResults = fuzzySearch(registry.tools, q, limit)
    }

    const duration = performance.now() - startTime
    searchLogger.info(`Search for "${q}" completed in ${duration.toFixed(2)}ms (found ${finalResults.length} tools)`)

    return finalResults
}
