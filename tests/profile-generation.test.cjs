const assert = require("node:assert/strict");
const test = require("node:test");

const Profile = require("../profile.js");

const EPOCH = "1970-01-01T00:00:00.000Z";
const validIds = Object.fromEntries(Profile.TYPES.map((type) => [
  type,
  new Set([`${type}-1`, `${type}-2`])
]));

test("legacy schemaVersion 1 profiles migrate into generation zero with field clocks", () => {
  const updatedAt = "2026-08-12T01:02:03.000Z";
  const legacy = {
    schemaVersion: 1,
    updatedAt,
    enabled: false,
    themeLinking: true,
    feedback: {
      book: {
        "book-1": {
          liked: true,
          favorite: false,
          unsuitable: false,
          updatedAt: "2026-08-12T01:00:00.000Z"
        }
      }
    },
    explicit: {
      book: { genres: ["history"], eras: ["recent"], popularity: ["underseen"] },
      city: { regions: ["Europe"] }
    }
  };

  const migrated = Profile.parse(JSON.stringify(legacy), validIds);
  assert.equal(migrated.schemaVersion, 1);
  assert.equal(migrated.generation, 0);
  assert.equal(migrated.enabled, false);
  assert.equal(migrated.updatedAtByField.enabled, updatedAt);
  assert.equal(migrated.updatedAtByField.themeLinking, updatedAt);
  assert.equal(migrated.updatedAtByField.explicit.book.genres, updatedAt);
  assert.deepEqual(migrated.explicit.city.regions, ["Europe"]);
  assert.equal(migrated.feedback.book["book-1"].updatedAtByKind.liked, "2026-08-12T01:00:00.000Z");
});

test("same-generation branches merge feedback independently by kind", () => {
  const base = Profile.emptyProfile();
  const liked = Profile.setFeedback(base, "book", "book-1", "liked", true, new Date("2026-08-12T02:00:00Z"));
  const favorited = Profile.setFeedback(base, "book", "book-1", "favorite", true, new Date("2026-08-12T02:00:01Z"));

  const forward = Profile.merge(liked, favorited, validIds);
  const reverse = Profile.merge(favorited, liked, validIds);
  assert.deepEqual(Profile.feedbackFor(forward, "book", "book-1"), {
    liked: true,
    favorite: true,
    unsuitable: false
  });
  assert.deepEqual(reverse, forward);
});

test("a higher generation replaces the lower generation as a whole", () => {
  let low = Profile.setFeedback(Profile.emptyProfile(), "movie", "movie-1", "liked", true, new Date("2026-08-12T03:00:00Z"));
  low = Profile.setExplicit(low, "city", "regions", ["Asia"], new Date("2026-08-12T03:00:01Z"));
  const high = Profile.resetPreferences(low, new Date("2026-08-12T03:00:02Z"), validIds);

  const staleFutureWrite = Profile.setFeedback(low, "movie", "movie-2", "liked", true, new Date("2099-01-01T00:00:00Z"));
  for (const merged of [
    Profile.merge(high, staleFutureWrite, validIds),
    Profile.merge(staleFutureWrite, high, validIds)
  ]) {
    assert.equal(merged.generation, 1);
    assert.equal(Profile.feedbackFor(merged, "movie", "movie-1").liked, false);
    assert.equal(Profile.feedbackFor(merged, "movie", "movie-2").liked, false);
    assert.deepEqual(merged.explicit.city.regions, []);
  }
});

test("replaceGeneration raises imported content above the local generation without rewriting it", () => {
  let imported = Profile.setExplicit(Profile.emptyProfile(), "german", "levels", ["B1"], new Date("2024-01-01T00:00:00Z"));
  imported = Profile.setFeedback(imported, "german", "german-1", "favorite", true, new Date("2024-01-01T00:00:01Z"));
  const raised = Profile.replaceGeneration(imported, 41, validIds);
  assert.equal(raised.generation, 42);
  assert.equal(raised.updatedAt, imported.updatedAt);
  assert.deepEqual(raised.explicit, imported.explicit);
  assert.deepEqual(raised.feedback, imported.feedback);
});

