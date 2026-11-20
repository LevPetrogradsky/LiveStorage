// server/journal-entry.ts
import { createRemoteJWKSet, jwtVerify } from "jose";

// src/journal/photo.ts
var photoPrefix = "data:image/jpeg;base64,";
var maxPhotoBytes = 18e4;
var maxPhotoEdge = 960;
var maxInputBytes = 12 * 1024 * 1024;
function hasBoundedJpegFrame(bytes) {
  const byte = (index) => bytes.charCodeAt(index);
  if (bytes.length < 8 || byte(0) !== 255 || byte(1) !== 216 || byte(bytes.length - 2) !== 255 || byte(bytes.length - 1) !== 217) return false;
  let offset = 2;
  let boundedFrame = false;
  while (offset < bytes.length) {
    if (byte(offset++) !== 255) return false;
    while (byte(offset) === 255) offset++;
    const marker = byte(offset++);
    const size = byte(offset) * 256 + byte(offset + 1);
    if (!Number.isFinite(size) || size < 2 || offset + size > bytes.length) return false;
    if (marker === 192 || marker === 193 || marker === 194) {
      if (boundedFrame || size < 8) return false;
      const height = byte(offset + 3) * 256 + byte(offset + 4);
      const width = byte(offset + 5) * 256 + byte(offset + 6);
      if (!width || !height || width > maxPhotoEdge || height > maxPhotoEdge) return false;
      boundedFrame = true;
    }
    if (marker === 218) return boundedFrame && size >= 8 && offset + size < bytes.length - 2;
    if (marker === 217) return false;
    offset += size;
  }
  return false;
}
function isJournalPhoto(value) {
  if (typeof value !== "string" || !value.startsWith(photoPrefix) || value.length > photoPrefix.length + Math.ceil(maxPhotoBytes / 3) * 4) return false;
  try {
    const base64 = value.slice(photoPrefix.length);
    const bytes = atob(base64);
    return bytes.length <= maxPhotoBytes && btoa(bytes) === base64 && hasBoundedJpegFrame(bytes);
  } catch {
    return false;
  }
}

// src/journal/location.ts
function validApproximateLocation(value) {
  if (!value || typeof value !== "object" || !("latitude" in value) || !("longitude" in value)) return false;
  const { latitude, longitude } = value;
  return typeof latitude === "number" && typeof longitude === "number" && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && Math.abs(latitude * 10 - Math.round(latitude * 10)) < 1e-8 && Math.abs(longitude * 10 - Math.round(longitude * 10)) < 1e-8;
}

// src/journal/device.ts
var journalDevices = ["iphone", "ipad", "android", "windows", "mac", "unknown"];

// src/data.ts
var shortcuts = [
  { id: "journal", label: "Journal" },
  { id: "tasks", label: "Tasks" },
  { id: "focus", label: "Focus" },
  { id: "flow", label: "3 questions" }
];
var visibleShortcuts = shortcuts.filter((shortcut) => shortcut.id !== "flow");
var maxJournalFolderNameLength = 60;
var journalFolderColors = ["blue", "green", "purple", "amber", "pink", "slate"];
var journalFolderIcons = ["folder", "briefcase", "book", "heart", "star", "lightbulb", "leaf", "camera"];

// src/journal/cloud-model.ts
var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
var id = (value) => typeof value === "string" && value.length > 0 && value.length <= 200;
var timestamp = (value) => typeof value === "string" && value.length <= 50 && Number.isFinite(Date.parse(value));
function validCloudFolder(value) {
  return record(value) && id(value.id) && typeof value.name === "string" && value.name.length > 0 && value.name.length <= maxJournalFolderNameLength && value.name === value.name.trim() && (value.order === void 0 || typeof value.order === "number" && Number.isSafeInteger(value.order) && value.order >= 0) && (value.color === void 0 || journalFolderColors.some((color) => color === value.color)) && (value.icon === void 0 || journalFolderIcons.some((icon) => icon === value.icon));
}
function validCloudEntry(value) {
  return record(value) && id(value.id) && typeof value.text === "string" && value.text.length <= 3e6 && timestamp(value.createdAt) && (value.createdOn === void 0 || journalDevices.some((device) => device === value.createdOn)) && (value.updatedAt === void 0 || timestamp(value.updatedAt)) && (value.photo === void 0 || isJournalPhoto(value.photo)) && (value.taskId === void 0 || id(value.taskId)) && (value.linkedEntryId === void 0 || id(value.linkedEntryId) && value.linkedEntryId !== value.id) && (value.location === void 0 || validApproximateLocation(value.location)) && (value.folderId === void 0 || id(value.folderId));
}
function validCloudItem(value) {
  if (!record(value) || value.kind !== "folder" && value.kind !== "entry" || !id(value.id) || typeof value.deleted !== "boolean") return false;
  if (value.deleted) return value.payload === null;
  return value.kind === "folder" ? validCloudFolder(value.payload) && value.payload.id === value.id : validCloudEntry(value.payload) && value.payload.id === value.id;
}
function validCloudOperation(value) {
  if (!record(value)) return false;
  const mode = value.mode;
  const previous = value.previous;
  return (mode === "import" || mode === "change") && validCloudItem(value) && (mode !== "import" || !value.deleted) && (previous === void 0 || previous === null || (value.kind === "folder" ? validCloudFolder(previous) : validCloudEntry(previous)));
}

