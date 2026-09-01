const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const util = require("node:util");

const ROOT = path.resolve(__dirname, "..");
const UPSTREAM_ROOT = path.join(ROOT, "data", "upstream");
const MOVIE_TAIL = process.argv.includes("--movie-tail");
const ONLY_BOOKS = process.argv.includes("--books");
const ONLY_MOVIES = process.argv.includes("--movies") || MOVIE_TAIL;
const REFRESH_BOOKS = !ONLY_MOVIES;
const REFRESH_MOVIES = !ONLY_BOOKS;

const OPEN_LIBRARY_FIELDS = [
  "key",
  "title",
  "author_name",
  "cover_i",
  "ratings_average",
  "ratings_count",
  "first_publish_year",
  "number_of_pages_median"
].join(",");

const BOOK_QUERIES = Object.freeze([
  ["history", "historical fiction"],
  ["mystery", "detective and mystery stories"],
  ["scifi", "science fiction"]
]);
const MOVIE_GENRES = Object.freeze([
  ["history", "History"],
  ["mystery", "Mystery"],
  ["scifi", "Sci-Fi"]
]);
const MOVIE_SKIPS = Object.freeze(MOVIE_TAIL ? [250, 300, 350, 400, 450] : [0, 50, 100, 150, 200]);
const execFile = util.promisify(childProcess.execFile);

function isoSlug(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchBuffer(url, attempts = 3) {
  if (process.platform === "win32") return fetchWithPowerShell(url);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json, application/octet-stream;q=0.9, */*;q=0.8",
          "User-Agent": "DailyAtlasCurator/2.0 (offline educational prototype)"
        },
        redirect: "follow",
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      return { buffer, effectiveUrl: response.url, status: response.status };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(900 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

async function fetchWithPowerShell(url) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daily-atlas-source-"));
  const tempFile = path.join(tempDir, "response.bin");
  try {
    const { stdout } = await execFile("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy", "Bypass",
      "-File", path.join(__dirname, "download-source.ps1"),
      "-Url", url,
      "-OutputPath", tempFile
    ], { encoding: "utf8", maxBuffer: 1024 * 1024, timeout: 120000 });
    const metadata = JSON.parse(stdout.trim());
    return {
      buffer: fs.readFileSync(tempFile),
      effectiveUrl: metadata.effectiveUrl || url,
      status: metadata.status || 200
    };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function archive(snapshotDir, entry) {
  console.log(`GET ${entry.id}`);
  const result = await fetchBuffer(entry.url);
  const filePath = path.join(snapshotDir, entry.file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, result.buffer);
  if (entry.json) JSON.parse(result.buffer.toString("utf8"));
  return {
    id: entry.id,
    group: entry.group,
    file: path.relative(ROOT, filePath).replaceAll("\\", "/"),
    requestedUrl: entry.url,
    effectiveUrl: result.effectiveUrl,
    retrievedAt: new Date().toISOString(),
    httpStatus: result.status,
    bytes: result.buffer.length,
    sha256: sha256(result.buffer),
    licenseUrl: entry.licenseUrl,
    licenseNote: entry.licenseNote
  };
}

async function main() {
  const startedAt = new Date();
  const snapshotName = isoSlug(startedAt);
  const snapshotDir = path.join(UPSTREAM_ROOT, "snapshots", snapshotName);
  fs.mkdirSync(snapshotDir, { recursive: true });

  const entries = [];
  if (REFRESH_BOOKS) {
    for (const [genre, subject] of BOOK_QUERIES) {
      const query = encodeURIComponent(`subject:"${subject}"`);
      const url = `https://openlibrary.org/search.json?q=${query}&fields=${encodeURIComponent(OPEN_LIBRARY_FIELDS)}&limit=500&sort=rating`;
      entries.push(await archive(snapshotDir, {
        id: `open-library-${genre}`,
        group: "books",
        file: `open-library/${genre}.json`,
        url,
        json: true,
        licenseUrl: "https://openlibrary.org/developers/licensing",
        licenseNote: "Open Library metadata snapshot; verify rights for downstream cover reuse separately."
      }));
      await sleep(1100);
    }
  }

  if (REFRESH_MOVIES) {
    for (const [genre, endpointGenre] of MOVIE_GENRES) {
      for (const skip of MOVIE_SKIPS) {
        const suffix = skip ? `&skip=${skip}` : "";
        const url = `https://v3-cinemeta.strem.io/catalog/movie/top/genre=${encodeURIComponent(endpointGenre)}${suffix}.json`;
        entries.push(await archive(snapshotDir, {
          id: `cinemeta-${genre}-${skip}`,
          group: "movies",
          file: `cinemeta/${genre}-${skip}.json`,
          url,
          json: true,
          licenseUrl: "https://github.com/Stremio/stremio-addon-sdk",
          licenseNote: "Cinemeta public addon metadata response; no service-level guarantee."
        }));
        await sleep(180);
      }
    }

    entries.push(await archive(snapshotDir, {
      id: "imdb-title-ratings",
      group: "movies",
      file: "imdb/title.ratings.tsv.gz",
      url: "https://datasets.imdbws.com/title.ratings.tsv.gz",
      json: false,
      licenseUrl: "https://developer.imdb.com/non-commercial-datasets/",
      licenseNote: "IMDb non-commercial dataset; personal and non-commercial use only under IMDb terms."
    }));
  }

  const carriedEntries = [];
  const latestPath = path.join(UPSTREAM_ROOT, "latest.json");
  if ((ONLY_BOOKS || ONLY_MOVIES) && fs.existsSync(latestPath)) {
    const previousPointer = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    const previousManifestPath = path.resolve(ROOT, previousPointer.manifest);
    const previousBytes = fs.readFileSync(previousManifestPath);
    if (sha256(previousBytes) !== previousPointer.sha256) throw new Error("Previous upstream manifest hash mismatch");
    const previousManifest = JSON.parse(previousBytes.toString("utf8"));
    const replacedIds = new Set(entries.map((entry) => entry.id));
    carriedEntries.push(...previousManifest.entries.filter((entry) => !replacedIds.has(entry.id)));
  }

  const allEntries = [...carriedEntries, ...entries].sort((left, right) => left.id.localeCompare(right.id));
  const manifest = {
    schemaVersion: 1,
    snapshotName,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    refreshScope: {
      books: REFRESH_BOOKS,
      movies: REFRESH_MOVIES
    },
    carriedForwardEntries: carriedEntries.length,
    selectionBoundary: "These are immutable upstream responses. They never replace curated pools automatically.",
    entries: allEntries
  };
  const manifestPath = path.join(snapshotDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const pointer = {
    schemaVersion: 1,
    manifest: path.relative(ROOT, manifestPath).replaceAll("\\", "/"),
    sha256: sha256(fs.readFileSync(manifestPath))
  };
  fs.writeFileSync(latestPath, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  console.log(`PASS: archived ${entries.length} upstream files in ${path.relative(ROOT, snapshotDir)}; manifest entries=${allEntries.length}`);
  console.log(`manifest sha256=${pointer.sha256}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