test("reset creates a new generation, preserves favorites, and clears preference signals", () => {
  let source = Profile.emptyProfile();
  source = Profile.setSetting(source, "enabled", false, new Date("2026-08-12T04:00:00Z"));
  source = Profile.setSetting(source, "themeLinking", false, new Date("2026-08-12T04:00:01Z"));
  source = Profile.setFeedback(source, "book", "book-1", "favorite", true, new Date("2026-08-12T04:00:02Z"));
  source = Profile.setFeedback(source, "book", "book-1", "liked", true, new Date("2026-08-12T04:00:03Z"));
  source = Profile.setFeedback(source, "movie", "movie-1", "unsuitable", true, new Date("2026-08-12T04:00:04Z"));
  source = Profile.setExplicit(source, "medical", "topicGroups", ["sleep"], new Date("2026-08-12T04:00:05Z"));

  const reset = Profile.resetPreferences(source, new Date("2026-08-12T04:00:06Z"), validIds);
  assert.equal(reset.generation, source.generation + 1);
  assert.equal(reset.enabled, false);
  assert.equal(reset.themeLinking, false);
  assert.deepEqual(Profile.feedbackFor(reset, "book", "book-1"), {
    liked: false,
    favorite: true,
    unsuitable: false
  });
  assert.deepEqual(Profile.feedbackFor(reset, "movie", "movie-1"), {
    liked: false,
    favorite: false,
    unsuitable: false
  });
  assert.deepEqual(reset.explicit.medical.topicGroups, []);
  assert.equal(reset.updatedAtByField.explicit.medical.topicGroups, "2026-08-12T04:00:06.000Z");
});

test("concurrent changes to different explicit fields and settings both survive", () => {
  const base = Profile.emptyProfile();
  let cityBranch = Profile.setExplicit(base, "city", "regions", ["Europe"], new Date("2026-08-12T05:00:00Z"));
  cityBranch = Profile.setSetting(cityBranch, "enabled", false, new Date("2026-08-12T05:00:01Z"));
  let medicalBranch = Profile.setExplicit(base, "medical", "topicGroups", ["sleep"], new Date("2026-08-12T05:00:02Z"));
  medicalBranch = Profile.setSetting(medicalBranch, "themeLinking", false, new Date("2026-08-12T05:00:03Z"));

  const merged = Profile.merge(cityBranch, medicalBranch, validIds);
  assert.deepEqual(merged.explicit.city.regions, ["Europe"]);
  assert.deepEqual(merged.explicit.medical.topicGroups, ["sleep"]);
  assert.equal(merged.enabled, false);
  assert.equal(merged.themeLinking, false);
  assert.equal(merged.updatedAtByField.explicit.city.regions, "2026-08-12T05:00:00.000Z");
  assert.equal(merged.updatedAtByField.explicit.medical.topicGroups, "2026-08-12T05:00:02.000Z");
  assert.deepEqual(Profile.merge(medicalBranch, cityBranch, validIds), merged);
});

test("latest timestamp wins only for the explicit field that changed", () => {
  const base = Profile.setExplicit(Profile.emptyProfile(), "book", "genres", ["history"], new Date("2026-08-12T06:00:00Z"));
  const first = Profile.setExplicit(base, "book", "genres", ["mystery"], new Date("2026-08-12T06:00:01Z"));
  const second = Profile.setExplicit(base, "book", "genres", ["scifi"], new Date("2026-08-12T06:00:02Z"));
  assert.deepEqual(Profile.merge(first, second, validIds).explicit.book.genres, ["scifi"]);
});

