const crypto = require("node:crypto");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const util = require("node:util");

const ROOT = path.resolve(__dirname, "..");
const UPSTREAM_ROOT = path.join(ROOT, "data", "upstream", "media500");
const POINTER_PATH = path.join(UPSTREAM_ROOT, "latest.json");
const execFile = util.promisify(childProcess.execFile);
const SUPPLEMENTAL = process.argv.includes("--supplemental");
const MYSTERY_BOOK_ONLY = process.argv.includes("--mystery-book");
const BOOKS_WITH_SUBJECTS = process.argv.includes("--books-with-subjects");
const PRECISION_BOOKS = process.argv.includes("--precision-books");
const DEPTH_BOOKS = process.argv.includes("--depth-books");
const CLASSIC_BOOKS = process.argv.includes("--classic-books");
const CLASSIC_DEPTH_BOOKS = process.argv.includes("--classic-depth-books");

const OPEN_LIBRARY_FIELDS = [
  "key",
  "title",
  "author_name",
  "cover_i",
  "ratings_average",
  "ratings_count",
  "first_publish_year",
  "number_of_pages_median",
  "subject"
].join(",");

const BOOK_QUERIES = Object.freeze([
  ["history", "historical fiction"],
  ["mystery", "detective and mystery stories"],
  ["scifi", "science fiction"]
]);
const SUPPLEMENTAL_BOOK_QUERIES = Object.freeze([
  ["history-general", "history"],
  ["history-biography", "biography"],
  ["mystery-crime", "crime fiction"],
  ["mystery-thriller", "thrillers fiction"]
]);
const MYSTERY_BOOK_QUERY = Object.freeze([["mystery-general", "mystery"]]);
const PRECISION_BOOK_QUERIES = Object.freeze([
  ["history-world", "world history"],
  ["history-social", "social history"],
  ["history-military", "military history"],
  ["history-holocaust", "holocaust"],
  ["history-revolution", "revolutions"],
  ["mystery-detective", "detective fiction"],
  ["mystery-investigation", "criminal investigation"],
  ["mystery-murder", "murder"],
  ["scifi-time", "time travel fiction"]
]);
const DEPTH_BOOK_QUERIES = Object.freeze([
  ["history-memoir", "memoirs"],
  ["history-autobiography", "autobiography"],
  ["history-war", "war"],
  ["history-politics", "politics and government"],
  ["mystery-crime-general", "crime"],
  ["mystery-suspense", "suspense"],
  ["mystery-detectives", "detectives"],
  ["scifi-dystopia", "dystopian fiction"],
  ["scifi-space", "space opera"],
  ["scifi-ai", "artificial intelligence fiction"]
]);
const CLASSIC_BOOK_QUERIES = Object.freeze([
  ["history-classic-historical", "historical fiction", 80],
  ["history-classic-biography", "biography", 80],
  ["mystery-classic-detective", "detective and mystery stories", 80],
  ["mystery-classic-crime", "crime", 80],
  ["scifi-classic", "science fiction", 80],
  ["scifi-classic-dystopia", "dystopian fiction", 80]
]);
const CLASSIC_DEPTH_BOOK_QUERIES = Object.freeze([
  ["history-classic-american", "american history", 80],
  ["history-classic-political", "political history", 80],
  ["mystery-classic-legal", "legal thriller", 80],
  ["mystery-classic-police", "police procedural", 80],
  ["scifi-classic-robots", "robots", 80],
  ["scifi-classic-cyberpunk", "cyberpunk", 80]
]);
const ALL_BOOK_QUERIES = Object.freeze([
  ...BOOK_QUERIES,
  ...SUPPLEMENTAL_BOOK_QUERIES,
  ...MYSTERY_BOOK_QUERY
]);
const MOVIE_GENRES = Object.freeze([
  ["history", "History"],
  ["mystery", "Mystery"],
  ["scifi", "Sci-Fi"]
]);
const MOVIE_SKIPS = Object.freeze([500, 550, 600, 650, 700, 750, 800, 850, 900, 950]);
const SUPPLEMENTAL_MOVIE_GENRES = Object.freeze([
  ["history-biography", "Biography"],
  ["history-war", "War"],
  ["mystery-thriller", "Thriller"],
  ["mystery-crime", "Crime"],
  ["mystery-film-noir", "Film-Noir"]
]);
const SUPPLEMENTAL_MOVIE_SKIPS = Object.freeze([0, 50, 100, 150, 200, 250, 300, 350, 400, 450]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isoSlug(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex").toUpperCase();
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function download(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "daily-atlas-media500-source-"));
    const tempFile = path.join(tempDirectory, "response.bin");
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
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(900 * attempt);
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
  throw lastError;
}

async function archive(snapshotDirectory, specification) {
  console.log(`GET ${specification.id}`);
  const result = await download(specification.url);
  JSON.parse(result.buffer.toString("utf8"));
  const filePath = path.join(snapshotDirectory, specification.file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, result.buffer);
  return {
    id: specification.id,
    group: specification.group,
    file: path.relative(ROOT, filePath).replaceAll("\\", "/"),
    requestedUrl: specification.url,
    effectiveUrl: result.effectiveUrl,
    retrievedAt: new Date().toISOString(),
    httpStatus: result.status,
    bytes: result.buffer.length,
    sha256: sha256(result.buffer),
    licenseUrl: specification.licenseUrl,
    licenseNote: specification.licenseNote
  };
}

