# Data Flow Diagram — LinkVault

## 1. Upload Flow (User → DB + Blob Storage)

```
┌──────────────┐
│   Browser     │
│  (React SPA)  │
└──────┬───────┘
       │
       │ 1. User drops a file or types text
       │
       ▼
┌──────────────────────────────┐
│  Client-Side Encryption       │
│                               │
│  a) Generate random AES-256   │
│     key (Web Crypto API)      │
│  b) If password set: derive   │
│     combined key via PBKDF2   │
│     + HKDF                    │
│  c) Split file into chunks    │
│     (default 2 MB each)       │
│  d) Encrypt each chunk with   │
│     AES-256-GCM (unique IV)   │
│  e) Compute SHA-256 hash of   │
│     each encrypted chunk       │
│  f) Build Merkle tree over     │
│     chunk hashes               │
│  g) Encrypt filename with      │
│     same key                   │
└──────────┬───────────────────┘
           │
           │ 2. POST /api/vaults
           │    Body: { totalSize, expectedChunks, merkleRoot,
           │            encryptedFilename, cryptoParams, policy }
           ▼
┌──────────────────────────────┐
│  Express Backend              │
│                               │
│  - Validate input             │
│  - Generate vaultId (nanoid)  │
│  - Generate deleteToken       │
│  - Compute HMAC over metadata │
│  - Create Vault document      │
│    (status: 'pending')        │
└──────────┬───────────────────┘
           │
           │ Returns: { vaultId, deleteToken }
           ▼
┌──────────────────────────────┐
│  MongoDB Atlas                │
│                               │
│  Vault document created with: │
│  - vaultId, cryptoParams,     │
│    policy, expiresAt,          │
│    remainingViews,             │
│    uploadStatus: 'pending'     │
│  - No plaintext content        │
└──────────────────────────────┘
           │
           │ 3. For each chunk i = 0..N-1:
           │    POST /api/vaults/:vaultId/chunks
           │    Body: FormData { chunkIndex, hash, chunk (binary) }
           ▼
┌──────────────────────────────┐
│  Express Backend              │
│                               │
│  - Validate chunk index/hash  │
│  - Upload encrypted blob to   │
│    Azure Blob Storage          │
│  - Store blobKey in Vault     │
│    document's chunks array     │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Azure Blob Storage           │
│  Container: linkvault-blobs   │
│                               │
│  Blob key format:             │
│  {vaultId}/chunk-{index}      │
│                               │
│  Stored: raw encrypted bytes  │
│  (AES-256-GCM ciphertext)     │
└──────────────────────────────┘
           │
           │ 4. POST /api/vaults/:vaultId/finalize
           ▼
┌──────────────────────────────┐
│  Express Backend              │
│                               │
│  - Verify all chunks received │
│  - Set uploadStatus: complete │
│  - Vault is now accessible    │
└──────────────────────────────┘
           │
           │ 5. Backend returns success
           ▼
┌──────────────────────────────┐
│  Browser                      │
│                               │
│  - Constructs share URL:      │
│    /vault/{vaultId}#k={key}   │
│  - Key is Base64-encoded,     │
│    lives only in URL fragment  │
│  - Displays link + QR code    │
│  - Fragment never sent to     │
│    server (browser standard)   │
└──────────────────────────────┘
```

## 2. Download Flow (Recipient → Content)