test("same-millisecond updates advance each field clock so cancellations are not swallowed", () => {
  const now = new Date("2026-08-12T06:10:00.000Z");

  const settingOn = Profile.setSetting(Profile.emptyProfile(), "enabled", true, now);
  const settingOff = Profile.setSetting(settingOn, "enabled", false, now);
  assert.equal(settingOff.enabled, false);
  assert.equal(settingOff.updatedAtByField.enabled, "2026-08-12T06:10:00.001Z");
  assert.equal(Profile.merge(settingOn, settingOff, validIds).enabled, false);

  const explicitFirst = Profile.setExplicit(Profile.emptyProfile(), "book", "genres", ["history"], now);
  const explicitSecond = Profile.setExplicit(explicitFirst, "book", "genres", [], now);
  assert.deepEqual(explicitSecond.explicit.book.genres, []);
  assert.equal(explicitSecond.updatedAtByField.explicit.book.genres, "2026-08-12T06:10:00.001Z");

  const liked = Profile.setFeedback(Profile.emptyProfile(), "book", "book-1", "liked", true, now);
  const unliked = Profile.setFeedback(liked, "book", "book-1", "liked", false, now);
  assert.equal(Profile.feedbackFor(unliked, "book", "book-1").liked, false);
  assert.equal(unliked.feedback.book["book-1"].updatedAtByKind.liked, "2026-08-12T06:10:00.001Z");
  assert.equal(Profile.merge(liked, unliked, validIds).feedback.book["book-1"].liked, false);
});

test("every setting, explicit field, and feedback kind owns a strictly monotonic clock", () => {
  const now = new Date("2026-08-12T06:15:00.000Z");
  for (const field of ["enabled", "themeLinking"]) {
    const first = Profile.setSetting(Profile.emptyProfile(), field, true, now);
    const second = Profile.setSetting(first, field, false, now);
    assert.equal(Date.parse(second.updatedAtByField[field]), Date.parse(first.updatedAtByField[field]) + 1, field);
  }

  const explicitCases = [
    ["book", "genres", ["history"]],
    ["book", "eras", ["early"]],
    ["book", "popularity", ["classic"]],
    ["movie", "genres", ["mystery"]],
    ["movie", "eras", ["modern"]],
    ["movie", "popularity", ["underseen"]],
    ["city", "regions", ["Europe"]],
    ["german", "levels", ["A1"]],
    ["medical", "topicGroups", ["sleep"]]
  ];
  for (const [type, field, value] of explicitCases) {
    const first = Profile.setExplicit(Profile.emptyProfile(), type, field, value, now);
    const second = Profile.setExplicit(first, type, field, [], now);
    assert.equal(
      Date.parse(second.updatedAtByField.explicit[type][field]),
      Date.parse(first.updatedAtByField.explicit[type][field]) + 1,
      `${type}.${field}`
    );
  }

  for (const kind of Profile.FEEDBACK_KINDS) {
    const first = Profile.setFeedback(Profile.emptyProfile(), "book", "book-1", kind, true, now);
    const second = Profile.setFeedback(first, "book", "book-1", kind, false, now);
    assert.equal(
      Date.parse(second.feedback.book["book-1"].updatedAtByKind[kind]),
      Date.parse(first.feedback.book["book-1"].updatedAtByKind[kind]) + 1,
      kind
    );
  }
});

test("clock rollback still advances the changed field by one logical millisecond", () => {
  const first = Profile.setExplicit(
    Profile.emptyProfile(),
    "medical",
    "topicGroups",
    ["sleep"],
    new Date("2026-08-12T06:20:00.000Z")
  );
  const afterRollback = Profile.setExplicit(
    first,
    "medical",
    "topicGroups",
    ["movement"],
    new Date("2026-08-12T05:20:00.000Z")
  );
  assert.deepEqual(afterRollback.explicit.medical.topicGroups, ["movement"]);
  assert.equal(afterRollback.updatedAtByField.explicit.medical.topicGroups, "2026-08-12T06:20:00.001Z");
  assert.deepEqual(Profile.merge(first, afterRollback, validIds).explicit.medical.topicGroups, ["movement"]);
});