async function main() {
  const startedAt = new Date();
  const snapshotName = isoSlug(startedAt);
  const snapshotDirectory = path.join(UPSTREAM_ROOT, "snapshots", snapshotName);
  fs.mkdirSync(snapshotDirectory, { recursive: true });
  const entries = [];

  const bookQueries = CLASSIC_DEPTH_BOOKS ? CLASSIC_DEPTH_BOOK_QUERIES : CLASSIC_BOOKS ? CLASSIC_BOOK_QUERIES : DEPTH_BOOKS ? DEPTH_BOOK_QUERIES : PRECISION_BOOKS ? PRECISION_BOOK_QUERIES : BOOKS_WITH_SUBJECTS ? ALL_BOOK_QUERIES : MYSTERY_BOOK_ONLY ? MYSTERY_BOOK_QUERY : SUPPLEMENTAL ? SUPPLEMENTAL_BOOK_QUERIES : BOOK_QUERIES;
  for (const [genre, subject, minimumRatings = 20] of bookQueries) {
    const query = encodeURIComponent(`subject:"${subject}" ratings_count:[${minimumRatings} TO *]`).replaceAll("*", "%2A");
    const url = `https://openlibrary.org/search.json?q=${query}&fields=${encodeURIComponent(OPEN_LIBRARY_FIELDS)}&limit=500&sort=rating`;
    entries.push(await archive(snapshotDirectory, {
      id: `open-library-qualified-${genre}`,
      group: "books",
      file: `open-library/${genre}.json`,
      url,
      licenseUrl: "https://openlibrary.org/developers/licensing",
      licenseNote: "Open Library metadata snapshot; rating fields are Work-level source evidence, while cover reuse has a separate rights boundary."
    }));
    await sleep(1100);
  }

  const movieGenres = (MYSTERY_BOOK_ONLY || BOOKS_WITH_SUBJECTS || PRECISION_BOOKS || DEPTH_BOOKS || CLASSIC_BOOKS || CLASSIC_DEPTH_BOOKS) ? [] : SUPPLEMENTAL ? SUPPLEMENTAL_MOVIE_GENRES : MOVIE_GENRES;
  const movieSkips = SUPPLEMENTAL ? SUPPLEMENTAL_MOVIE_SKIPS : MOVIE_SKIPS;
  for (const [genre, endpointGenre] of movieGenres) {
    for (const skip of movieSkips) {
      const url = `https://v3-cinemeta.strem.io/catalog/movie/top/genre=${encodeURIComponent(endpointGenre)}&skip=${skip}.json`;
      entries.push(await archive(snapshotDirectory, {
        id: `cinemeta-${genre}-${skip}`,
        group: "movies",
        file: `cinemeta/${genre}-${skip}.json`,
        url,
        licenseUrl: "https://github.com/Stremio/stremio-addon-sdk",
        licenseNote: "Cinemeta public addon metadata response; used only as frozen metadata and genre-screening evidence, without a service or commercial-use guarantee."
      }));
      await sleep(180);
    }
  }

  let carriedEntries = [];
  if ((SUPPLEMENTAL || MYSTERY_BOOK_ONLY || BOOKS_WITH_SUBJECTS || PRECISION_BOOKS || DEPTH_BOOKS || CLASSIC_BOOKS || CLASSIC_DEPTH_BOOKS) && fs.existsSync(POINTER_PATH)) {
    const previousPointer = JSON.parse(fs.readFileSync(POINTER_PATH, "utf8"));
    const previousManifestPath = path.resolve(ROOT, previousPointer.manifest);
    const previousManifestBytes = fs.readFileSync(previousManifestPath);
    assert(sha256(previousManifestBytes) === previousPointer.sha256, "previous supplementary manifest SHA-256 mismatch");
    const previousManifest = JSON.parse(previousManifestBytes.toString("utf8"));
    const replacedIds = new Set(entries.map((entry) => entry.id));
    carriedEntries = previousManifest.entries.filter((entry) => !replacedIds.has(entry.id));
  }
  const allEntries = [...carriedEntries, ...entries].sort((left, right) => left.id.localeCompare(right.id));
  const manifest = {
    schemaVersion: 1,
    snapshotName,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    selectionBoundary: "Immutable supplementary responses for the 500-item expansion; they never replace a curated pool automatically.",
    existingUpstreamPointer: "data/upstream/latest.json",
    carriedForwardEntries: carriedEntries.length,
    entries: allEntries
  };
  const manifestPath = path.join(snapshotDirectory, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const pointer = {
    schemaVersion: 1,
    manifest: path.relative(ROOT, manifestPath).replaceAll("\\", "/"),
    sha256: sha256(fs.readFileSync(manifestPath))
  };
  fs.mkdirSync(UPSTREAM_ROOT, { recursive: true });
  fs.writeFileSync(POINTER_PATH, `${JSON.stringify(pointer, null, 2)}\n`, "utf8");

  const expectedNewEntries = CLASSIC_DEPTH_BOOKS ? 6 : CLASSIC_BOOKS ? 6 : DEPTH_BOOKS ? 10 : PRECISION_BOOKS ? 9 : BOOKS_WITH_SUBJECTS ? 8 : MYSTERY_BOOK_ONLY ? 1 : SUPPLEMENTAL ? 54 : 33;
  assert(entries.length === expectedNewEntries, `expected ${expectedNewEntries} supplementary source files, got ${entries.length}`);
  console.log(`PASS: archived ${entries.length} supplementary source files in ${path.relative(ROOT, snapshotDirectory)}; manifest entries=${allEntries.length}`);
  console.log(`manifest sha256=${pointer.sha256}`);
}

main().catch((error) => {
  console.error(`FAIL: ${error && error.stack ? error.stack : error}`);
  process.exitCode = 1;
});