// server/journal-handler.ts
import { createHash } from "node:crypto";
var json = (body, status = 200) => Response.json(body, {
  status,
  headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
});
function cursorFromUrl(url) {
  const raw = url.searchParams.get("after");
  if (!raw) return null;
  const decoded = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  if (!Array.isArray(decoded) || decoded.length !== 2 || decoded[0] !== "folder" && decoded[0] !== "entry" || typeof decoded[1] !== "string" || decoded[1].length > 200) throw new Error("Invalid cursor");
  return [decoded[0], decoded[1]];
}
function createJournalHandler(verify, store2, enabled) {
  return async (request) => {
    if (!enabled()) return json({ error: "Journal sync is not enabled." }, 404);
    if (request.method !== "GET" && request.method !== "POST") return json({ error: "Method not allowed." }, 405);
    const authorization = request.headers.get("authorization");
    const guestCode = authorization?.startsWith("Guest ") ? authorization.slice(6).replace(/-/g, "").toLowerCase() : null;
    const isGuest = guestCode !== null;
    if (isGuest && !/^[0-9a-f]{64}$/.test(guestCode)) return json({ error: "Invalid recovery code." }, 401);
    if (!isGuest && !authorization?.startsWith("Bearer ")) return json({ error: "Sign in or enter a recovery code." }, 401);
    const userId = isGuest ? `guest:${createHash("sha256").update(guestCode).digest("hex")}` : await verify(authorization.slice(7));
    if (!userId) return json({ error: "Sign in required." }, 401);
    try {
      if (isGuest && request.method === "GET" && new URL(request.url).searchParams.get("guest") === "status") {
        if (!store2.guestExists) return json({ error: "Guest storage is unavailable." }, 503);
        return await store2.guestExists(userId) ? json({ exists: true }) : json({ exists: false }, 404);
      }
      if (isGuest && request.method === "POST" && new URL(request.url).searchParams.get("guest") === "create") {
        if (!store2.createGuest) return json({ error: "Guest storage is unavailable." }, 503);
        await store2.createGuest(userId);
        return json({ created: true }, 201);
      }
      if (isGuest && (!store2.guestExists || !await store2.guestExists(userId))) return json({ error: "Recovery code not found." }, 404);
      if (request.method === "GET") {
        const result = await store2.list(userId, cursorFromUrl(new URL(request.url)));
        return json({ items: result.items, after: result.next ? Buffer.from(JSON.stringify(result.next)).toString("base64url") : null });
      }
      const length = Number(request.headers.get("content-length"));
      if (Number.isFinite(length) && length > 35e5) return json({ error: "Journal item is too large." }, 413);
      const raw = await request.text();
      if (raw.length > 35e5) return json({ error: "Journal item is too large." }, 413);
      let operation;
      try {
        operation = JSON.parse(raw);
      } catch {
        return json({ error: "Invalid JSON." }, 400);
      }
      if (!validCloudOperation(operation)) return json({ error: "Invalid Journal item." }, 400);
      await store2.write(userId, operation);
      return json({ saved: true });
    } catch (error) {
      if (error instanceof Error && error.message === "Invalid cursor") return json({ error: "Invalid cursor." }, 400);
      if (error instanceof Error && error.message === "Folder missing") return json({ error: "Folder missing." }, 409);
      if (error instanceof Error && error.message === "Journal conflict") return json({ error: "Journal changed on another device." }, 409);
      return json({ error: "Journal storage is unavailable. Local data was kept." }, 503);
    }
  };
}

