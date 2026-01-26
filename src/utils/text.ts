/**
 * Очищает текст от спецсимволов и приводит к нижнему регистру
 */
export function normalizeText(text: string): string {
    return text.toLowerCase()
        .replace(/[^\w\sа-яё]/gi, ' ') // Поддержка кириллицы
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Разбивает текст на слова длиннее заданного порога
 */
export function tokenize(text: string, minLength: number = 4): string[] {
    return normalizeText(text)
        .split(' ')
        .filter(word => word.length >= minLength);
}

/**
 * Извлекает уникальные ключевые слова из названия инструмента и его описания
 */
export function extractKeywords(name: string, description?: string): string[] {
    const keywords = new Set<string>();

    // Имя инструмента (целиком и по частям)
    keywords.add(name.toLowerCase());
    name.split(/[_-]/).forEach(part => {
        if (part.length >= 2) keywords.add(part.toLowerCase());
    });

    // Описание
    if (description) {
        tokenize(description).forEach(word => keywords.add(word));
    }

    return Array.from(keywords);
}
