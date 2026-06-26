export const PRINT_JOB_STATUSES = ['queued', 'sent', 'printed', 'failed', 'cancelled'] as const;

export type PrintJobStatus = (typeof PRINT_JOB_STATUSES)[number];