// server/journal-store.ts
import { neon } from "@neondatabase/serverless";
function createJournalStore(connectionString) {
  const sql = neon(connectionString);
  return {
    async guestExists(ownerId) {
      const rows = await sql`SELECT 1 FROM lifeos_journal_guest_vaults WHERE owner_id = ${ownerId} LIMIT 1`;
      return rows.length > 0;
    },
    async createGuest(ownerId) {
      await sql`INSERT INTO lifeos_journal_guest_vaults (owner_id) VALUES (${ownerId}) ON CONFLICT DO NOTHING`;
    },
    async list(userId, after) {
      const kind = after?.[0] ?? "";
      const id2 = after?.[1] ?? "";
      const rows = await sql`
        SELECT kind, id, payload, deleted
        FROM lifeos_journal_items
        WHERE user_id = ${userId} AND (kind, id) > (${kind}, ${id2})
        ORDER BY kind, id
        LIMIT 2
      `;
      const items = rows.slice(0, 1).map((row) => ({
        kind: row.kind,
        id: row.id,
        payload: row.payload,
        deleted: row.deleted
      }));
      const last = items.at(-1);
      return { items, next: rows.length > 1 && last ? [last.kind, last.id] : null };
    },
    async write(userId, operation) {
      const payload = operation.deleted ? null : JSON.stringify(operation.payload);
      if (operation.kind === "entry" && !operation.deleted && operation.payload?.folderId) {
        const folders = await sql`
          SELECT 1 FROM lifeos_journal_items
          WHERE user_id = ${userId} AND kind = 'folder'
            AND id = ${operation.payload.folderId} AND NOT deleted
          LIMIT 1
        `;
        if (!folders.length) throw new Error("Folder missing");
      }
      if (operation.mode === "import") {
        const inserted = await sql`
          INSERT INTO lifeos_journal_items (user_id, kind, id, payload, deleted)
          VALUES (${userId}, ${operation.kind}, ${operation.id}, ${payload}::jsonb, false)
          ON CONFLICT (user_id, kind, id) DO NOTHING
          RETURNING id
        `;
        if (!inserted.length) {
          const identical = await sql`
            SELECT 1 FROM lifeos_journal_items
            WHERE user_id = ${userId} AND kind = ${operation.kind} AND id = ${operation.id}
              AND NOT deleted AND payload = ${payload}::jsonb
            LIMIT 1
          `;
          if (!identical.length) throw new Error("Journal conflict");
        }
        return;
      }
      if (operation.previous === void 0) throw new Error("Journal conflict");
      const changed = operation.previous === null ? await sql`
          INSERT INTO lifeos_journal_items (user_id, kind, id, payload, deleted)
          VALUES (${userId}, ${operation.kind}, ${operation.id}, ${payload}::jsonb, ${operation.deleted})
          ON CONFLICT (user_id, kind, id) DO NOTHING
          RETURNING id
        ` : await sql`
          UPDATE lifeos_journal_items SET payload = ${payload}::jsonb, deleted = ${operation.deleted}, changed_at = now()
          WHERE user_id = ${userId} AND kind = ${operation.kind} AND id = ${operation.id}
            AND NOT deleted AND payload = ${JSON.stringify(operation.previous)}::jsonb
          RETURNING id
        `;
      if (!changed.length) throw new Error("Journal conflict");
      if (operation.kind === "folder" && operation.deleted) {
        await sql`
          UPDATE lifeos_journal_items SET payload = payload - 'folderId', changed_at = now()
          WHERE user_id = ${userId} AND kind = 'entry' AND NOT deleted
            AND payload->>'folderId' = ${operation.id}
        `;
      }
    }
  };
}

// server/journal-entry.ts
var authUrl = process.env.NEON_AUTH_BASE_URL;
var databaseUrl = process.env.DATABASE_URL;
var jwks = authUrl ? createRemoteJWKSet(new URL(`${authUrl.replace(/\/$/, "")}/.well-known/jwks.json`)) : null;
var issuer = authUrl ? new URL(authUrl).origin : "";
var store = databaseUrl ? createJournalStore(databaseUrl) : null;
var handler = createJournalHandler(async (token) => {
  if (!jwks) return null;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ["EdDSA"],
      issuer,
      audience: issuer
    });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}, store ?? {
  list: async () => {
    throw new Error("Database unavailable");
  },
  write: async () => {
    throw new Error("Database unavailable");
  }
}, () => process.env.JOURNAL_SYNC_ENABLED === "true" && (process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "production"));
var journal_entry_default = { fetch: handler };
export {
  journal_entry_default as default
};
