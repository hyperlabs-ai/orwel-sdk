/**
 * Orwel SDK version
 * This is used for tracking and debugging purposes
 */
export const SDK_VERSION = '1.7.1';

/**
 * Hard cap on how many events go in one /ingest/batch request.
 *
 * This MUST stay <= the server's BatchPayloadSchema limit
 * (orwel-api/src/lib/utils/validation.ts). The queue holds up to 1000 events and
 * used to post all of them as a single batch; the server rejects anything over
 * 100 with a 400, and sendBatch() treats 400 as success-without-retry, so any
 * flush of more than 100 events silently discarded the entire batch. Chunking in
 * flush() is what keeps that from happening.
 */
export const MAX_BATCH_SIZE = 100;
