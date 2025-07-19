/**
 * Utility function to truncate text to specified word count
 */
export function truncateToWordCount(text: string, wordCount: number): string {
    if (!text) return '';
    
    const words = text.split(/\s+/);
    if (words.length <= wordCount) return text;
    
    return words.slice(0, wordCount).join(' ') + '...';
}

/**
 * Utility function to shuffle an array randomly
 */
export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
