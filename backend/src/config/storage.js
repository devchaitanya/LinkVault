import { BlobServiceClient } from '@azure/storage-blob';
import env from './env.js';

let containerClient = null;

/**
 * Initialize Azure Blob Storage.
 * Returns the container client for the vault blobs container.
 */
export function getContainerClient() {
  if (containerClient) return containerClient;

  if (!env.azureStorageConnectionString) {
    console.warn('[Storage] No Azure connection string — uploads will fail');
    return null;
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    env.azureStorageConnectionString
  );

  containerClient = blobServiceClient.getContainerClient(env.azureStorageContainer);
  return containerClient;
}

/**
 * Ensure the blob container exists. Call once at startup.
 */
export async function initializeStorage() {
  const client = getContainerClient();
  if (!client) return;

  try {
    await client.createIfNotExists({ access: undefined }); // private access
    console.log(`[Storage] Container "${env.azureStorageContainer}" ready`);
  } catch (err) {
    console.error('[Storage] Failed to initialize container:', err.message);
    throw err;
  }
}

export default { getContainerClient, initializeStorage };
