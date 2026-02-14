import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Vault Document Schema.
 *
 * Trust boundary: This document stores ONLY encrypted references and policy metadata.
 * No plaintext content, decryption keys, or passwords are ever stored.
 *
 * Single-document model: one vault = one MongoDB document.
 * Enables atomic updates on view counters and policy fields.
 */
const vaultSchema = new Schema(
  {
    // ─── Identity ──────────────────────────────────────────
    vaultId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      // NanoID ≥21 chars — ~128 bits entropy
    },

    // ─── Encrypted Content Reference ───────────────────────
    // Array of blob keys in Azure Blob Storage (chunk references)
    chunks: [
      {
        index: { type: Number, required: true },
        blobKey: { type: String, required: true },
        size: { type: Number, required: true },
        // Client-provided hash of encrypted chunk (for Merkle verification)
        hash: { type: String, required: true },
      },
    ],

    // Total file size (encrypted)
    totalSize: { type: Number, required: true },

    // Original filename (encrypted on client — stored as ciphertext)
    encryptedFilename: { type: String, default: null },

    // Plaintext display name for owner's dashboard (e.g. "report.pdf" or "Text paste")
    displayName: { type: String, default: null },

    // MIME type hint (for forced download / magic-number validation)
    mimeType: { type: String, default: 'application/octet-stream' },

    // Content type: 'text' for plain text shares, 'file' for file uploads
    contentType: { type: String, enum: ['text', 'file'], default: 'file' },

    // Hashed delete token — allows uploader to manually delete
    deleteTokenHash: { type: String, default: null },

    // User who created this vault (optional — for dashboard)
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // ─── Geofencing / IP Restriction ───────────────────────
    allowedCountries: [{ type: String }], // ISO country codes
    allowedIPs: [{ type: String }], // CIDR or exact IPs

    // ─── Integrity ─────────────────────────────────────────
    // Merkle root over chunk hashes — verified client-side on download
    merkleRoot: { type: String, required: true },

    // HMAC over (vaultId + merkleRoot + expiresAt + maxViews) — tamper detection
    metadataHmac: { type: String, required: true },

    // ─── Crypto Metadata (no secrets) ──────────────────────
    cryptoParams: {
      algorithm: { type: String, default: 'AES-GCM' },
      keyLength: { type: Number, default: 256 },
      ivLength: { type: Number, default: 12 },
      // Whether password protection is enabled (not the password itself)
      isPasswordProtected: { type: Boolean, default: false },
      // PBKDF2 salt (public — needed to derive key on recipient side)
      pbkdf2Salt: { type: String, default: null },
      pbkdf2Iterations: { type: Number, default: 100_000 },
      // Encrypted test value for password verification without consuming a view
      passwordCheck: { type: String, default: null },
      // Schema version for forward compatibility
      version: { type: Number, default: 1 },
    },

    // ─── Access Policy ─────────────────────────────────────
    policy: {
      // Maximum number of views allowed
      maxViews: { type: Number, required: true },
      // Time window: vault accessible only between these UTC timestamps
      accessWindowStart: { type: Date, default: null },
      accessWindowEnd: { type: Date, default: null },
      // Max failed access attempts before lockout
      maxFailedAttempts: { type: Number, default: 10 },
    },

    // ─── Counters (atomic updates only) ────────────────────
    remainingViews: { type: Number, required: true },
    failedAttempts: { type: Number, default: 0 },

    // ─── Lifecycle ─────────────────────────────────────────
    expiresAt: {
      type: Date,
      required: true,
    },

    // Soft-delete flag — vault marked for cleanup
    isDeleted: { type: Boolean, default: false },

    // ─── Upload Session ────────────────────────────────────
    // Track upload state for idempotent chunked uploads
    uploadStatus: {
      type: String,
      enum: ['pending', 'complete', 'failed'],
      default: 'pending',
    },

    // Number of chunks expected (set at upload init)
    expectedChunks: { type: Number, default: 0 },
  },
  {
    timestamps: true, // createdAt, updatedAt
    // Strict schema — reject unknown fields
    strict: true,
  }
);

// ─── Indexes ──────────────────────────────────────────────────

// TTL index: MongoDB auto-deletes expired documents (cleanup only, not enforcement)
vaultSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Fast lookup for cleanup jobs
vaultSchema.index({ uploadStatus: 1, createdAt: 1 });

// ─── Instance Methods ─────────────────────────────────────────

/**
 * Check if vault is accessible (not expired, has views, within window).
 * This is policy enforcement — must be called synchronously before serving content.
 */
vaultSchema.methods.isAccessible = function () {
  const now = new Date();

  if (this.isDeleted) return { ok: false, reason: 'deleted' };
  if (this.expiresAt <= now) return { ok: false, reason: 'expired' };
  if (this.remainingViews <= 0) return { ok: false, reason: 'no_views_remaining' };
  if (this.failedAttempts >= this.policy.maxFailedAttempts) {
    return { ok: false, reason: 'locked_out' };
  }

  // Time window check
  if (this.policy.accessWindowStart && now < this.policy.accessWindowStart) {
    return { ok: false, reason: 'before_access_window' };
  }
  if (this.policy.accessWindowEnd && now > this.policy.accessWindowEnd) {
    return { ok: false, reason: 'after_access_window' };
  }

  return { ok: true };
};

/**
 * Return a safe public representation (no internal fields).
 */
vaultSchema.methods.toPublic = function () {
  return {
    vaultId: this.vaultId,
    totalSize: this.totalSize,
    mimeType: this.mimeType,
    contentType: this.contentType,
    merkleRoot: this.merkleRoot,
    cryptoParams: {
      ...this.cryptoParams.toObject(),
    },
    encryptedFilename: this.encryptedFilename,
    policy: {
      maxViews: this.policy.maxViews,
      accessWindowStart: this.policy.accessWindowStart,
      accessWindowEnd: this.policy.accessWindowEnd,
    },
    remainingViews: this.remainingViews,
    expiresAt: this.expiresAt,
    uploadStatus: this.uploadStatus,
    chunkCount: this.chunks.length,
    createdAt: this.createdAt,
  };
};

// ─── Static Methods ───────────────────────────────────────────

/**
 * Atomically decrement remaining views. Returns null if no views left.
 * This is the burn-after-read primitive.
 */
vaultSchema.statics.consumeView = async function (vaultId) {
  const result = await this.findOneAndUpdate(
    {
      vaultId,
      remainingViews: { $gt: 0 },
      isDeleted: false,
    },
    {
      $inc: { remainingViews: -1 },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  return result;
};

/**
 * Atomically increment failed attempts counter.
 */
vaultSchema.statics.recordFailedAttempt = async function (vaultId) {
  return this.findOneAndUpdate(
    { vaultId, isDeleted: false },
    { $inc: { failedAttempts: 1 } },
    { new: true }
  );
};

const Vault = mongoose.model('Vault', vaultSchema);

export default Vault;
