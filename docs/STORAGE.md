# File Storage

Uploaded files (equipment documents — schematics, manuals, certificates, etc.) go
through a **provider-agnostic storage layer** with two backends behind one
interface. Switch with one env var; nothing else changes.

| Provider | Use when | Where files live |
|---|---|---|
| `LOCAL` (default) | Self-hosted single-site server (LIMSL's case) | `storage/uploads/` on the server (gitignored) |
| `SUPABASE` | Hosted / multi-site / serverless deploy | Supabase Storage bucket (cloud) |

**Files are never public.** Every file is served through the auth-gated route
`GET /api/files/<key>` — local files are streamed after a session check; cloud
files redirect to a short-lived (5-min) signed URL. Compliance documents are not
exposed as guessable public links.

## How it flows

1. Client uploads to `POST /api/files` (multipart, `file` field). Gated to
   maintenance-write roles. Validates type (PDF, images, Office, CSV, text) and
   size (25 MB default). Returns `{ key, name, mimeType, size, url }`.
2. Client records the file against an entity — e.g. `POST /api/documents` with the
   `fileKey`. The document's `fileUrl` becomes `/api/files/<key>`.
3. Anyone authenticated opens it via that link.

Path traversal is blocked (keys are flat filenames; `..`/slashes are rejected).

## Configuration (`.env.local`)

Local (default) needs nothing. To tune or go cloud:

```
# Local
STORAGE_PROVIDER=LOCAL
STORAGE_LOCAL_DIR=storage/uploads     # relative to project root, or an absolute path
STORAGE_MAX_BYTES=26214400            # 25 MB

# Cloud (Supabase Storage — REST, no SDK)
STORAGE_PROVIDER=SUPABASE
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service-role key>   # gitignored — never commit
SUPABASE_BUCKET=limsl-documents            # create a PRIVATE bucket
```

`storageReady()` gates uploads: LOCAL is always ready; SUPABASE requires the URL +
service key or uploads fail loudly (503) rather than dropping files silently.

## Adding another cloud provider

Implement `saveFile`, `serveFile`, `deleteFile` in a new
`src/lib/storage/<provider>.ts` (mirror `supabase.ts`), add it to `storageReady()`
and the `backend()` switch in `index.ts`. S3 / R2 / Azure Blob all fit the same
shape — S3 & R2 are S3-compatible, so a single SigV4 adapter (or the AWS SDK)
covers both.

## Files

- `src/lib/storage/index.ts` — interface + provider selection + `makeKey`.
- `src/lib/storage/local.ts`, `src/lib/storage/supabase.ts` — backends.
- `src/lib/config.ts` — `storageReady()` + env.
- `src/app/api/files/route.ts` (upload), `src/app/api/files/[...key]/route.ts` (serve).
- `src/components/EquipmentDocuments.tsx` — upload + view UI.
