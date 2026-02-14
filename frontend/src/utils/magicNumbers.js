/**
 * Magic Number Validation — validates file type based on file header bytes.
 * Runs client-side before upload to block dangerous file types.
 */

const MAGIC_SIGNATURES = [
  // Images
  { bytes: [0xFF, 0xD8, 0xFF], ext: 'jpg', mime: 'image/jpeg' },
  { bytes: [0x89, 0x50, 0x4E, 0x47], ext: 'png', mime: 'image/png' },
  { bytes: [0x47, 0x49, 0x46, 0x38], ext: 'gif', mime: 'image/gif' },
  { bytes: [0x52, 0x49, 0x46, 0x46], ext: 'webp', mime: 'image/webp' }, // also AVI etc.
  // PDF
  { bytes: [0x25, 0x50, 0x44, 0x46], ext: 'pdf', mime: 'application/pdf' },
  // ZIP / DOCX / XLSX / PPTX
  { bytes: [0x50, 0x4B, 0x03, 0x04], ext: 'zip', mime: 'application/zip' },
  // GZIP
  { bytes: [0x1F, 0x8B], ext: 'gz', mime: 'application/gzip' },
  // RAR
  { bytes: [0x52, 0x61, 0x72, 0x21], ext: 'rar', mime: 'application/x-rar-compressed' },
  // 7z
  { bytes: [0x37, 0x7A, 0xBC, 0xAF], ext: '7z', mime: 'application/x-7z-compressed' },
  // MP4 / MOV
  { bytes: [0x00, 0x00, 0x00], ext: 'mp4', mime: 'video/mp4', offset: 0 },
  // MP3
  { bytes: [0x49, 0x44, 0x33], ext: 'mp3', mime: 'audio/mpeg' },
  // WAV
  { bytes: [0x52, 0x49, 0x46, 0x46], ext: 'wav', mime: 'audio/wav' },
];

// Blocked dangerous files
const BLOCKED_SIGNATURES = [
  { bytes: [0x4D, 0x5A], name: 'Windows Executable (EXE/DLL)', ext: 'exe' },
  { bytes: [0x7F, 0x45, 0x4C, 0x46], name: 'Linux ELF Binary', ext: 'elf' },
  { bytes: [0xCA, 0xFE, 0xBA, 0xBE], name: 'Java Class / Mach-O', ext: 'class' },
  { bytes: [0xFE, 0xED, 0xFA, 0xCE], name: 'Mach-O Binary (32-bit)', ext: 'macho' },
  { bytes: [0xFE, 0xED, 0xFA, 0xCF], name: 'Mach-O Binary (64-bit)', ext: 'macho' },
];

/**
 * Read the first N bytes of a file.
 * @param {File} file
 * @param {number} n
 * @returns {Promise<Uint8Array>}
 */
function readHeader(file, n = 16) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = reject;
    reader.readAsArrayBuffer(file.slice(0, n));
  });
}

/**
 * Validate a file's magic number.
 * Returns { valid: true, detectedType } or { valid: false, reason }
 */
export async function validateMagicNumber(file) {
  try {
    const header = await readHeader(file);

    // Check blocked signatures first
    for (const sig of BLOCKED_SIGNATURES) {
      const match = sig.bytes.every((byte, i) => header[i] === byte);
      if (match) {
        return {
          valid: false,
          reason: `Blocked file type detected: ${sig.name}`,
          detectedType: sig.ext,
        };
      }
    }

    // Try to identify file type
    for (const sig of MAGIC_SIGNATURES) {
      const offset = sig.offset || 0;
      const match = sig.bytes.every((byte, i) => header[offset + i] === byte);
      if (match) {
        return {
          valid: true,
          detectedType: sig.ext,
          detectedMime: sig.mime,
        };
      }
    }

    // Unknown type — allow (we don't want to block all unknown files)
    return { valid: true, detectedType: 'unknown', detectedMime: 'application/octet-stream' };
  } catch {
    return { valid: true, detectedType: 'unknown', detectedMime: 'application/octet-stream' };
  }
}
