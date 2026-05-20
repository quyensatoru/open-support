export function formatDateTime(value: string): string {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

export function stringifyOutput(value: unknown): string {
    if (value === undefined) return 'No output';
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
}