```
┌──────────────────────────────┐
│  Recipient's Browser          │
│                               │
│  Opens: /vault/{vaultId}#k=.. │
│  - Extracts key from hash     │
│  - Hash fragment stays local  │
└──────────┬───────────────────┘
           │
           │ 1. GET /api/vaults/:vaultId
           │    (fetches metadata, no view consumed)
           ▼
┌──────────────────────────────┐
│  Express Backend              │
│                               │
│  - Check vault exists          │
│  - Check not expired           │
│  - Check views remaining       │
│  - Return: cryptoParams,       │
│    totalSize, chunkCount,      │
│    isPasswordProtected, etc.   │
└──────────┬───────────────────┘
           │
           │ Returns metadata to browser
           ▼
┌──────────────────────────────┐
│  Browser                      │
│                               │
│  - Shows vault info            │
│  - If password-protected:      │
│    prompt user for password    │
│  - User clicks "Download" or  │
│    "View"                      │
│                               │
│  [If password]: verify locally │
│  using passwordCheck field —   │
│  decrypt test value, if it     │
│  fails → wrong password, no   │
│  view consumed                 │
└──────────┬───────────────────┘
           │
           │ 2. POST /api/vaults/:vaultId/access
           │    (consumes 1 view atomically)
           ▼
┌──────────────────────────────┐
│  Express Backend              │
│                               │
│  - Atomic: remainingViews -= 1│
│    (findOneAndUpdate with      │
│     $inc: { remainingViews: -1}│
│     where remainingViews > 0)  │
│  - Check IP restrictions       │
│  - Generate 5-min download     │
│    session JWT                 │
│  - Return chunk list +         │
│    session token               │
└──────────┬───────────────────┘
           │
           │ Returns: { chunks: [...], sessionToken }
           ▼
┌──────────────────────────────┐
│  Browser                      │
│                               │
│  For each chunk:               │
│  3. GET /api/vaults/:vaultId/ │
│     chunks/:index              │
│     Header: X-Download-Session │
└──────────┬───────────────────┘
           │
           ▼
┌──────────────────────────────┐
│  Express Backend              │
│                               │
│  - Verify session JWT          │
│  - Stream encrypted chunk      │
│    from Azure Blob Storage     │
│    directly to response        │
└──────────┬───────────────────┘
           │
           │ Encrypted bytes streamed
           ▼
┌──────────────────────────────┐
│  Browser - Decryption         │
│                               │
│  For each chunk:               │
│  a) Receive encrypted bytes    │
│  b) Verify SHA-256 hash        │
│  c) Decrypt with AES-256-GCM  │
│     using key from URL hash    │
│  d) Collect plaintext chunks   │
│                               │
│  After all chunks:             │
│  e) Verify Merkle root         │
│  f) Reassemble file            │
│  g) Decrypt filename           │
│  h) Trigger browser download   │
│     (or display text)          │
└──────────────────────────────┘
```

## 3. Expiry and Cleanup

```
┌──────────────────────────────┐
│  Cron Job (every 5 minutes)   │
│  Runs inside Node.js process  │
│                               │
│  1. Find vaults where:         │
│     expiresAt < now OR         │
│     isDeleted = true            │
│                                 │
│  2. For each expired vault:     │
│     a) Delete blobs from        │
│        Azure Blob Storage       │
│     b) Delete MongoDB document  │
│                                 │
│  3. Find stale pending uploads: │
│     uploadStatus = 'pending'    │
│     AND createdAt < 1 hour ago  │
│     → delete blobs + document   │
│                                 │
│  Also: MongoDB TTL index on     │
│  expiresAt auto-removes docs    │
│  (secondary cleanup)            │
└──────────────────────────────┘
```

## 4. Security Boundaries

```
 BROWSER (trusted zone)              SERVER (untrusted zone)
┌─────────────────────────┐     ┌─────────────────────────┐
│                         │     │                         │
│  AES-256 key generation │     │  Never sees:            │
│  PBKDF2 key derivation  │────▶│  - Plaintext content    │
│  AES-GCM encryption     │     │  - Decryption keys      │
│  AES-GCM decryption     │     │  - Passwords            │
│  Merkle verification    │     │  - URL hash fragment    │
│  Hash verification      │     │                         │
│                         │     │  Only stores:           │
│  Key stays in URL #hash │     │  - Encrypted blobs      │
│  (never sent to server) │     │  - Metadata + policy    │
│                         │     │  - PBKDF2 salt (public) │
└─────────────────────────┘     └─────────────────────────┘
```
