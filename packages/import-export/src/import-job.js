/**
 * Array Import/Export - Staged & Resumable Import Pipeline
 * Zero external dependencies.
 *
 * Implements:
 * - Chunked / batch upload (< 512KB per request to respect serverless limits)
 * - Per-batch checksum verification and idempotency checks
 * - Detailed tracking of processed vs rejected rows
 * - Safe finalization to Relational Table or Document Collection
 */

import { randomUUID } from "node:crypto";
import { sha256 } from "../../core/src/serialization.js";
import { NotFoundError, ValidationError } from "../../core/src/errors.js";

// In-memory or persisted job store
const importJobs = new Map();

/**
 * Creates a new tracked import job.
 */
export function createImportJob({
  database,
  target,
  targetType = "relational",
  format = "csv",
  estimatedTotalRecords = null
}) {
  const jobId = randomUUID();
  const job = {
    id: jobId,
    database,
    target,
    targetType, // "relational" | "document"
    format, // "csv" | "json" | "jsonl"
    status: "pending", // "pending" | "processing" | "completed" | "failed"
    totalRecords: estimatedTotalRecords,
    processedRecords: 0,
    acceptedRecords: 0,
    rejectedRecords: 0,
    receivedBatches: new Set(),
    stagedRecords: [],
    rejectedDetails: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    error: null
  };

  importJobs.set(jobId, job);
  return serializeJob(job);
}

/**
 * Receives a staged batch of records for an import job.
 */
export function processImportBatch({ jobId, batchIndex, records, checksum = null }) {
  const job = importJobs.get(jobId);
  if (!job) {
    throw new NotFoundError(`Import job "${jobId}" not found`);
  }

  if (job.status === "completed" || job.status === "failed") {
    throw new ValidationError(`Import job "${jobId}" is already ${job.status}`);
  }

  // Idempotency check: if batchIndex already received, return current status
  if (job.receivedBatches.has(batchIndex)) {
    return serializeJob(job);
  }

  // Checksum verification if provided
  if (checksum) {
    const computed = sha256(JSON.stringify(records));
    if (computed !== checksum) {
      throw new ValidationError(`Batch ${batchIndex} checksum mismatch`);
    }
  }

  job.status = "processing";
  job.receivedBatches.add(batchIndex);
  job.processedRecords += records.length;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (typeof record !== "object" || record === null) {
      job.rejectedRecords++;
      job.rejectedDetails.push({
        batchIndex,
        recordIndex: i,
        reason: "Record must be a non-null object"
      });
      continue;
    }

    job.acceptedRecords++;
    job.stagedRecords.push(record);
  }

  job.updatedAt = new Date().toISOString();
  return serializeJob(job);
}

/**
 * Finalizes an import job by inserting staged records into target database
 */
export async function finalizeImportJob(jobId, arrayDb) {
  const job = importJobs.get(jobId);
  if (!job) {
    throw new NotFoundError(`Import job "${jobId}" not found`);
  }

  if (job.status === "completed") {
    return serializeJob(job);
  }

  try {
    if (job.targetType === "relational") {
      const table = arrayDb.relational(job.database).table(job.target);
      if (job.stagedRecords.length > 0) {
        await table.insert(job.stagedRecords);
      }
    } else {
      const col = arrayDb.document(job.database).collection(job.target);
      if (job.stagedRecords.length > 0) {
        await col.insertMany(job.stagedRecords);
      }
    }

    job.status = "completed";
    job.stagedRecords = []; // Free memory
    job.updatedAt = new Date().toISOString();
    return serializeJob(job);
  } catch (err) {
    job.status = "failed";
    job.error = err.message;
    job.updatedAt = new Date().toISOString();
    throw err;
  }
}

/**
 * Gets import job status
 */
export function getImportJob(jobId) {
  const job = importJobs.get(jobId);
  if (!job) {
    throw new NotFoundError(`Import job "${jobId}" not found`);
  }
  return serializeJob(job);
}

function serializeJob(job) {
  return {
    id: job.id,
    database: job.database,
    target: job.target,
    targetType: job.targetType,
    format: job.format,
    status: job.status,
    totalRecords: job.totalRecords,
    processedRecords: job.processedRecords,
    acceptedRecords: job.acceptedRecords,
    rejectedRecords: job.rejectedRecords,
    batchesCount: job.receivedBatches.size,
    rejectedDetails: job.rejectedDetails.slice(0, 50),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error
  };
}
