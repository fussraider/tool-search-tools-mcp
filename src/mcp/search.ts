import { MCPRegistry, MCPTool } from "./registry.js"
import { logger } from "../utils/logger.js"
import Fuse from "fuse.js"

const searchLogger = logger.child("Search")

export function searchTools(
    registry: MCPRegistry,
    query: string,
    limit = 5
): MCPTool[] {
    const q = query.toLowerCase()
    searchLogger.debug(`Searching for "${q}" in ${registry.tools.length} tools`)

    const fuse = new Fuse(registry.tools as MCPTool[], {
        keys: [
            { name: "name", weight: 0.5 },
            { name: "description", weight: 0.3 },
            { name: "schemaKeywords", weight: 0.15 },
            { name: "server", weight: 0.05 }
        ],
        threshold: 0.4,
        includeScore: true,
        useExtendedSearch: false,
        ignoreLocation: true,
        findAllMatches: true
    })

    let results = fuse.search(q)
    searchLogger.debug(`Fuzzy search for "${q}" found ${results.length} results`)
    
    // Если по всей фразе не нашли, попробуем по отдельным словам и объединим
    if (results.length < limit) {
        const words = q.split(/\s+/).filter(w => w.length >= 3)
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
    
    // Если все еще мало результатов или мы хотим добавить веса за совпадение нескольких слов,
    // можно вручную подкрутить score. Но для начала попробуем убрать useExtendedSearch для OR поиска
    // или использовать более мягкий порог.

    // Сортировка:
    // 1. По количеству совпадений слов из запроса (точное вхождение подстроки)
    // 2. По оригинальному score от Fuse
    if (results.length > 0) {
        const queryWords = q.split(/\s+/).filter(w => w.length >= 2)
        
        searchLogger.debug(`Sorting results by match count for words: ${queryWords.join(", ")}`)
        
        results.sort((a, b) => {
            const getMatchWeight = (tool: MCPTool) => {
                const nameParts = tool.name.split(/[_-]/).join(" ")
                const text = `${tool.name} ${nameParts} ${tool.description} ${tool.schemaKeywords || ""}`.toLowerCase()
                
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
            
            const weightA = getMatchWeight(a.item)
            const weightB = getMatchWeight(b.item)
            
            if (Math.abs(weightA - weightB) > 0.1) {
                return weightB - weightA
            }
            
            return (a.score ?? 1) - (b.score ?? 1)
        })
    }
    
    searchLogger.debug(`Fuzzy search found ${results.length} raw results`)

    return results
        .slice(0, limit)
        .map(result => {
            searchLogger.debug(`Match: ${result.item.name} (score: ${result.score})`)
            return result.item
        })
}