test("a local operation immediately supersedes a future field timestamp", () => {
  const future = "2099-01-01T00:00:00.000Z";
  const imported = Profile.normalize({
    ...Profile.emptyProfile(),
    updatedAt: future,
    enabled: true,
    updatedAtByField: {
      ...Profile.emptyProfile().updatedAtByField,
      enabled: future,
      explicit: {
        ...Profile.emptyProfile().updatedAtByField.explicit,
        city: { regions: future }
      }
    },
    explicit: {
      ...Profile.emptyProfile().explicit,
      city: { regions: ["Europe"] }
    },
    feedback: {
      ...Profile.emptyProfile().feedback,
      movie: {
        "movie-1": {
          liked: true,
          favorite: false,
          unsuitable: false,
          updatedAt: future,
          updatedAtByKind: { liked: future, favorite: EPOCH, unsuitable: EPOCH }
        }
      }
    }
  }, validIds);
  const localNow = new Date("2026-08-12T06:30:00.000Z");

  const disabled = Profile.setSetting(imported, "enabled", false, localNow);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.updatedAtByField.enabled, "2099-01-01T00:00:00.001Z");

  const moved = Profile.setExplicit(imported, "city", "regions", ["Asia"], localNow);
  assert.deepEqual(moved.explicit.city.regions, ["Asia"]);
  assert.equal(moved.updatedAtByField.explicit.city.regions, "2099-01-01T00:00:00.001Z");

  const unliked = Profile.setFeedback(imported, "movie", "movie-1", "liked", false, localNow);
  assert.equal(unliked.feedback.movie["movie-1"].liked, false);
  assert.equal(unliked.feedback.movie["movie-1"].updatedAtByKind.liked, "2099-01-01T00:00:00.001Z");
});

test("same-base same-time tab conflicts converge deterministically in either merge order", () => {
  const now = new Date("2026-08-12T06:40:00.000Z");
  const base = Profile.emptyProfile();
  const likedBranch = Profile.setFeedback(base, "book", "book-1", "liked", true, now);
  const unsuitableBranch = Profile.setFeedback(base, "book", "book-1", "unsuitable", true, now);

  const forward = Profile.merge(likedBranch, unsuitableBranch, validIds);
  const reverse = Profile.merge(unsuitableBranch, likedBranch, validIds);
  assert.deepEqual(reverse, forward);
  assert.deepEqual(Profile.feedbackFor(forward, "book", "book-1"), {
    liked: false,
    favorite: false,
    unsuitable: true
  });
  assert.equal(forward.feedback.book["book-1"].updatedAtByKind.liked, "2026-08-12T06:40:00.000Z");
  assert.equal(forward.feedback.book["book-1"].updatedAtByKind.unsuitable, "2026-08-12T06:40:00.000Z");
});

test("unknown and non-positive years do not enter an era bucket", () => {
  assert.equal(Profile.eraOf({ year: 0 }), "");
  assert.equal(Profile.eraOf({ year: -1 }), "");
  assert.equal(Profile.eraOf({ year: "unknown" }), "");
  assert.equal(Profile.eraOf({ year: 1979 }), "early");
  assert.equal(Profile.eraOf({ year: 2000 }), "modern");
  assert.equal(Profile.eraOf({ year: 2020 }), "recent");
});

test("empty profiles expose complete clocks without sharing mutable state", () => {
  const first = Profile.emptyProfile();
  const second = Profile.emptyProfile();
  first.explicit.book.genres.push("history");
  first.updatedAtByField.explicit.book.genres = "2026-08-12T07:00:00.000Z";
  assert.deepEqual(second.explicit.book.genres, []);
  assert.equal(second.updatedAtByField.explicit.book.genres, EPOCH);
});
