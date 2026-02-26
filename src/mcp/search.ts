import {MCPRegistry, MCPTool} from "./registry.js"
import {logger} from "../utils/logger.js"
import {embeddingService} from "../utils/embeddings.js"
import {normalizeText, tokenize} from "../utils/text.js"
import type {FuseResult} from "fuse.js"
import Fuse from "fuse.js"

const DEFAULT_LIMIT = 5;
const VECTOR_THRESHOLD = 0.35; // Минимальная схожесть для векторного поиска (примерно)

const searchLogger = logger.child("Search")

const fuseCache = new WeakMap<MCPRegistry, { instance: Fuse<MCPTool>, updatedAt: number }>();

/**
 * Вычисляет косинусное сходство между двумя векторами.
 * Оптимизировано для нормализованных векторов (каковыми являются векторы из embeddingService).
 * Если векторы нормализованы, косинусное сходство равно их скалярному произведению.
 */
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
    let dotProduct = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
    }
    return dotProduct;
}

/**
 * Старая реализация косинусного сходства (для сравнения).
 * Вычисляет полную формулу: (a · b) / (||a|| * ||b||)
 */
export function cosineSimilarityOld(a: Float32Array | number[], b: Float32Array | number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function vectorSearch(
    tools: ReadonlyArray<MCPTool>,
    query: string,
    limit: number
): Promise<MCPTool[]> {
    if (limit <= 0) return [];

    searchLogger.debug(`Performing vector search for: "${query}"`)
    const queryEmbedding = await embeddingService.generateEmbedding(query);

    // Use a fixed-size sorted array to avoid allocating objects for all results
    const results: { tool: MCPTool, score: number }[] = [];
    let matchCount = 0;
    const isDebug = searchLogger.isDebugEnabled();

    for (const tool of tools) {
        if (tool.embedding) {
            const score = cosineSimilarity(queryEmbedding, tool.embedding)

            if (isDebug) {
                searchLogger.debug(`Tool ${tool.name}: score=${score.toFixed(4)}`)
            }

            if (score > VECTOR_THRESHOLD) {
                matchCount++;

                // Maintain top K results
                if (results.length < limit) {
                    results.push({ tool, score });
                    // Keep sorted descending
                    results.sort((a, b) => b.score - a.score);
                } else if (score > results[results.length - 1].score) {
                    // New score is better than the worst in our top K
                    // Replace the last element
                    results[results.length - 1] = { tool, score };

                    // Re-sort (bubble up the new element to correct position)
                    for (let i = results.length - 1; i > 0; i--) {
                        if (results[i].score > results[i - 1].score) {
                            const temp = results[i];
                            results[i] = results[i - 1];
                            results[i - 1] = temp;
                        } else {
                            break;
                        }
                    }
                }
            }
        }
    }

    searchLogger.debug(`Vector search found ${matchCount} results above threshold ${VECTOR_THRESHOLD}`)
    return results.map(r => r.tool);
}

function fuzzySearch(
    registry: MCPRegistry,
    query: string,
    limit: number
): MCPTool[] {
    searchLogger.debug(`Performing fuzzy search for: "${query}"`)

    let fuse: Fuse<MCPTool>;
    const cached = fuseCache.get(registry);

    if (cached && cached.updatedAt === registry.updatedAt) {
        fuse = cached.instance;
    } else {
        fuse = new Fuse(registry.tools, {
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
        });
        fuseCache.set(registry, { instance: fuse, updatedAt: registry.updatedAt });
    }

    let results = fuse.search(query)
    searchLogger.debug(`Fuzzy search for "${query}" found ${results.length} results`)

    // Если по всей фразе не нашли, попробуем по отдельным словам и объединим
    if (results.length < limit) {
        const words = tokenize(query);
        const seen = new Set<string>();
        results.forEach(r => seen.add(`${r.item.server}:${r.item.name}`));

        for (const word of words) {
            const wordResults = fuse.search(word)
            // Добавляем новые результаты, которых еще нет
            wordResults.forEach(wr => {
                const key = `${wr.item.server}:${wr.item.name}`;
                if (!seen.has(key)) {
                    seen.add(key);
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

    const resultsWithWeights = results.map(result => ({
        result,
        weight: getMatchWeight(result.item, queryWords)
    }));

    resultsWithWeights.sort((a, b) => {
        const weightA = a.weight
        const weightB = b.weight

        if (Math.abs(weightA - weightB) > 0.1) {
            return weightB - weightA
        }

        return (a.result.score ?? 1) - (b.result.score ?? 1)
    })

    return resultsWithWeights.map(rw => rw.result)
}

function getMatchWeight(tool: MCPTool, queryWords: string[]): number {
    const text = tool.normalizedText || normalizeText(`${tool.name} ${tool.description} ${tool.schemaKeywords || ""}`);

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
    searchLogger.info(`Searching for "${q}" in ${registry.tools.length} tools using ${mode} mode`)

    let finalResults: MCPTool[] = []

    if (mode === 'vector') {
        finalResults = await vectorSearch(registry.tools, q, limit)
    } else {
        finalResults = fuzzySearch(registry, q, limit)
    }

    const duration = performance.now() - startTime
    searchLogger.info(`Search for "${q}" completed in ${duration.toFixed(2)}ms (found ${finalResults.length} tools)`)

    return finalResults
}
