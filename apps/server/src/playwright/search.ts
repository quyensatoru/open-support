import { chromium } from 'playwright';

import { getPlaywrightDefaults } from './config.js';

export type BrowserSearchResult = {
    query: string;
    title: string;
    url: string;
    excerpt: string;
};

export async function searchWebWithBrowser(query: string): Promise<BrowserSearchResult[]> {
    const defaults = getPlaywrightDefaults();
    const browser = await chromium.launch({ headless: defaults.headless });

    try {
        const page = await browser.newPage();
        await page.goto(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, {
            waitUntil: 'domcontentloaded',
            timeout: defaults.timeoutMs,
        });

        return page
            .locator("article, [data-testid='result'], .result")
            .evaluateAll((nodes, searchQuery) => {
                return nodes.slice(0, 5).map((node) => {
                    const link = node.querySelector('a');
                    const title = link?.textContent?.trim() || 'Untitled result';
                    const url = link?.getAttribute('href') || '';
                    const excerpt = node.textContent?.replace(/\s+/g, ' ').trim() || '';

                    return {
                        query: String(searchQuery),
                        title,
                        url,
                        excerpt,
                    };
                });
            }, query);
    } finally {
        await browser.close();
    }
}
