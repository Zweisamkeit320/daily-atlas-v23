(async function () {
  "use strict";

  const Engine = globalThis.DailyAtlasEngine || globalThis.DailyDuetEngine;
  const Catalog = globalThis.DAILY_ATLAS_CATALOG || globalThis.DAILY_DUET_CATALOG;
  const State = globalThis.DailyAtlasState;
  const Profile = globalThis.DailyAtlasProfile;
  const Backup = globalThis.DailyAtlasBackup;
  const BackupCrypto = globalThis.DailyAtlasBackupCrypto || null;
  const Lock = globalThis.DailyAtlasLock || null;
  const Appearance = globalThis.DailyAtlasAppearance || null;
  const Explore = globalThis.DailyAtlasExplore || null;
  const Weekly = globalThis.DailyAtlasWeekly || null;
  const Music = globalThis.DailyAtlasMusic || null;
  const Speech = globalThis.DailyAtlasSpeech || null;
  const CityLive = globalThis.DailyAtlasCityLive || null;
  const Reminders = globalThis.DailyAtlasReminders || null;
  const PWA = globalThis.DailyAtlasPWA || null;
  const CatalogStore = globalThis.DailyAtlasCatalogStore || null;
  const RuntimeHealth = globalThis.DailyAtlasRuntimeHealth || null;
  const Visuals = globalThis.DailyAtlasVisuals || null;
  const PublicConfig = globalThis.DAILY_ATLAS_PUBLIC_CONFIG || Object.freeze({});

  if (!Engine || !Catalog || !State || !Profile || !Backup) {
    document.body.innerHTML = '<p class="noscript-message">精选数据加载失败，请刷新页面或重新解压完整文件夹。</p>';
    return;
  }

  const TYPE_META = Object.freeze({
    book: { collection: "books", label: "图书", short: "书", card: "bookCard", swap: "换一本", known: "读过了", unit: "本" },
    movie: { collection: "movies", label: "电影", short: "影", card: "movieCard", swap: "换一部", known: "看过了", unit: "部" },
    city: { collection: "cities", label: "城市", short: "城", card: "cityCard", swap: "换一座", known: "去过了", unit: "座" },
    german: { collection: "german", label: "德语", short: "德", card: "germanCard", swap: "换一条", known: "掌握了", unit: "条" },
    medical: { collection: "medical", label: "医学", short: "医", card: "medicalCard", swap: "换一条", known: "了解了", unit: "条" }
  });
  const TYPES = Object.freeze(Object.keys(TYPE_META));
  const APP_VERSION = "2.6.0";
  const RECORD_PAGE_SIZE = 100;
  const STORAGE_KEYS = Object.freeze({
    statePrefix: "dailyAtlas.state.v3.",
    legacyKnownV2: "dailyAtlas.known.v2",
    legacyDailyV2: "dailyAtlas.daily.v2",
    legacySeen: "dailyDuet.seen.v1",
    legacyDaily: "dailyDuet.daily.v1"
  });
  const GENRE_LABELS = Object.freeze({ history: "历史", mystery: "悬疑", scifi: "科幻" });
  const POPULARITY_LABELS = Object.freeze({
    classic: "平台高热度",
    mid: "中等热度",
    underseen: "平台内相对少评"
  });
  const CANONICAL_STORAGE_KEYS = new Set(
    Array.isArray(Lock?.constants?.CANONICAL_KEYS)
      ? Lock.constants.CANONICAL_KEYS
      : Array.isArray(Backup.TARGET_KEYS) ? [...Backup.TARGET_KEYS, Backup.PENDING_KEY] : []
  );

  const collections = Object.freeze(Object.fromEntries(
    TYPES.map((type) => [type, Engine.qualifiedItems(Catalog[TYPE_META[type].collection])])
  ));
  const allItems = new Map(
    TYPES.flatMap((type) => collections[type].map((item) => [`${type}:${item.id}`, item]))
  );
  const detailPromises = new Map();
  const detailFailures = new Map();

  const elements = {
    bookCard: document.querySelector("#bookCard"),
    movieCard: document.querySelector("#movieCard"),
    cityCard: document.querySelector("#cityCard"),
    germanCard: document.querySelector("#germanCard"),
    medicalCard: document.querySelector("#medicalCard"),
    dateDay: document.querySelector("#dateDay"),
    dateMonth: document.querySelector("#dateMonth"),
    dateYearWeek: document.querySelector("#dateYearWeek"),
    snapshotNote: document.querySelector("#snapshotNote"),
    recordButton: document.querySelector("#recordButton"),
    recordCount: document.querySelector("#recordCount"),
    recordDialog: document.querySelector("#recordDialog"),
    weeklyRange: document.querySelector("#weeklyRange"),
    weeklySummary: document.querySelector("#weeklySummary"),
    weeklyBreakdown: document.querySelector("#weeklyBreakdown"),
    weeklyPrivacyNote: document.querySelector("#weeklyPrivacyNote"),
    recordSummary: document.querySelector("#recordSummary"),
    recordList: document.querySelector("#recordList"),
    closeRecordButton: document.querySelector("#closeRecordButton"),
    doneRecordButton: document.querySelector("#doneRecordButton"),
    resetRecordButton: document.querySelector("#resetRecordButton"),
    dataNoteButton: document.querySelector("#dataNoteButton"),
    dataDialog: document.querySelector("#dataDialog"),
    closeDataButton: document.querySelector("#closeDataButton"),
    doneDataButton: document.querySelector("#doneDataButton"),
    toast: document.querySelector("#toast"),
    toastMessage: document.querySelector("#toastMessage"),
    undoButton: document.querySelector("#undoButton"),
    toastCloseButton: document.querySelector("#toastCloseButton"),
    liveRegion: document.querySelector("#liveRegion"),
    storageWarning: document.querySelector("#storageWarning"),
    themeLabel: document.querySelector("#themeLabel"),
    themeSummary: document.querySelector("#themeSummary"),
    themeMode: document.querySelector("#themeMode"),
    settingsButton: document.querySelector("#settingsButton"),
    settingsDialog: document.querySelector("#settingsDialog"),
    closeSettingsButton: document.querySelector("#closeSettingsButton"),
    doneSettingsButton: document.querySelector("#doneSettingsButton"),
    personalizationEnabled: document.querySelector("#personalizationEnabled"),
    themeLinkingEnabled: document.querySelector("#themeLinkingEnabled"),
    medicalPreferenceOptions: document.querySelector("#medicalPreferenceOptions"),
    resetPreferencesButton: document.querySelector("#resetPreferencesButton"),
    backgroundColor: document.querySelector("#backgroundColor"),
    backgroundStyle: document.querySelector("#backgroundStyle"),
    compactModeEnabled: document.querySelector("#compactModeEnabled"),
    dataSaverEnabled: document.querySelector("#dataSaverEnabled"),
    dataSaverHelp: document.querySelector("#dataSaverHelp"),
    textSize: document.querySelector("#textSize"),
    contrastMode: document.querySelector("#contrastMode"),
    motionMode: document.querySelector("#motionMode"),
    appearanceStatus: document.querySelector("#appearanceStatus"),
    exploreSection: document.querySelector("#explore"),
    exploreForm: document.querySelector("#exploreForm"),
    exploreQuery: document.querySelector("#exploreQuery"),
    exploreType: document.querySelector("#exploreType"),
    exploreGenre: document.querySelector("#exploreGenre"),
    exploreEra: document.querySelector("#exploreEra"),
    exploreRegion: document.querySelector("#exploreRegion"),
    exploreRating: document.querySelector("#exploreRating"),
    exploreGermanLevel: document.querySelector("#exploreGermanLevel"),
    exploreMedicalTopic: document.querySelector("#exploreMedicalTopic"),
    exploreSort: document.querySelector("#exploreSort"),
    exploreStatus: document.querySelector("#exploreStatus"),
    exploreResults: document.querySelector("#exploreResults"),
    explorePagination: document.querySelector("#explorePagination"),
    explorePrevious: document.querySelector("#explorePrevious"),
    exploreNext: document.querySelector("#exploreNext"),
    explorePageStatus: document.querySelector("#explorePageStatus"),
    quickNav: document.querySelector("#quickNav"),
    musicTrackSettings: document.querySelector("#musicTrackSettings"),
    speechVoiceSelect: document.querySelector("#speechVoiceSelect"),
    speechBoundary: document.querySelector("#speechBoundary"),
    exportBackupButton: document.querySelector("#exportBackupButton"),
    encryptBackupEnabled: document.querySelector("#encryptBackupEnabled"),
    exportPasswordFields: document.querySelector("#exportPasswordFields"),
    exportBackupPassword: document.querySelector("#exportBackupPassword"),
    exportBackupPasswordConfirm: document.querySelector("#exportBackupPasswordConfirm"),
    importBackupButton: document.querySelector("#importBackupButton"),
    importBackupFile: document.querySelector("#importBackupFile"),
    backupStatus: document.querySelector("#backupStatus"),
    backupPreviewDialog: document.querySelector("#backupPreviewDialog"),
    closeBackupPreviewButton: document.querySelector("#closeBackupPreviewButton"),
    backupPreviewDescription: document.querySelector("#backupPreviewDescription"),
    backupUnlockPanel: document.querySelector("#backupUnlockPanel"),
    importBackupPassword: document.querySelector("#importBackupPassword"),
    unlockBackupButton: document.querySelector("#unlockBackupButton"),
    backupPreviewPanel: document.querySelector("#backupPreviewPanel"),
    backupMergeMode: document.querySelector("#backupMergeMode"),
    backupReplaceMode: document.querySelector("#backupReplaceMode"),
    backupDiffSummary: document.querySelector("#backupDiffSummary"),
    backupDiffDetails: document.querySelector("#backupDiffDetails"),
    backupImportWarnings: document.querySelector("#backupImportWarnings"),
    backupPreviewStatus: document.querySelector("#backupPreviewStatus"),
    cancelBackupPreviewButton: document.querySelector("#cancelBackupPreviewButton"),
    applyBackupButton: document.querySelector("#applyBackupButton"),
    reminderTime: document.querySelector("#reminderTime"),
    enableReminderButton: document.querySelector("#enableReminderButton"),
    disableReminderButton: document.querySelector("#disableReminderButton"),
    calendarReminderButton: document.querySelector("#calendarReminderButton"),
    reminderStatus: document.querySelector("#reminderStatus"),
    installAppButton: document.querySelector("#installAppButton"),
    updateAppButton: document.querySelector("#updateAppButton"),
    offlineLightMode: document.querySelector("#offlineLightMode"),
    offlineFullMode: document.querySelector("#offlineFullMode"),
    offlineProgressPanel: document.querySelector("#offlineProgressPanel"),
    offlineProgress: document.querySelector("#offlineProgress"),
    offlineProgressText: document.querySelector("#offlineProgressText"),
    pauseOfflineButton: document.querySelector("#pauseOfflineButton"),
    resumeOfflineButton: document.querySelector("#resumeOfflineButton"),
    cancelOfflineButton: document.querySelector("#cancelOfflineButton"),
    offlineStatus: document.querySelector("#offlineStatus"),
    storagePreflightStatus: document.querySelector("#storagePreflightStatus"),
    checkStorageButton: document.querySelector("#checkStorageButton"),
    persistStorageButton: document.querySelector("#persistStorageButton"),
    repairCacheButton: document.querySelector("#repairCacheButton")
  };

  let activePersistenceStorage = null;
  const pendingImportRecovery = await initializePersistenceRecovery();
  globalThis.DAILY_ATLAS_DEFER_PLATFORM_INIT = false;
  const storage = createStorage();
  globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE = storage.available;
  const validIdsByType = Object.fromEntries(TYPES.map((type) => [type, new Set(collections[type].map((item) => item.id))]));
  let persistenceRecoveryBlocked = pendingImportRecovery.ok === false;
  let profile = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
  let currentDateKey = Engine.localDateKey(new Date());
  let migratedLegacy = false;
  const legacySnapshot = readLegacySnapshot();
  let typeStates = Object.fromEntries(TYPES.map((type) => [type, loadTypeState(type, currentDateKey)]));
  let knownState;
  let dailyState;
  let pendingUndo = null;
  let toastTimer = null;
  let swapLocked = Object.fromEntries(TYPES.map((type) => [type, false]));
  let initializationReady = false;
  let activeWeatherToken = 0;
  let speechController = null;
  let reminderController = null;
  let peerImportPending = false;
  let peerJournalOperation = null;
  let localImportIntent = false;
  let peerSnapshotNeedsReload = false;
  let persistenceReloadScheduled = false;
  let peerSynchronizationScheduled = false;
  let visibleKnownRecords = RECORD_PAGE_SIZE;
  let visibleFavoriteRecords = RECORD_PAGE_SIZE;
  let preferenceFailuresReported = 0;
  let pendingNarrationCachePath = null;
  let cachedNarrationPath = null;
  let appearanceState = Appearance?.initialize?.() || Appearance?.getState?.() || null;
  let exploreIndex = null;
  let explorePage = 1;
  let exploreInputTimer = null;
  let exploreObserver = null;
  let exploreRequestToken = 0;
  let pendingBackupImport = null;
  const preferencePersistence = createPreferencePersistence(settlePreferenceBatch);
  globalThis.DailyAtlasPreferencePersistence = Object.freeze({
    whenIdle: preferencePersistence.whenIdle,
    status: preferencePersistence.status
  });

  rebuildViews();
  if (!storage.available) elements.storageWarning.hidden = false;
  initialize();

  async function initializePersistenceRecovery() {
    if (!Lock || typeof Lock.bootstrapRecovery !== "function" || typeof Backup.recoverPending !== "function") {
      globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE = false;
      return typeof Backup.memoryOnlyRecovery === "function"
        ? Backup.memoryOnlyRecovery(new Error("Safe cross-tab persistence coordination did not load"))
        : { ok: true, status: "storage-unavailable-memory-only", dataRestored: false, journalCleared: false, persistenceAvailable: false };
    }
    const recover = (sharedStorage) => {
      const recovery = Backup.recoverPending(sharedStorage);
      return recovery.status === "journal-read-failed"
        ? Backup.memoryOnlyRecovery(recovery.error)
        : recovery;
    };
    try {
      return await Lock.bootstrapRecovery(recover);
    } catch (error) {
      return globalThis.DAILY_ATLAS_IMPORT_RECOVERY || {
        ok: false,
        status: "recovery-threw",
        dataRestored: false,
        journalCleared: false,
        error
      };
    }
  }

  function initialize() {
    renderDate();
    renderTheme();
    renderAllCards();
    renderRecordCount();
    elements.snapshotNote.textContent = `目录更新 ${Catalog.snapshotDate || "当前"}；公开评分快照仅指图书，评分日期见各条图书卡片`;
    initializeSettings();
    initializeExplore();
    bindEvents();
    if (globalThis.DAILY_ATLAS_SNAPSHOT_MIRROR?.ok === false) {
      handleCanonicalChange({ detail: { mirrorOk: false } });
    }
    initializePlatformFeatures();
    if (!storage.available || pendingImportRecovery.status === "storage-unavailable-memory-only") {
      enterMemoryOnlyMode();
    } else if (pendingImportRecovery.status === "rolled-back") {
      elements.backupStatus.textContent = "检测到上次未完成的导入，已恢复到导入前的数据。";
    } else if (pendingImportRecovery.status === "committed") {
      elements.backupStatus.textContent = "检测到上次未完成的导入，已补齐全部数据并确认完成。";
    } else if (persistenceRecoveryBlocked) {
      elements.backupStatus.textContent = "检测到未完成导入，但当前存储仍不可写；请暂勿继续修改并重启浏览器后重试。";
      elements.storageWarning.hidden = false;
      disablePersistentActions();
    }
    if (persistenceRecoveryBlocked) {
      disablePersistentActions();
      makeShellInteractive();
      monitorCurrentDetailHydration();
      window.setInterval(checkForNewDay, 60000);
      return;
    }
    void saveAllTypeStates()
      .catch(() => {
        elements.storageWarning.hidden = false;
      })
      .finally(() => {
        makeShellInteractive();
        monitorCurrentDetailHydration();
      });
    window.setInterval(checkForNewDay, 60000);
  }

  function makeShellInteractive() {
    if (initializationReady) return;
    initializationReady = true;
    renderAllCards();
    renderRecordCount();
    signalAppReady();
  }

  function monitorCurrentDetailHydration() {
    void hydrateCurrentDetails().finally(() => {
      const failed = TYPES.filter((type) => detailFailures.has(itemKey(type, typeStates[type]?.currentId))).length;
      window.dispatchEvent(new CustomEvent("dailyatlasdetailssettled", {
        detail: Object.freeze({ failed, total: TYPES.length })
      }));
    });
  }

  function signalAppReady() {
    const failedDetails = TYPES.filter((type) => {
      const id = typeStates[type]?.currentId;
      return id && detailFailures.has(`${type}:${id}`);
    }).length;
    const pendingDetails = TYPES.filter((type) => currentItem(type)?.selectionOnly === true).length;
    window.dispatchEvent(new CustomEvent("dailyatlasappready", {
      detail: Object.freeze({
        version: APP_VERSION,
        safeMode: globalThis.DAILY_ATLAS_SAFE_MODE === true,
        degraded: failedDetails > 0,
        pendingDetails,
        message: globalThis.DAILY_ATLAS_SAFE_MODE === true
          ? "当前只使用同源完整目录，并暂停可选远程媒体；偏好与记录仍保存在本机。"
          : failedDetails > 0
            ? `今日选择已生成，但有 ${failedDetails} 张卡片的详情尚未载入；可在卡片内重试。`
          : pendingDetails > 0
            ? `今日五项已经可以使用；${pendingDetails} 张卡片的完整介绍正在后台补齐。`
            : "今日五项已就绪。"
      })
    }));
  }

  function createStorage() {
    const memory = new Map();
    let available = globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE !== false;
    if (available && globalThis.DAILY_ATLAS_IMPORT_RECOVERY?.ok !== false) {
      try {
        const key = "__daily_atlas_storage_test__";
        window.localStorage.setItem(key, "1");
        window.localStorage.removeItem(key);
      } catch (_error) {
        available = false;
      }
    }

    return {
      get available() { return available; },
      disablePersistence() {
        available = false;
        globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE = false;
      },
      get(key) {
        if (!available) return memory.get(key) || null;
        try {
          const value = activePersistenceStorage
            ? activePersistenceStorage.getItem(key)
            : window.localStorage.getItem(key);
          if (value == null) memory.delete(key);
          else memory.set(key, value);
          return value;
        } catch (_error) {
          available = false;
          globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE = false;
          elements.storageWarning.hidden = false;
          window.queueMicrotask(enterMemoryOnlyMode);
          return memory.get(key) || null;
        }
      },
      remember(key, value) {
        if (value == null) memory.delete(key);
        else memory.set(key, value);
      },
      set(key, value) {
        if (!available) {
          memory.set(key, value);
          return;
        }
        if (activePersistenceStorage) {
          activePersistenceStorage.setItem(key, value);
          if (activePersistenceStorage.getItem(key) !== value) throw new Error(`Transactional write verification failed for ${key}`);
          memory.set(key, value);
          return;
        }
        throw new Error(`Persistent write outside the canonical transaction for ${key}`);
      },
      remove(key) {
        if (!available) {
          memory.delete(key);
          return;
        }
        if (activePersistenceStorage) {
          activePersistenceStorage.removeItem(key);
          if (activePersistenceStorage.getItem(key) !== null) throw new Error(`Transactional remove verification failed for ${key}`);
          memory.delete(key);
          return;
        }
        throw new Error(`Persistent remove outside the canonical transaction for ${key}`);
      }
    };
  }

  function enterMemoryOnlyMode() {
    globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE = false;
    storage.disablePersistence();
    elements.storageWarning.hidden = false;
    elements.storageWarning.textContent = "浏览器阻止了本地存储：本次会话仍可使用，但刷新或关闭页面后，今日内容、记录与设置不会保留。";
    elements.backupStatus.textContent = "当前为临时内存模式；导入与导出已停用，其他功能仅在本次会话有效。";
    elements.exportBackupButton.disabled = true;
    elements.importBackupButton.disabled = true;
    elements.importBackupFile.disabled = true;
  }

  function writeAtomicEntries(entries, operation) {
    if (!storage.available) {
      for (const entry of entries) {
        if (entry.value === null) storage.remove(entry.key);
        else storage.set(entry.key, entry.value);
      }
      return entries.length;
    }
    if (!activePersistenceStorage) throw new Error("Atomic writes require the canonical transaction storage");
    const count = Backup.applyEntriesAtomically(activePersistenceStorage, entries, { operation });
    for (const entry of entries) storage.remember(entry.key, entry.value);
    return count;
  }

  function recoverLocalModel(types, error) {
    if (error?.name === "BackupApplyError" && error.recoveryComplete === false) {
      handlePersistenceBlocked({ detail: error.recovery });
      return false;
    }
    if (error?.name === "SnapshotStorageError") {
      storage.disablePersistence();
      enterMemoryOnlyMode();
    }
    try {
      profile = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
      for (const type of [...new Set(types || TYPES)]) {
        typeStates[type] = loadTypeState(type, currentDateKey);
      }
      rebuildViews();
      return true;
    } catch (_recoveryError) {
      elements.storageWarning.hidden = false;
      return false;
    }
  }

  function disablePersistentActions() {
    for (const card of TYPES.map((type) => elements[TYPE_META[type].card])) {
      for (const control of card.querySelectorAll("button[data-action]")) control.disabled = true;
    }
    for (const control of [
      elements.resetRecordButton,
      elements.personalizationEnabled,
      elements.themeLinkingEnabled,
      elements.resetPreferencesButton,
      elements.backgroundColor,
      elements.backgroundStyle,
      elements.compactModeEnabled,
      elements.dataSaverEnabled,
      elements.textSize,
      elements.contrastMode,
      elements.motionMode,
      elements.musicTrackSettings,
      elements.exportBackupButton,
      elements.encryptBackupEnabled,
      elements.exportBackupPassword,
      elements.exportBackupPasswordConfirm,
      elements.importBackupButton,
      elements.importBackupFile,
      elements.applyBackupButton,
      elements.speechVoiceSelect,
      document.querySelector("#musicToggle"),
      document.querySelector("#musicPrevious"),
      document.querySelector("#musicNext"),
      document.querySelector("#musicVolume"),
      document.querySelector("#musicTrack"),
      elements.reminderTime,
      elements.enableReminderButton,
      elements.disableReminderButton
    ]) {
      if (control) control.disabled = true;
    }
  }

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function emptyTypeObject(factory) {
    return Object.fromEntries(TYPES.map((type) => [type, factory(type)]));
  }

  function stateKey(type) {
    return `${STORAGE_KEYS.statePrefix}${type}`;
  }

  function readLegacySnapshot() {
    const knownV2 = safeParse(storage.get(STORAGE_KEYS.legacyKnownV2), null);
    const knownV1 = safeParse(storage.get(STORAGE_KEYS.legacySeen), null);
    const knownRaw = State.validKnownV2(knownV2, TYPES)
      ? knownV2
      : State.validLegacyKnown(knownV1) ? knownV1 : {};
    const knownByType = emptyTypeObject((type) => {
      const validIds = new Set(collections[type].map((item) => item.id));
      return Engine.uniqueValidIds(knownRaw[type], validIds);
    });
    const normalizedOrder = State.normalizeLegacyOrder(knownByType, knownRaw.order, TYPES);
    const knownEntries = emptyTypeObject((type) => State.entriesFromLegacy(type, knownByType[type], normalizedOrder));

    const dailyV2 = safeParse(storage.get(STORAGE_KEYS.legacyDailyV2), null);
    const dailyV1 = safeParse(storage.get(STORAGE_KEYS.legacyDaily), null);
    const dailyRaw = State.validDailyV2(dailyV2, TYPES)
      ? dailyV2
      : State.validLegacyDaily(dailyV1) ? dailyV1 : null;

    if (Object.values(knownByType).some((ids) => ids.length) || dailyRaw) migratedLegacy = true;
    return { knownEntries, dailyRaw };
  }

  function loadTypeState(type, dateKey, options) {
    const validIds = new Set(collections[type].map((item) => item.id));
    const parsed = safeParse(storage.get(stateKey(type)), null);
    const hasV3 = State.validTypeState(parsed, type);
    const knownEntries = State.normalizeKnownEntries(
      hasV3 ? parsed.knownEntries : legacySnapshot.knownEntries[type],
      validIds
    );
    const sameDate = hasV3 && parsed.date === dateKey;
    const legacyDaily = !hasV3 && legacySnapshot.dailyRaw && legacySnapshot.dailyRaw.date === dateKey
      ? legacySnapshot.dailyRaw
      : null;
    const baseRevision = State.safeSequence(hasV3 ? parsed.revision : 0);
    const baseVersion = State.safeVersion(hasV3 ? (parsed.version ?? parsed.revision) : 0);
    const record = {
      schemaVersion: 3,
      type,
      date: dateKey,
      revision: hasV3 && !sameDate ? nextSafeCounter(baseRevision) : baseRevision,
      version: hasV3 && !sameDate ? State.incrementVersion(baseVersion) : baseVersion,
      currentId: sameDate
        ? parsed.currentId || null
        : legacyDaily ? ((legacyDaily.current && legacyDaily.current[type]) || legacyDaily[`${type}Id`] || null) : null,
      sequence: sameDate
        ? State.safeSequence(parsed.sequence)
        : legacyDaily ? State.safeSequence(legacyDaily.sequence && legacyDaily.sequence[type]) : 0,
      skipped: sameDate
        ? parsed.skipped
        : legacyDaily && Array.isArray(legacyDaily.skipped && legacyDaily.skipped[type]) ? legacyDaily.skipped[type] : [],
      knownEntries
    };
    return repairTypeState(record, options);
  }

  function repairTypeState(record, options) {
    const type = record.type;
    const sourceProfile = options?.profile || profile;
    const validIds = new Set(collections[type].map((item) => item.id));
    record.knownEntries = State.normalizeKnownEntries(record.knownEntries, validIds);
    record.skipped = Engine.uniqueValidIds(record.skipped, validIds);
    record.sequence = State.safeSequence(record.sequence);
    record.revision = State.safeSequence(record.revision);
    record.version = State.safeVersion(record.version ?? record.revision);
    const knownIds = record.knownEntries.map((entry) => entry.id);
    const unsuitableIds = Profile.unsuitableIds(sourceProfile, type);
    const keepCurrentUnsuitable = options?.allowCurrentUnsuitableId === record.currentId;
    if (record.currentId && (!validIds.has(record.currentId) || knownIds.includes(record.currentId) || record.skipped.includes(record.currentId) || (!keepCurrentUnsuitable && unsuitableIds.includes(record.currentId)))) {
      record.currentId = null;
    }
    if (!record.currentId) {
      const pick = Engine.chooseInitial(collections[type], {
        dateKey: record.date,
        type,
        sequence: record.sequence,
        excludedIds: [...knownIds, ...record.skipped, ...unsuitableIds],
        ...selectionOptions(type, record.date, sourceProfile)
      });
      record.currentId = pick ? pick.id : null;
    }
    return record;
  }

  function selectionOptions(type, dateKey, sourceProfile) {
    const preferences = sourceProfile || profile;
    const exploration = Math.abs(Engine.daySerial(dateKey)) % 4 === 3;
    return {
      themeId: preferences.themeLinking ? Engine.dailyTheme(dateKey).id : null,
      exploration,
      scoreItem: preferences.enabled && !exploration
        ? (item) => Profile.scoreItem(item, type, preferences, collections[type])
        : null
    };
  }

  function rebuildViews() {
    knownState = emptyTypeObject((type) => typeStates[type].knownEntries.map((entry) => entry.id));
    knownState.order = TYPES.flatMap((type) => typeStates[type].knownEntries.map((entry) => ({
      type,
      id: entry.id,
      at: entry.at
    }))).sort((left, right) => left.at.localeCompare(right.at) || `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`));
    dailyState = {
      schemaVersion: 3,
      date: currentDateKey,
      current: emptyTypeObject((type) => typeStates[type].currentId),
      sequence: emptyTypeObject((type) => typeStates[type].sequence),
      skipped: emptyTypeObject((type) => typeStates[type].skipped.slice())
    };
  }

  function writeTypeStateLocked(type, record, options) {
    if (persistenceRecoveryBlocked) return false;
    if (record.date !== currentDateKey) return false;
    const repaired = repairTypeState(record, options);
    storage.set(stateKey(type), JSON.stringify(repaired));
    typeStates[type] = repaired;
    rebuildViews();
    return true;
  }

  async function saveAllTypeStates() {
    if (persistenceRecoveryBlocked) return;
    await withPersistenceTransaction(() => {
      // A peer may have changed feedback while this page was loading. State
      // repair consults the profile (notably unsuitable IDs), so refresh the
      // profile under the same global lock before repairing or persisting any
      // state. Otherwise a stale unsuitable flag can overwrite a just-undone
      // current item during startup.
      profile = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
      for (const type of TYPES) {
        const latest = loadTypeState(type, currentDateKey);
        invalidatePendingUndo(type, latest);
        storage.set(stateKey(type), JSON.stringify(latest));
        typeStates[type] = latest;
      }
      if (migratedLegacy) {
        storage.remove(STORAGE_KEYS.legacyKnownV2);
        storage.remove(STORAGE_KEYS.legacyDailyV2);
        storage.remove(STORAGE_KEYS.legacySeen);
        storage.remove(STORAGE_KEYS.legacyDaily);
      }
    });
    rebuildViews();
  }

  function withPersistenceTransaction(task) {
    if (persistenceRecoveryBlocked) {
      return Promise.reject(new Error("Persistent writes are paused until import recovery completes"));
    }
    if (!storage.available) return Promise.resolve().then(() => task(Object.freeze({ backend: "memory-only", storage: null })));
    if (Lock && typeof Lock.transaction === "function") {
      return Lock.transaction((lease) => {
        if (!lease?.storage) throw new Error("Canonical transaction storage is unavailable");
        const previous = activePersistenceStorage;
        activePersistenceStorage = lease.storage;
        try { return task(lease); }
        finally { activePersistenceStorage = previous; }
      });
    }
    // lock.js is part of the application shell. This branch only keeps the
    // non-persistent file-mode boundary usable if that script failed to load.
    return Promise.resolve().then(() => task(Object.freeze({ backend: "memory-only", storage: null })));
  }

  function withPersistenceRead(task) {
    if (!storage.available) return Promise.resolve().then(() => task(Object.freeze({ backend: "memory-only", storage: null })));
    if (Lock && typeof Lock.readStorage === "function") {
      return Lock.readStorage((sharedStorage, lease) => {
        const previous = activePersistenceStorage;
        activePersistenceStorage = sharedStorage;
        try { return task(Object.freeze({ ...(lease || {}), storage: sharedStorage })); }
        finally { activePersistenceStorage = previous; }
      });
    }
    return Promise.resolve().then(() => task(Object.freeze({ backend: "memory-only", storage: null })));
  }

  function reloadWhenPersistenceIdle(delayMs) {
    if (localImportIntent) {
      peerSnapshotNeedsReload = true;
      return;
    }
    if (persistenceReloadScheduled) return;
    persistenceReloadScheduled = true;
    const idle = Lock && typeof Lock.whenIdle === "function" ? Lock.whenIdle() : Promise.resolve();
    void idle.then(() => new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(delayMs) || 0))))
      .then(() => {
        persistenceReloadScheduled = false;
        if (localImportIntent) {
          peerSnapshotNeedsReload = true;
          return;
        }
        if (Lock && typeof Lock.status === "function" && Lock.status().pending > 0) {
          reloadWhenPersistenceIdle(delayMs);
          return;
        }
        window.location.reload();
      })
      .catch(() => {
        persistenceReloadScheduled = false;
        elements.storageWarning.hidden = false;
      });
  }

  function synchronizePeerTransaction() {
    return withPersistenceRead(() => {
      ensureCurrentDay(new Date());
      profile = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
      for (const type of TYPES) {
        const latest = loadTypeState(type, currentDateKey);
        invalidatePendingUndo(type, latest);
        typeStates[type] = latest;
      }
      rebuildViews();
    }).then(() => {
      renderTheme();
      renderAllCards();
      renderRecordCount();
      if (elements.recordDialog.open) renderRecordDialog();
      if (elements.settingsDialog.open && preferencePersistence.status().pending === 0) renderSettings();
      elements.liveRegion.textContent = "已同步另一个标签页完成的本地数据事务。";
    }).catch(() => {
      elements.storageWarning.hidden = false;
      elements.liveRegion.textContent = "另一标签页的数据事务已结束，但本页同步失败；请重新载入页面。";
    });
  }

  function schedulePeerSynchronization() {
    if (peerSynchronizationScheduled || persistenceRecoveryBlocked || !storage.available) return;
    peerSynchronizationScheduled = true;
    window.queueMicrotask(() => {
      peerSynchronizationScheduled = false;
      void synchronizePeerTransaction();
    });
  }

  function handleCanonicalChange(event) {
    const detail = event?.detail;
    if (!detail || detail.mirrorOk !== false) return;
    elements.storageWarning.dataset.canonicalMirror = "failed";
    elements.storageWarning.hidden = false;
    elements.storageWarning.textContent = "数据已安全保存到浏览器数据库，但兼容存储镜像暂未更新；本页仍可继续使用，恢复站点存储权限后重新打开页面即可修复。";
    elements.backupStatus.textContent = "本次修改已经保存；浏览器兼容镜像暂时不可用，其他已打开标签页可能要在重新聚焦或刷新后才会同步。";
  }

  function handlePageResume() {
    checkForNewDay();
    schedulePeerSynchronization();
  }

  function ensureCurrentDay(now) {
    const nextDateKey = Engine.localDateKey(now instanceof Date ? now : new Date());
    if (nextDateKey === currentDateKey) return false;
    currentDateKey = nextDateKey;
    for (const type of TYPES) {
      typeStates[type] = loadTypeState(type, currentDateKey);
    }
    rebuildViews();
    pendingUndo = null;
    hideToast();
    renderDate();
    renderTheme();
    renderAllCards();
    renderRecordCount();
    if (elements.recordDialog.open) renderRecordDialog();
    return true;
  }

  function currentItem(type) {
    const id = typeStates[type].currentId;
    if (!id) return null;
    return allItems.get(`${type}:${id}`) || collections[type].find((item) => item.id === id) || null;
  }

  function itemKey(type, id) {
    return `${type}:${id}`;
  }

  async function hydrateDetails(references) {
    const refs = (Array.isArray(references) ? references : [])
      .filter((reference) => reference && TYPES.includes(reference.type) && typeof reference.id === "string");
    if (!CatalogStore?.loadDetails || !refs.length) return refs.map((reference) => allItems.get(itemKey(reference.type, reference.id)) || null);
    const unique = [...new Map(refs.map((reference) => [itemKey(reference.type, reference.id), reference])).entries()];
    await Promise.all(unique.map(async ([key, reference]) => {
      const existing = allItems.get(key);
      if (existing && existing.selectionOnly !== true) return existing;
      if (detailPromises.has(key)) return detailPromises.get(key);
      const promise = CatalogStore.loadDetails([reference]).then((items) => {
        const item = items?.[0];
        if (!item || item.type !== reference.type || item.id !== reference.id) throw new Error("detail identity mismatch");
        allItems.set(key, item);
        detailFailures.delete(key);
        return item;
      }).catch((error) => {
        const code = RuntimeHealth?.detailErrorCode?.(error) || "DETAIL_LOAD_FAILED";
        detailFailures.set(key, code);
        RuntimeHealth?.record?.("details", code);
        throw error;
      }).finally(() => detailPromises.delete(key));
      detailPromises.set(key, promise);
      return promise;
    }));
    return refs.map((reference) => allItems.get(itemKey(reference.type, reference.id)) || null);
  }

  async function hydrateCurrentDetails() {
    const references = TYPES
      .map((type) => ({ type, id: typeStates[type]?.currentId }))
      .filter((reference) => reference.id);
    const settled = await Promise.allSettled(references.map((reference) => hydrateDetails([reference])));
    return settled.filter((entry) => entry.status === "fulfilled").length;
  }

  function renderDate() {
    const now = new Date();
    const monthNames = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
    const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "long" }).format(now);
    elements.dateDay.textContent = String(now.getDate()).padStart(2, "0");
    elements.dateMonth.textContent = monthNames[now.getMonth()];
    elements.dateYearWeek.textContent = `${now.getFullYear()} · ${weekday}`;
  }

  function renderTheme() {
    const theme = Engine.dailyTheme(currentDateKey);
    elements.themeLabel.textContent = `今日主题 · ${theme.label}`;
    elements.themeSummary.textContent = theme.summary;
    const exploration = Math.abs(Engine.daySerial(currentDateKey)) % 4 === 3;
    elements.themeMode.textContent = !profile.themeLinking
      ? "联动已关闭"
      : exploration ? "广度探索日" : "编辑联动";
  }

  function renderAllCards() {
    for (const type of TYPES) renderCard(type);
    if (persistenceRecoveryBlocked) disablePersistentActions();
  }

  function renderCard(type, shouldFocus) {
    const card = elements[TYPE_META[type].card];
    Visuals?.unbind?.(card);
    if (type === "german") {
      const speechState = speechController?.getState?.();
      if (speechState?.speaking || speechState?.pending) speechController.stop("德语卡片已更新");
    }
    if (type === "city") activeWeatherToken += 1;
    const item = currentItem(type);
    card.classList.remove("is-swapping", "exhausted-card", "catalog-detail-placeholder", "has-detail-preview");
    delete card.dataset.detailState;
    if (!item) {
      renderExhausted(card, type, shouldFocus);
      reflectInitializationState(card);
      return;
    }
    if (item.selectionOnly === true && CatalogStore?.loadDetails) {
      renderDetailPlaceholder(card, type, item, shouldFocus);
      return;
    }

    if (type === "book" || type === "movie") card.innerHTML = renderMediaCard(item, type);
    if (type === "city") card.innerHTML = renderCityCard(item);
    if (type === "german") {
      card.innerHTML = renderGermanCard(item);
      cacheCurrentNarrationForOffline(item);
    }
    if (type === "medical") card.innerHTML = renderMedicalCard(item);

    Visuals?.bind?.(card);
    for (const image of card.querySelectorAll("img:not([data-visual-candidates])")) {
      const hideBroken = () => { image.hidden = true; };
      image.addEventListener("error", hideBroken, { once: true });
      if (image.complete && image.naturalWidth === 0) hideBroken();
    }
    reflectInitializationState(card);
    if (shouldFocus && initializationReady) card.querySelector(".swap-button")?.focus({ preventScroll: true });
  }

  function renderDetailPlaceholder(card, type, item, shouldFocus) {
    const key = itemKey(type, item.id);
    const failed = detailFailures.has(key);
    const visual = resolveVisual(item, type);
    const visualMarkup = ["book", "movie", "city"].includes(type) ? `
      <div class="detail-preview-visual" style="--visual:${safeColor(Array.isArray(item.visual?.palette) ? item.visual.palette[0] : item.visual)}">
        <div class="visual-fallback" aria-hidden="true">${editorialArtHtml(item, type)}<small>${escapeHtml(TYPE_META[type].label)}</small><strong>${escapeHtml(item.title || TYPE_META[type].label)}</strong></div>
        ${visualImageHtml(visual, `${type === "city" ? "city-image" : "cover-image"} detail-preview-image`)}
        ${visualCreditHtml(visual)}
        <span class="visual-topline" aria-hidden="true">${type === "book" ? "READ" : type === "movie" ? "WATCH" : "WORLD CITY"} · 正在补齐详情</span>
      </div>` : "";
    card.classList.add("catalog-detail-placeholder");
    card.classList.toggle("has-detail-preview", Boolean(visualMarkup));
    card.dataset.detailState = failed ? "failed" : "loading";
    card.innerHTML = `
      ${visualMarkup}
      <div class="detail-placeholder-copy">
        <span class="section-kicker">${failed ? "DETAIL RETRY" : "LOADING DETAIL"}</span>
        <h3 tabindex="-1">${escapeHtml(item.title || item.german || TYPE_META[type].label)}</h3>
        <p>${failed ? "这条详情没有在限定时间内载入；仍可换一项或标记为已了解。" : "今日选择已经确定并可操作，完整介绍正在后台按需载入。"}</p>
        ${failed ? `<button class="secondary-button" type="button" data-action="retry-detail" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}">重试这张卡片</button>` : '<span class="detail-loading-mark" aria-hidden="true"></span>'}
        <div class="card-actions detail-placeholder-actions" aria-label="今日选择操作">
          <button class="primary-button swap-button" type="button" data-action="swap" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}"><span>${TYPE_META[type].swap}</span><span class="button-arrow" aria-hidden="true">→</span></button>
          <button class="secondary-button known-button" type="button" data-action="known" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}">${TYPE_META[type].known}</button>
        </div>
      </div>
    `;
    Visuals?.bind?.(card);
    reflectInitializationState(card);
    if (!failed && !detailPromises.has(key)) {
      void hydrateDetails([{ type, id: item.id }]).then(() => {
        if (typeStates[type].currentId === item.id) renderCard(type, shouldFocus);
      }).catch(() => {
        if (typeStates[type].currentId === item.id) renderCard(type, shouldFocus);
      });
    }
    if (failed && shouldFocus) card.querySelector("[data-action='retry-detail']")?.focus({ preventScroll: true });
  }

  function reflectInitializationState(card) {
    card.toggleAttribute("aria-busy", !initializationReady);
    if (!initializationReady || persistenceRecoveryBlocked) {
      for (const control of card.querySelectorAll("button[data-action]")) control.disabled = true;
    }
  }

  function renderMediaCard(item, type) {
    const meta = TYPE_META[type];
    const ordinal = String(collections[type].findIndex((entry) => entry.id === item.id) + 1).padStart(2, "0");
    const total = String(collections[type].length).padStart(2, "0");
    const genres = Engine.itemGenres(item).map((genre) => GENRE_LABELS[genre]).filter(Boolean);
    const tags = (item.tags || []).slice(0, 4).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");
    const creatorLabel = type === "book" ? "作者" : "导演";
    const hasPublicRating = item.rating && Number.isFinite(Number(item.rating.value)) && Number.isFinite(Number(item.rating.max));
    const ratingValue = hasPublicRating ? Number(item.rating.value).toFixed(1) : "精选";
    const ratingCount = hasPublicRating ? Engine.formatCount(item.rating.count) : "";
    const popularity = POPULARITY_LABELS[item.popularityTier] || "编辑精选";
    const yearLabel = displayYearLabel(item);
    const seriesContext = item.series
      ? `<p class="curation-note"><strong>系列位置：</strong>${escapeHtml(item.series)}${item.installment ? ` · ${escapeHtml(seriesInstallmentLabel(item.installment))}` : ""}${item.standaloneFriendly ? " · 可独立进入" : " · 建议按顺序阅读／观看"}${item.prerequisite ? `；${escapeHtml(item.prerequisite)}` : ""}</p>`
      : item.prerequisite
        ? `<p class="curation-note"><strong>进入前提示：</strong>${escapeHtml(item.prerequisite)}</p>`
        : "";
    const contentNotes = Array.isArray(item.contentNotes)
      ? item.contentNotes.filter(Boolean).join("；")
      : String(item.contentNotes || "").trim();
    const mediaVisual = resolveVisual(item, type);
    const mediaImage = visualImageHtml(mediaVisual, "cover-image");
    const mediaCredit = visualCreditHtml(mediaVisual);

    return `
      <div class="card-visual" style="--visual:${safeColor(item.visual)}">
        <div class="visual-fallback" aria-hidden="true">
          ${editorialArtHtml(item, type)}
          <small>${escapeHtml(genres.join(" · "))} · ${escapeHtml(yearLabel)}</small>
          <strong>${escapeHtml(item.title)}</strong>
        </div>
        ${mediaImage}
        ${mediaCredit}
        <span class="visual-topline" aria-hidden="true">${type === "book" ? "READ" : "WATCH"} · ${escapeHtml(genres.join(" / "))}</span>
        <span class="visual-number" aria-hidden="true">${ordinal}<small> / ${total}</small></span>
      </div>
      <div class="card-content">
        <div class="card-overline">
          <span class="genre-chip">今日${meta.label} · ${escapeHtml(item.genreLabel || genres[0] || "精选")}</span>
          <span>${escapeHtml(genres.join(" / "))}</span>
        </div>
        <h3 class="card-title" tabindex="-1">${escapeHtml(item.title)}</h3>
        <p class="original-title" title="${escapeAttribute(item.originalTitle || "")}">${escapeHtml(item.originalTitle || "")}</p>
        <div class="meta-row" aria-label="作品信息">
          <span>${escapeHtml(yearLabel)}</span>
          <span>${creatorLabel} · ${escapeHtml(item.creator)}</span>
          <span>${escapeHtml(item.detail || "")}</span>
        </div>
        <div class="tag-row" aria-label="内容标签">${tags}</div>
        <p class="summary">${escapeHtml(item.summary)}</p>
        <p class="reason"><strong>为什么值得：</strong>${escapeHtml(item.reason)}</p>
        <p class="audience-note"><strong>适合：</strong>${escapeHtml(item.audience || "希望探索优质作品的读者或观众")}</p>
        ${seriesContext}
        ${contentNotes ? `<p class="curation-note content-warning"><strong>内容提示：</strong>${escapeHtml(contentNotes)}</p>` : ""}
        <div class="rating-row">
          <span class="rating-score">${ratingValue}${hasPublicRating ? `<small> / ${item.rating.max}</small>` : ""}</span>
          <span class="rating-detail">
            <a href="${safeLink(item.sourceUrl)}" target="_blank" rel="noreferrer">${hasPublicRating ? `${escapeHtml(item.rating.source)} 评分` : "查看作品资料"}</a>
            <span>${hasPublicRating ? `${ratingCount}人评分 · 快照 ${Engine.formatSnapshot(item.rating.snapshot)}` : "口碑门槛已在构建时核验；公开包不再分发第三方数值"}</span>
          </span>
          <span class="popularity-badge">${escapeHtml(popularity)}</span>
        </div>
        ${renderActions(item, type)}
      </div>
    `;
  }

  function renderCityCard(item) {
    const monogram = String(item.cityEn || item.title || "C").slice(0, 2).toUpperCase();
    const highlights = (item.highlights || []).map((entry) => `<span>${escapeHtml(entry)}</span>`).join("");
    const color = item.visual && Array.isArray(item.visual.palette) ? item.visual.palette[0] : item.visual;
    const cityVisual = resolveVisual(item, "city");
    return `
      <div class="city-inner">
        <div class="city-visual" style="--visual:${safeColor(color)}">
          ${visualImageHtml(cityVisual, "city-image")}
          ${visualCreditHtml(cityVisual)}
          <span class="city-coordinate">WORLD CITY · ${escapeHtml(item.region)}</span>
          <span class="city-monogram" aria-hidden="true">${escapeHtml(monogram)}</span>
          <div class="city-heading">
            <h3 tabindex="-1">${escapeHtml(item.cityZh || item.title)}</h3>
            <p>${escapeHtml(item.cityEn)} · ${escapeHtml(item.countryEn)}</p>
          </div>
        </div>
        <div class="city-copy">
          <div class="card-overline">
            <span class="genre-chip">今日城市</span>
            <span>${escapeHtml(item.countryZh)} · ${escapeHtml(item.region)}</span>
          </div>
          <p class="summary">${escapeHtml(item.summary)}</p>
          <div class="tag-row" aria-label="城市亮点">${highlights}</div>
          <dl class="detail-list">
            <div><dt>适合谁</dt><dd>${escapeHtml(item.bestFor)}</dd></div>
            <div><dt>何时去</dt><dd>${escapeHtml(item.seasonNote)}</dd></div>
            <div><dt>小礼仪</dt><dd>${escapeHtml(item.culturalTip)}</dd></div>
          </dl>
          <div class="city-live-tools">
            <button class="weather-button" type="button" data-action="weather" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}">查看当前天气</button>
            <span class="weather-result" data-weather-for="${escapeAttribute(item.id)}">按需联网 · 显示查询时间</span>
          </div>
          ${renderActions(item, "city")}
        </div>
      </div>
    `;
  }

  function renderGermanCard(item) {
    return `
      <div class="german-inner">
        <div class="german-copy">
          <div class="card-overline">
            <span class="section-kicker">DEUTSCH DES TAGES</span>
            <span class="level-chip">${escapeHtml(item.level)} · ${escapeHtml(item.kind)}</span>
          </div>
          <h3 class="german-phrase" lang="de" tabindex="-1">${escapeHtml(item.german)}</h3>
          <p class="german-translation">${escapeHtml(item.chinese)}</p>
          <p class="german-explanation">${escapeHtml(item.explanation)}</p>
          ${item.pronunciationHint ? `<p class="audience-note">发音提示：${escapeHtml(item.pronunciationHint)}</p>` : ""}
          <p class="german-example">
            <strong lang="de">${escapeHtml(item.exampleGerman)}</strong>
            <span>${escapeHtml(item.exampleChinese)}</span>
          </p>
          <div class="german-example-tools">
            <button class="speech-button" type="button" data-action="speak" data-german-speak data-speech-text="${escapeAttribute(item.exampleGerman)}" data-speech-audio="${escapeAttribute(item.narration?.src || "")}" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}" aria-pressed="false" aria-label="用固定德语女声朗读例句：${escapeAttribute(item.exampleGerman)}">▶ 女声朗读例句</button>
            <span class="speech-status-inline">随包固定合成女声 · 点击后播放</span>
          </div>
          ${renderActions(item, "german")}
        </div>
      </div>
    `;
  }

  function renderMedicalCard(item) {
    return `
      <div class="medical-inner">
        <div class="medical-visual">
          <img src="${safeImageUrl(item.image)}" alt="${escapeAttribute(item.alt)}" loading="lazy" decoding="async" />
          <span class="medical-topic">今日医学 · ${escapeHtml(item.topic)}</span>
        </div>
        <div class="medical-copy">
          <h3 class="medical-title" tabindex="-1">${escapeHtml(item.title)}</h3>
          <p class="summary">${escapeHtml(item.summary)}</p>
          <section class="action-box"><h4>今天可以怎么做</h4><p>${escapeHtml(item.action)}</p></section>
          <section class="warning-box"><h4>边界与警示</h4><p>${escapeHtml(item.limitsOrRedFlags)}</p></section>
          <footer class="source-note">来源：<a href="${safeLink(item.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(item.sourceName)}</a> · 一般科普，不代替诊断</footer>
          ${renderActions(item, "medical")}
        </div>
      </div>
    `;
  }

  function renderActions(item, type) {
    const meta = TYPE_META[type];
    const title = itemTitle(item);
    const feedback = Profile.feedbackFor(profile, type, item.id);
    const theme = Engine.dailyTheme(currentDateKey);
    const themeText = profile.themeLinking && Engine.itemThemes(item).includes(theme.id) ? "呼应今日主题" : "主题外延推荐";
    const sourceLabel = type === "german"
      ? `查看《${title}》原创例句的语言参考资源`
      : `查看《${title}》的资料来源`;
    return `
      <div class="card-actions">
        <button class="primary-button swap-button" type="button" data-action="swap" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}" aria-label="更换当前${meta.label}《${escapeAttribute(title)}》，只在今天跳过">
          <span>${meta.swap}</span><span class="button-arrow" aria-hidden="true">→</span>
        </button>
        <button class="secondary-button known-button" type="button" data-action="known" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}" aria-label="将《${escapeAttribute(title)}》标记为${meta.known}并更换">
          ${meta.known}
        </button>
        <a class="source-button" href="${safeLink(item.sourceUrl)}" target="_blank" rel="noreferrer" aria-label="${escapeAttribute(sourceLabel)}">
          ${externalLinkIcon()}
        </a>
      </div>
      <div class="feedback-actions" aria-label="对《${escapeAttribute(title)}》的个性化反馈">
        <button class="feedback-button" type="button" data-action="liked" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}" aria-pressed="${feedback.liked}">${feedback.liked ? "♥ 已喜欢" : "♡ 喜欢"}</button>
        <button class="feedback-button" type="button" data-action="favorite" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}" aria-pressed="${feedback.favorite}">${feedback.favorite ? "★ 已收藏" : "☆ 收藏"}</button>
        <button class="feedback-button unsuitable-button" type="button" data-action="unsuitable" data-item-id="${escapeAttribute(item.id)}" data-date="${escapeAttribute(currentDateKey)}" aria-pressed="${feedback.unsuitable}">⊘ 不适合我</button>
        <span class="theme-mode">${escapeHtml(themeText)}</span>
      </div>
    `;
  }

  function renderExhausted(card, type, shouldFocus) {
    const meta = TYPE_META[type];
    const state = typeStates[type];
    const known = new Set(state.knownEntries.map((entry) => entry.id));
    const unsuitable = new Set(Profile.unsuitableIds(profile, type));
    const permanentlyExcluded = new Set([...known, ...unsuitable]);
    const availableTomorrow = collections[type].some((item) => !permanentlyExcluded.has(item.id));
    const explanation = availableTomorrow
      ? "今天可用的候选已经全部跳过；仅今天跳过的内容会在明天恢复。你也可以现在管理长期记录。"
      : "全部候选都已被长期记录或标记为不适合；明天不会自动恢复。请管理长期记录或重置偏好后再探索。";
    card.classList.add("exhausted-card");
    card.innerHTML = `
      <div>
        <span class="exhausted-mark" aria-hidden="true">完</span>
        <h3>这份${meta.label}清单暂时看完了</h3>
        <p>${escapeHtml(explanation)}</p>
        <button class="primary-button compact-button" type="button" data-action="manage">管理探索记录</button>
      </div>
    `;
    if (shouldFocus) card.querySelector("[data-action='manage']")?.focus({ preventScroll: true });
  }

  function bindEvents() {
    for (const type of TYPES) {
      elements[TYPE_META[type].card].addEventListener("click", (event) => handleCardClick(event, type));
    }
    elements.recordButton.addEventListener("click", openRecordDialog);
    elements.closeRecordButton.addEventListener("click", () => closeDialog(elements.recordDialog));
    elements.doneRecordButton.addEventListener("click", () => closeDialog(elements.recordDialog));
    elements.resetRecordButton.addEventListener("click", resetKnownRecords);
    elements.recordList.addEventListener("click", handleRecordListClick);
    elements.dataNoteButton.addEventListener("click", () => openDialog(elements.dataDialog));
    elements.closeDataButton.addEventListener("click", () => closeDialog(elements.dataDialog));
    elements.doneDataButton.addEventListener("click", () => closeDialog(elements.dataDialog));
    elements.settingsButton.addEventListener("click", openSettingsDialog);
    elements.closeSettingsButton.addEventListener("click", () => closeDialog(elements.settingsDialog));
    elements.doneSettingsButton.addEventListener("click", () => closeDialog(elements.settingsDialog));
    elements.personalizationEnabled.addEventListener("change", handlePreferenceChange);
    elements.themeLinkingEnabled.addEventListener("change", handlePreferenceChange);
    for (const input of elements.settingsDialog.querySelectorAll("[data-pref-type][data-pref-field], [data-pref-both]")) {
      input.addEventListener("change", handlePreferenceChange);
    }
    elements.resetPreferencesButton.addEventListener("click", resetPreferences);
    for (const control of [elements.backgroundColor, elements.backgroundStyle, elements.compactModeEnabled, elements.dataSaverEnabled, elements.textSize, elements.contrastMode, elements.motionMode]) {
      control.addEventListener("change", handleAppearanceChange);
    }
    elements.exploreForm.addEventListener("submit", (event) => { event.preventDefault(); renderExploreResults(1, true); });
    elements.exploreForm.addEventListener("reset", () => window.setTimeout(() => renderExploreResults(1, true), 0));
    elements.exploreQuery.addEventListener("input", scheduleExploreRender);
    for (const control of [elements.exploreType, elements.exploreGenre, elements.exploreEra, elements.exploreRegion, elements.exploreRating, elements.exploreGermanLevel, elements.exploreMedicalTopic, elements.exploreSort]) {
      control.addEventListener("change", () => renderExploreResults(1, true));
    }
    elements.explorePrevious.addEventListener("click", () => renderExploreResults(explorePage - 1, true));
    elements.exploreNext.addEventListener("click", () => renderExploreResults(explorePage + 1, true));
    elements.quickNav.addEventListener("click", handleQuickJump);
    elements.musicTrackSettings.addEventListener("change", () => {
      if (Music?.setTrack) Music.setTrack(elements.musicTrackSettings.value);
    });
    elements.exportBackupButton.addEventListener("click", exportBackup);
    elements.encryptBackupEnabled.addEventListener("change", renderBackupEncryptionFields);
    elements.importBackupButton.addEventListener("click", () => {
      localImportIntent = true;
      elements.importBackupFile.click();
    });
    elements.importBackupFile.addEventListener("cancel", finishImportWithoutReload);
    elements.importBackupFile.addEventListener("change", importBackup);
    elements.closeBackupPreviewButton.addEventListener("click", cancelPendingBackupImport);
    elements.cancelBackupPreviewButton.addEventListener("click", cancelPendingBackupImport);
    elements.unlockBackupButton.addEventListener("click", unlockPendingBackupImport);
    elements.importBackupPassword.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        unlockPendingBackupImport();
      }
    });
    elements.backupMergeMode.addEventListener("change", renderPendingBackupPreview);
    elements.backupReplaceMode.addEventListener("change", renderPendingBackupPreview);
    elements.applyBackupButton.addEventListener("click", applyPendingBackupImport);
    elements.enableReminderButton.addEventListener("click", enableReminder);
    elements.disableReminderButton.addEventListener("click", disableReminder);
    elements.calendarReminderButton.addEventListener("click", exportCalendarReminder);
    elements.installAppButton.addEventListener("click", installPWA);
    elements.updateAppButton.addEventListener("click", applyPwaUpdate);
    elements.offlineLightMode.addEventListener("change", changeOfflineMode);
    elements.offlineFullMode.addEventListener("change", changeOfflineMode);
    elements.pauseOfflineButton.addEventListener("click", pauseOfflineDownload);
    elements.resumeOfflineButton.addEventListener("click", resumeOfflineDownload);
    elements.cancelOfflineButton.addEventListener("click", cancelOfflineDownload);
    elements.checkStorageButton.addEventListener("click", refreshStoragePreflight);
    elements.persistStorageButton.addEventListener("click", requestPersistentStorage);
    elements.repairCacheButton.addEventListener("click", repairApplicationCaches);
    elements.undoButton.addEventListener("click", undoLastChange);
    elements.toastCloseButton.addEventListener("click", dismissToast);
    window.addEventListener("storage", handleStorageEvent);
    window.addEventListener("dailyatlascanonicalchange", handleCanonicalChange);
    window.addEventListener("dailyatlasstorageblocked", handlePersistenceBlocked);
    window.addEventListener("dailyatlasstorageunavailable", handleStorageUnavailable);
    window.addEventListener("focus", handlePageResume);
    window.addEventListener("pageshow", handlePageResume);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) handlePageResume();
    });
    window.addEventListener("dailyatlasmusicstate", (event) => {
      renderMusicSettingsState(event.detail);
      elements.liveRegion.textContent = `背景轻音乐${event.detail.playing ? "已开启" : "已暂停"}。`;
    });

    for (const dialog of [elements.recordDialog, elements.dataDialog, elements.settingsDialog, elements.backupPreviewDialog]) {
      dialog.addEventListener("click", (event) => {
        if (event.target !== dialog) return;
        if (dialog === elements.backupPreviewDialog) cancelPendingBackupImport();
        else closeDialog(dialog);
      });
      dialog.addEventListener("keydown", trapDialogFocus);
    }
    elements.backupPreviewDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      cancelPendingBackupImport();
    });
  }

  function handlePersistenceBlocked(event) {
    persistenceRecoveryBlocked = true;
    globalThis.DAILY_ATLAS_IMPORT_RECOVERY = event?.detail || globalThis.DAILY_ATLAS_IMPORT_RECOVERY || {
      ok: false,
      status: "pending-import",
      dataRestored: false,
      journalCleared: false
    };
    elements.storageWarning.hidden = false;
    elements.backupStatus.textContent = "检测到尚未完成的本地数据事务；已暂停本页持久修改，请重新载入页面以继续自动恢复。";
    pendingUndo = null;
    hideToast();
    disablePersistentActions();
  }

  function handleStorageUnavailable(event) {
    if (persistenceRecoveryBlocked || globalThis.DAILY_ATLAS_PENDING_JOURNAL_KNOWN === true) return;
    globalThis.DAILY_ATLAS_IMPORT_RECOVERY = event?.detail || {
      ok: true,
      status: "storage-unavailable-memory-only",
      dataRestored: false,
      journalCleared: false,
      persistenceAvailable: false
    };
    enterMemoryOnlyMode();
  }

  function handleStorageEvent(event) {
    if (event.key === Backup.PENDING_KEY) {
      if (event.newValue !== null) {
        // The peer still owns the global transaction lock, so local writes
        // cannot enter. Keep already-started intents queued; if the peer
        // crashes and leaves this journal behind, the coordinator rejects the
        // first waiter and promotes the page to the hard blocked state.
        globalThis.DAILY_ATLAS_PENDING_JOURNAL_KNOWN = true;
        peerImportPending = true;
        const journal = safeParse(event.newValue, null);
        peerJournalOperation = typeof journal?.operation === "string" ? journal.operation : null;
        elements.backupStatus.textContent = "另一标签页正在更新本地数据；本页修改会等待该事务完成。";
      } else if (peerImportPending) {
        // Business-key events were deliberately ignored while the peer held
        // the transaction. Let already-queued work enter the same global lock
        // after the peer commits, then reload from one complete snapshot.
        const completedOperation = peerJournalOperation;
        peerJournalOperation = null;
        globalThis.DAILY_ATLAS_IMPORT_RECOVERY = {
          ok: true,
          status: completedOperation === "import" ? "peer-import-committed" : "peer-transaction-committed",
          dataRestored: true,
          journalCleared: true
        };
        globalThis.DAILY_ATLAS_PENDING_JOURNAL_KNOWN = false;
        peerImportPending = false;
        if (localImportIntent) {
          peerSnapshotNeedsReload = true;
          return;
        }
        // This branch remains for an older already-open tab that still exposes
        // its journal through localStorage. Current releases commit one complete
        // IndexedDB snapshot and only use mirror events as refresh hints.
        if (completedOperation === "import" || !completedOperation) reloadWhenPersistenceIdle();
        else schedulePeerSynchronization();
      }
      return;
    }
    if (persistenceRecoveryBlocked || peerImportPending) return;
    if (!event.key || !CANONICAL_STORAGE_KEYS.has(event.key)) return;
    // localStorage is only a post-commit compatibility mirror. Its events can
    // be delayed or coalesced across renderer processes, so never merge their
    // payloads directly. One canonical read supplies profile and all five state
    // records from the same committed IndexedDB snapshot.
    schedulePeerSynchronization();
  }

  function handleCardClick(event, type) {
    const action = event.target.closest("[data-action]");
    if (!action) return;
    const intent = {
      id: action.dataset.itemId || null,
      date: action.dataset.date || currentDateKey
    };
    if (action.dataset.action === "swap") replaceCurrent(type, false, intent);
    if (action.dataset.action === "known") replaceCurrent(type, true, intent);
    if (action.dataset.action === "liked") handleFeedback(type, intent, "liked");
    if (action.dataset.action === "favorite") handleFeedback(type, intent, "favorite");
    if (action.dataset.action === "unsuitable") handleUnsuitable(type, intent);
    if (action.dataset.action === "weather") handleWeather(type, intent, action);
    if (action.dataset.action === "manage") openRecordDialog();
    if (action.dataset.action === "retry-detail") retryCardDetail(type, intent);
  }

  async function retryCardDetail(type, intent) {
    if (!intent?.id || typeStates[type].currentId !== intent.id) return;
    detailFailures.delete(itemKey(type, intent.id));
    renderCard(type);
    try { await hydrateDetails([{ type, id: intent.id }]); }
    catch (_error) {}
    if (typeStates[type].currentId === intent.id) renderCard(type, true);
  }

  function validIntent(type, intent) {
    ensureCurrentDay(new Date());
    return Boolean(intent && intent.date === currentDateKey && currentItem(type)?.id === intent.id);
  }

  async function handleFeedback(type, intent, kind) {
    const label = kind === "liked" ? "喜欢" : "收藏";
    if (!validIntent(type, intent)) {
      showToast("这项内容刚刚更新，请在当前卡片上重新选择。", false);
      return;
    }
    try {
      const changed = await withPersistenceTransaction(() => {
        ensureCurrentDay(new Date());
        const latestProfile = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
        const latestState = loadTypeState(type, currentDateKey, { profile: latestProfile });
        typeStates[type] = latestState;
        rebuildViews();
        if (intent.date !== currentDateKey || latestState.currentId !== intent.id) return false;
        const nextProfile = Profile.toggleFeedback(latestProfile, type, intent.id, kind, new Date());
        storage.set(Profile.STORAGE_KEY, JSON.stringify(nextProfile));
        profile = nextProfile;
        return true;
      });
      if (!changed) {
        renderCard(type);
        showToast("这项内容刚刚在另一个标签页更新，请在当前卡片上重新选择。", false);
        return;
      }
    } catch (error) {
      recoverLocalModel([type], error);
      elements.storageWarning.hidden = false;
      const persistenceUnavailable = !storage.available || globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE === false;
      const message = persistenceUnavailable
        ? `${label}操作未执行；已切换到临时内存模式，请重新选择。后续操作仅在本次会话有效。`
        : `偏好没有保存（${label}操作未完成）；请等待其他数据操作结束后重试。`;
      elements.liveRegion.textContent = message;
      showToast(message, false);
      return;
    }
    renderCard(type);
    if (elements.recordDialog.open) renderRecordDialog();
    const current = Profile.feedbackFor(profile, type, intent.id);
    const message = current[kind] ? `已加入${label}。` : `已取消${label}。`;
    elements.liveRegion.textContent = message;
    showToast(message, false);
  }

  function handleUnsuitable(type, intent) {
    if (!validIntent(type, intent)) {
      showToast("这项内容刚刚更新，请在当前卡片上重新选择。", false);
      return;
    }
    replaceCurrent(type, false, intent, { unsuitable: true });
  }

  async function handleWeather(type, intent, button) {
    if (type !== "city" || !validIntent(type, intent)) return;
    const item = currentItem("city");
    const target = button.parentElement.querySelector(".weather-result");
    if (!CityLive || typeof CityLive.fetchCurrent !== "function") {
      target.textContent = "当前版本无法连接天气服务。";
      return;
    }
    const token = ++activeWeatherToken;
    button.disabled = true;
    target.textContent = "正在获取带时间戳的天气…";
    try {
      const result = await CityLive.fetchCurrent(item);
      if (token !== activeWeatherToken || currentItem("city")?.id !== item.id) return;
      const retrieved = result.retrievedAt
        ? new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(result.retrievedAt))
        : "刚刚";
      const cacheLabel = result.stale ? " · 过期缓存" : result.cached ? " · 缓存" : "";
      target.textContent = `${result.summary || `${result.temperature ?? "—"} °C`} · 获取于 ${retrieved}${cacheLabel}`;
    } catch (_error) {
      if (token === activeWeatherToken) target.textContent = "天气暂不可用；静态城市内容不受影响。";
    } finally {
      if (token === activeWeatherToken && button.isConnected) button.disabled = false;
    }
  }

  async function replaceCurrent(type, markKnown, intent, extras) {
    const changeExtras = extras || {};
    if (swapLocked[type]) return;
    const expectedId = intent?.id || typeStates[type].currentId;
    const expectedDate = intent?.date || currentDateKey;
    ensureCurrentDay(new Date());
    if (expectedDate !== currentDateKey) {
      const message = "新的一天已经开始，已为你保留新的今日精选；刚才的旧推荐没有被记入。";
      showToast(message, false);
      elements.liveRegion.textContent = message;
      return;
    }
    const item = currentItem(type);
    if (!item || item.id !== expectedId) {
      const message = "推荐内容刚刚在另一标签页中更新，本页已同步到最新内容。";
      showToast(message, false);
      elements.liveRegion.textContent = message;
      return;
    }
    swapLocked[type] = true;

    const card = elements[TYPE_META[type].card];
    for (const button of card.querySelectorAll("button[data-action]")) button.disabled = true;
    const swapLabel = card.querySelector(".swap-button span:first-child");
    if (swapLabel) swapLabel.textContent = "正在精选…";
    card.classList.add("is-swapping");

    let outcome = null;
    try {
      const delay = appearanceState?.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 130;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      if (ensureCurrentDay(new Date())) {
        outcome = { status: "new-day" };
      } else outcome = await withPersistenceTransaction(() => {
        if (ensureCurrentDay(new Date())) return { status: "new-day" };
        const latestProfile = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
        const latest = loadTypeState(type, currentDateKey, {
          allowCurrentUnsuitableId: changeExtras.unsuitable === true ? expectedId : null,
          profile: latestProfile
        });
        invalidatePendingUndo(type, latest);
        typeStates[type] = latest;
        rebuildViews();

        if (expectedDate !== currentDateKey) return { status: "new-day" };
        if (latest.currentId !== expectedId) return { status: "stale" };

        const feedbackBefore = changeExtras.unsuitable
          ? Profile.feedbackFor(latestProfile, type, expectedId)
          : null;
        const changedProfile = changeExtras.unsuitable
          ? Profile.setFeedback(latestProfile, type, expectedId, "unsuitable", true, new Date())
          : latestProfile;

        const changed = {
          ...latest,
          knownEntries: latest.knownEntries.slice(),
          skipped: latest.skipped.slice()
        };
        if (markKnown && !changed.knownEntries.some((entry) => entry.id === expectedId)) {
          changed.knownEntries.push({ id: expectedId, at: new Date().toISOString() });
        }
        if (!changed.skipped.includes(expectedId)) changed.skipped.push(expectedId);
        changed.sequence = nextSafeCounter(changed.sequence);
        const knownIds = changed.knownEntries.map((entry) => entry.id);
        const next = Engine.chooseNext(collections[type], {
          dateKey: currentDateKey,
          type,
          currentId: expectedId,
          excludedIds: [...knownIds, ...changed.skipped, ...Profile.unsuitableIds(changedProfile, type)],
          sequence: changed.sequence,
          manualShuffle: true,
          random: randomUnit,
          ...selectionOptions(type, currentDateKey, changedProfile)
        });
        changed.currentId = next ? next.id : null;
        bumpRecordVersion(changed);
        const nextUndo = {
          type,
          date: currentDateKey,
          revision: changed.revision,
          version: changed.version,
          previousId: expectedId,
          replacementId: changed.currentId,
          previousSequence: latest.sequence,
          markKnown,
          feedbackBefore,
          unsuitable: changeExtras.unsuitable === true
        };
        if (changeExtras.unsuitable) {
          writeAtomicEntries([
            { key: Profile.STORAGE_KEY, value: JSON.stringify(changedProfile) },
            { key: stateKey(type), value: JSON.stringify(changed) }
          ], "unsuitable");
          profile = changedProfile;
          typeStates[type] = changed;
          rebuildViews();
        } else {
          profile = latestProfile;
          writeTypeStateLocked(type, changed);
        }
        pendingUndo = nextUndo;
        return { status: "changed", next, version: changed.version };
      });
    } catch (error) {
      recoverLocalModel([type], error);
      outcome = { status: "error", code: error?.code || null };
    } finally {
      swapLocked[type] = false;
      renderCard(type, true);
      renderRecordCount();
      if (elements.recordDialog.open) renderRecordDialog();
    }

    if (outcome?.status === "error") {
      const message = outcome.code === "WEB_CRYPTO_UNAVAILABLE"
        ? "当前浏览器无法提供安全随机数，这次换项没有执行；原推荐、偏好和今日跳过记录均已保留。请更新浏览器后重试。"
        : "这次操作没有成功，原推荐与偏好已保留，请稍后再试。";
      showToast(message, false);
      elements.liveRegion.textContent = message;
      return;
    }
    if (!outcome || outcome.status === "stale") {
      const message = "另一标签页已经更新了这项推荐，本页已同步到最新内容。";
      showToast(message, false);
      elements.liveRegion.textContent = message;
      return;
    }
    if (outcome.status === "new-day") {
      const message = "新的一天已经开始，已为你保留新的今日精选；刚才的旧推荐没有被记入。";
      showToast(message, false);
      elements.liveRegion.textContent = message;
      return;
    }

    const meta = TYPE_META[type];
    const announcement = outcome.next
      ? `${changeExtras.unsuitable ? "已标记为不适合，" : markKnown ? `已标记为${meta.known}，` : "已仅在今天跳过，"}并换了${meta.unit}${meta.label === "电影" ? "电影" : meta.label === "城市" ? "城市" : meta.label === "图书" ? "书" : "内容"}。`
      : `${changeExtras.unsuitable ? "已标记为不适合，" : markKnown ? `已标记为${meta.known}，` : "已在今天跳过，"}${meta.label}候选暂时用完。`;
    const canUndo = Boolean(pendingUndo && pendingUndo.type === type && pendingUndo.version === outcome.version);
    showToast(announcement, canUndo);
    elements.liveRegion.textContent = announcement;
  }

  async function undoLastChange() {
    if (ensureCurrentDay(new Date()) || !pendingUndo) {
      const message = "已进入新的一天，昨天的操作不能再撤销。";
      showToast(message, false);
      elements.liveRegion.textContent = message;
      return;
    }
    const undo = { ...pendingUndo };
    const { type, previousId, previousSequence, markKnown } = undo;
    const previous = collections[type].find((item) => item.id === previousId);
    if (!previous) return;

    let restored = false;
    try {
      restored = await withPersistenceTransaction(() => {
        if (ensureCurrentDay(new Date())) return false;
        const latestProfile = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
        profile = latestProfile;
        const latest = loadTypeState(type, currentDateKey);
        typeStates[type] = latest;
        rebuildViews();
        const stillCurrent = undo.date === currentDateKey &&
          latest.version === undo.version &&
          latest.currentId === undo.replacementId;
        if (!stillCurrent) return false;

        let restoredProfile = latestProfile;
        if (undo.feedbackBefore) {
          for (const kind of Profile.FEEDBACK_KINDS) {
            restoredProfile = Profile.setFeedback(
              restoredProfile,
              type,
              previousId,
              kind,
              undo.feedbackBefore[kind] === true,
              new Date()
            );
          }
        }

        const changed = {
          ...latest,
          knownEntries: markKnown
            ? latest.knownEntries.filter((entry) => entry.id !== previousId)
            : latest.knownEntries.slice(),
          skipped: latest.skipped.filter((id) => id !== previousId),
          sequence: State.safeSequence(previousSequence),
          currentId: previousId,
          revision: latest.revision,
          version: latest.version
        };
        bumpRecordVersion(changed);
        if (undo.feedbackBefore) {
          writeAtomicEntries([
            { key: Profile.STORAGE_KEY, value: JSON.stringify(restoredProfile) },
            { key: stateKey(type), value: JSON.stringify(changed) }
          ], "undo");
          profile = restoredProfile;
          typeStates[type] = changed;
          rebuildViews();
        } else {
          profile = latestProfile;
          writeTypeStateLocked(type, changed);
        }
        return true;
      });
    } catch (error) {
      recoverLocalModel([type], error);
      elements.storageWarning.hidden = false;
      if (!persistenceRecoveryBlocked && pendingUndo?.version === undo.version) {
        const message = "撤销没有保存，原状态已保留；可以再次点击撤销重试。";
        showToast(message, true);
        elements.liveRegion.textContent = message;
      } else {
        showToast("撤销没有保存；本地数据恢复完成前不能继续重试。", false);
      }
      return;
    }

    pendingUndo = null;
    renderCard(type, true);
    renderRecordCount();
    if (elements.recordDialog.open) renderRecordDialog();
    hideToast();
    if (!restored) {
      elements.liveRegion.textContent = "这项推荐已在另一标签页中继续更新，旧的撤销操作没有覆盖新记录。";
      showToast("内容已有更新，无法再撤销上一步。", false);
      return;
    }
    elements.liveRegion.textContent = `已撤销，《${itemTitle(previous)}》已恢复为今日精选。`;
  }

  function showToast(message, canUndo) {
    window.clearTimeout(toastTimer);
    if (!canUndo) pendingUndo = null;
    elements.toastMessage.textContent = message;
    elements.undoButton.hidden = !canUndo;
    elements.toast.hidden = false;
    document.body.classList.add("has-toast");
    if (!canUndo) toastTimer = window.setTimeout(hideToast, 7000);
  }

  function hideToast() {
    window.clearTimeout(toastTimer);
    elements.toast.hidden = true;
    elements.undoButton.hidden = true;
    document.body.classList.remove("has-toast");
  }

  function dismissToast() {
    pendingUndo = null;
    hideToast();
    elements.liveRegion.textContent = "操作提示已关闭。";
  }

  function renderRecordCount() {
    const count = TYPES.reduce((sum, type) => sum + knownState[type].length, 0);
    elements.recordCount.textContent = String(count);
    elements.recordButton.setAttribute("aria-label", `打开探索记录，共${count}项`);
  }

  function openRecordDialog() {
    visibleKnownRecords = RECORD_PAGE_SIZE;
    visibleFavoriteRecords = RECORD_PAGE_SIZE;
    renderRecordDialog();
    openDialog(elements.recordDialog);
    void hydrateVisibleRecordDetails();
  }

  async function hydrateVisibleRecordDetails() {
    if (!CatalogStore?.loadDetails) return;
    const knownRefs = knownState.order.slice().reverse().slice(0, visibleKnownRecords);
    const favoriteRefs = Profile.favoriteEntries(profile).slice(0, visibleFavoriteRecords);
    const refs = [...knownRefs, ...favoriteRefs]
      .filter((entry) => entry && TYPES.includes(entry.type) && typeof entry.id === "string");
    try { await hydrateDetails(refs); }
    catch (_error) {}
    if (elements.recordDialog.open) renderRecordDialog();
  }

  function renderRecordDialog() {
    renderWeeklyReport();
    elements.recordSummary.innerHTML = TYPES.map((type) => `
      <div class="record-stat"><strong>${knownState[type].length}</strong><span>${escapeHtml(TYPE_META[type].label)}已记录</span></div>
    `).join("");

    const ordered = knownState.order.slice().reverse()
      .map((entry) => allItems.get(`${entry.type}:${entry.id}`))
      .filter(Boolean);
    const totalKnown = TYPES.reduce((sum, type) => sum + knownState[type].length, 0);
    const favoriteItems = Profile.favoriteEntries(profile)
      .map((entry) => allItems.get(`${entry.type}:${entry.id}`))
      .filter(Boolean);
    elements.resetRecordButton.disabled = totalKnown === 0;
    const knownVisible = ordered.slice(0, visibleKnownRecords);
    const favoritesVisible = favoriteItems.slice(0, visibleFavoriteRecords);
    const knownHtml = ordered.length
      ? knownVisible.map((item) => recordItemHtml(item, false)).join("") + recordMoreHtml("known", knownVisible.length, ordered.length)
      : '<p class="empty-records">还没有长期记录。使用“读过了／看过了／掌握了”等按钮后会出现在这里。</p>';
    const favoritesHtml = favoriteItems.length
      ? favoritesVisible.map((item) => recordItemHtml(item, true)).join("") + recordMoreHtml("favorite", favoritesVisible.length, favoriteItems.length)
      : '<p class="empty-records">还没有收藏。收藏不会把内容标记为已经了解。</p>';
    elements.recordList.innerHTML = `<h3>长期探索记录 · ${ordered.length}</h3>${knownHtml}<h3 class="favorite-heading">收藏 · ${favoriteItems.length}</h3>${favoritesHtml}`;
  }

  function recordItemHtml(item, favorite) {
    const meta = TYPE_META[item.type];
    return `
      <div class="record-item">
        <span class="record-item-type${favorite ? " record-favorite-mark" : ""}" aria-hidden="true">${favorite ? "★" : meta.short}</span>
        <span class="record-item-copy">
          <strong>${escapeHtml(itemTitle(item))}</strong>
          <small>${escapeHtml(meta.label)} · ${escapeHtml(itemSubtitle(item))}</small>
        </span>
      </div>
    `;
  }

  function recordMoreHtml(section, shown, total) {
    if (shown >= total) return "";
    const next = Math.min(RECORD_PAGE_SIZE, total - shown);
    const label = section === "known" ? "长期探索记录" : "收藏";
    return `<button class="secondary-button record-load-more" type="button" data-record-more="${section}" aria-label="继续显示${label}">再显示 ${next} 项 · 已显示 ${shown}/${total}</button>`;
  }

  function handleRecordListClick(event) {
    const button = event.target.closest("[data-record-more]");
    if (!button) return;
    const section = button.dataset.recordMore;
    if (section === "known") visibleKnownRecords += RECORD_PAGE_SIZE;
    else if (section === "favorite") visibleFavoriteRecords += RECORD_PAGE_SIZE;
    else return;
    renderRecordDialog();
    void hydrateVisibleRecordDetails();
    const nextButton = elements.recordList.querySelector(`[data-record-more="${section}"]`);
    (nextButton || elements.recordList).focus({ preventScroll: true });
    elements.liveRegion.textContent = section === "known" ? "已显示更多长期探索记录。" : "已显示更多收藏。";
  }

  async function resetKnownRecords() {
    const confirmed = window.confirm("确定清空全部长期探索记录吗？清除后，这些内容未来可能再次被推荐。今天仅跳过的项目不会受影响。");
    if (!confirmed) return;
    ensureCurrentDay(new Date());
    try {
      await withPersistenceTransaction(() => {
        ensureCurrentDay(new Date());
        const latestProfile = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
        profile = latestProfile;
        const nextStates = {};
        for (const type of TYPES) {
          const latest = loadTypeState(type, currentDateKey, { profile: latestProfile });
          latest.knownEntries = [];
          bumpRecordVersion(latest);
          nextStates[type] = latest;
        }
        writeAtomicEntries(TYPES.map((type) => ({
          key: stateKey(type),
          value: JSON.stringify(nextStates[type])
        })), "reset-known");
        for (const type of TYPES) typeStates[type] = nextStates[type];
        rebuildViews();
      });
    } catch (error) {
      recoverLocalModel(TYPES, error);
      elements.storageWarning.hidden = false;
      elements.liveRegion.textContent = "记录没有清空；请等待其他数据操作结束后重试。";
      renderAllCards();
      renderRecordCount();
      renderRecordDialog();
      return;
    }
    pendingUndo = null;
    renderAllCards();
    renderRecordCount();
    renderRecordDialog();
    hideToast();
    elements.liveRegion.textContent = "已清空全部长期探索记录。";
  }

  function initializeExplore() {
    if (!CatalogStore?.query && (!Explore?.buildIndex || !Explore?.query)) {
      elements.exploreStatus.textContent = "全库搜索模块未能加载；今日五项仍可正常使用。";
      for (const control of elements.exploreForm.elements) control.disabled = true;
      return;
    }
    const regions = [...new Set(collections.city.map((item) => item.region).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
    const medicalTopics = [...new Set(collections.medical.map((item) => item.topicGroup || item.topic).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
    appendOptions(elements.exploreRegion, regions);
    appendOptions(elements.exploreMedicalTopic, medicalTopics);
    elements.exploreForm.addEventListener("focusin", () => ensureExploreIndex());
    if ("IntersectionObserver" in window) {
      exploreObserver = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        ensureExploreIndex();
        exploreObserver?.disconnect();
        exploreObserver = null;
      }, { rootMargin: "240px 0px" });
      exploreObserver.observe(elements.exploreSection);
    } else ensureExploreIndex();
  }

  function appendOptions(select, values) {
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      select.append(option);
    }
  }

  function ensureExploreIndex() {
    if (exploreIndex) return exploreIndex;
    elements.exploreResults.setAttribute("aria-busy", "true");
    exploreIndex = CatalogStore?.query ? Object.freeze({ split: true }) : Explore.buildIndex(Catalog, Engine);
    void renderExploreResults(1, false);
    return exploreIndex;
  }

  function scheduleExploreRender() {
    window.clearTimeout(exploreInputTimer);
    exploreInputTimer = window.setTimeout(() => renderExploreResults(1, false), 140);
  }

  function readExploreFilters(page) {
    const type = elements.exploreType.value;
    const mediaAllowed = type === "all" || type === "book" || type === "movie";
    return {
      q: elements.exploreQuery.value,
      type,
      genre: mediaAllowed ? elements.exploreGenre.value : "",
      era: mediaAllowed ? elements.exploreEra.value : "",
      region: type === "all" || type === "city" ? elements.exploreRegion.value : "",
      ratingPercent: mediaAllowed ? elements.exploreRating.value : "",
      level: type === "all" || type === "german" ? elements.exploreGermanLevel.value : "",
      medicalTopic: type === "all" || type === "medical" ? elements.exploreMedicalTopic.value : "",
      sort: elements.exploreSort.value,
      page,
      pageSize: 24
    };
  }

  function updateExploreControlAvailability() {
    const type = elements.exploreType.value;
    const mediaAllowed = type === "all" || type === "book" || type === "movie";
    elements.exploreGenre.disabled = !mediaAllowed;
    elements.exploreEra.disabled = !mediaAllowed;
    elements.exploreRating.disabled = !mediaAllowed;
    elements.exploreRegion.disabled = !(type === "all" || type === "city");
    elements.exploreGermanLevel.disabled = !(type === "all" || type === "german");
    elements.exploreMedicalTopic.disabled = !(type === "all" || type === "medical");
  }

  async function renderExploreResults(requestedPage, focusStatus) {
    if (!exploreIndex) {
      ensureExploreIndex();
      return;
    }
    updateExploreControlAvailability();
    const token = ++exploreRequestToken;
    elements.exploreResults.setAttribute("aria-busy", "true");
    elements.exploreStatus.textContent = CatalogStore?.query ? "正在搜索并载入本页详情…" : "正在搜索…";
    let result;
    try {
      const filters = readExploreFilters(requestedPage);
      result = CatalogStore?.query
        ? await CatalogStore.query(filters, { hydrate: true })
        : Explore.query(exploreIndex, filters);
    } catch (error) {
      if (token !== exploreRequestToken) return;
      RuntimeHealth?.record?.("search", error?.code || error?.name || "SEARCH_FAILED");
      elements.exploreStatus.textContent = "搜索索引没有在时限内准备好；今日五项不受影响。请重试筛选，或使用安全模式。";
      elements.exploreResults.innerHTML = '<p class="explore-empty">搜索暂时不可用。可以稍后重试，现有收藏与探索记录没有改变。</p>';
      elements.explorePagination.hidden = true;
      return;
    } finally {
      if (token === exploreRequestToken) elements.exploreResults.setAttribute("aria-busy", "false");
    }
    if (token !== exploreRequestToken) return;
    for (const entry of result.items) {
      if (entry?.item?.type && entry.item.id) allItems.set(itemKey(entry.item.type, entry.item.id), entry.item);
    }
    explorePage = result.page;
    elements.exploreResults.innerHTML = result.items.map(exploreResultHtml).join("");
    Visuals?.bind?.(elements.exploreResults);
    if (!result.items.length) elements.exploreResults.innerHTML = '<p class="explore-empty">没有符合当前条件的条目。试试清除一个筛选，或换一个关键词。</p>';
    elements.exploreStatus.textContent = `找到 ${result.total} 条内容；当前显示第 ${result.page} 页，共 ${result.pageCount} 页。`;
    elements.explorePageStatus.textContent = `第 ${result.page} / ${result.pageCount} 页`;
    elements.explorePrevious.disabled = result.page <= 1;
    elements.exploreNext.disabled = result.page >= result.pageCount;
    elements.explorePagination.hidden = result.total === 0;
    if (focusStatus) {
      elements.exploreStatus.setAttribute("tabindex", "-1");
      elements.exploreStatus.focus({ preventScroll: true });
      elements.exploreSection.scrollIntoView({ behavior: appearanceState?.motion === "reduce" ? "auto" : "smooth", block: "start" });
    }
  }

  function exploreResultHtml(entry) {
    const item = entry.item;
    const type = entry.type;
    const meta = TYPE_META[type];
    const title = itemTitle(item);
    let detail = "";
    let score = "";
    if (type === "book" || type === "movie") {
      detail = `${item.creator || "创作者待核"} · ${displayYearLabel(item)} · ${(Engine.itemGenres(item) || []).map((genre) => GENRE_LABELS[genre] || genre).join(" / ")}`;
      score = item.rating ? `${Number(item.rating.value).toFixed(1)} / ${item.rating.max} · ${Engine.formatCount(item.rating.count)}人` : "";
    } else if (type === "city") detail = `${item.countryZh} · ${item.region}`;
    else if (type === "german") detail = `${item.level} · ${item.kind} · ${item.chinese}`;
    else detail = `${item.topicGroup || item.topic} · ${item.topic}`;
    const summary = type === "german" ? item.explanation : item.summary;
    const localMedicalImage = type === "medical";
    const resolvedVisual = ["book", "movie", "city"].includes(type) ? resolveVisual(item, type) : null;
    const renderedVisual = resolvedVisual ? visualImageHtml(resolvedVisual, "explore-image", { lazy: true }) : "";
    const editorialVisual = type === "book" || type === "movie" ? editorialArtHtml(item, type) : "";
    let visual = `<span class="explore-monogram" aria-hidden="true">${escapeHtml(meta.short)}</span>`;
    if (type === "book" || type === "movie") visual = `${editorialVisual}${renderedVisual}` || visual;
    else if (renderedVisual) visual = renderedVisual;
    else if (localMedicalImage) visual = `<img src="${safeImageUrl(item.image)}" alt="${escapeAttribute(item.alt)}" loading="lazy" decoding="async" />`;
    const series = item.series ? `<p class="explore-series">${escapeHtml(item.series)}${item.installment ? ` · ${escapeHtml(seriesInstallmentLabel(item.installment))}` : ""}${item.prerequisite ? `；${escapeHtml(item.prerequisite)}` : ""}</p>` : "";
    return `<article class="explore-card explore-${type}">
      <div class="explore-visual" style="--visual:${safeColor(Array.isArray(item.visual?.palette) ? item.visual.palette[0] : item.visual)}">${visual}${resolvedVisual ? visualCreditHtml(resolvedVisual) : ""}</div>
      <div class="explore-card-copy"><span class="explore-type">${escapeHtml(meta.label)}</span><h3>${escapeHtml(title)}</h3><p class="explore-meta">${escapeHtml(detail)}</p><p>${escapeHtml(summary || "")}</p>${series}<footer>${score ? `<span>${escapeHtml(score)}</span>` : ""}<a href="${safeLink(item.sourceUrl)}" target="_blank" rel="noreferrer">查看来源${externalLinkIcon()}</a></footer></div>
    </article>`;
  }

  function handleQuickJump(event) {
    const link = event.target.closest("[data-quick-jump]");
    if (!link) return;
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: appearanceState?.motion === "reduce" ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => target.querySelector("h3")?.focus({ preventScroll: true }), appearanceState?.motion === "reduce" ? 0 : 220);
  }

  function renderWeeklyReport() {
    if (!Weekly?.buildReport) return;
    const report = Weekly.buildReport({ catalog: Catalog, profile, typeStates, now: new Date() });
    elements.weeklyRange.textContent = `${report.range.startDate} — ${report.range.endDate}`;
    elements.weeklySummary.innerHTML = [
      [report.knownCount, "本周新记录"], [report.favoriteCount, "本周收藏"], [report.likedCount, "本周喜欢"], [report.activityCount, "相关项目"]
    ].map(([count, label]) => `<div><strong>${count}</strong><span>${label}</span></div>`).join("");
    if (report.empty) {
      elements.weeklyBreakdown.innerHTML = '<p class="weekly-empty">本周还没有可汇总的本机记录。探索、喜欢或收藏后，这里会形成一份不上传的本地回顾。</p>';
    } else {
      elements.weeklyBreakdown.innerHTML = [
        weeklyGroupHtml("五类相关项目", report.byType, (id) => TYPE_META[id]?.label || id),
        weeklyGroupHtml("喜欢的书影题材", report.genres),
        weeklyGroupHtml("德语等级", report.germanLevels),
        weeklyGroupHtml("医学主题", report.medicalTopics)
      ].join("");
    }
    elements.weeklyPrivacyNote.textContent = `${report.privacyNote} ${report.scopeNote}`;
  }

  function weeklyGroupHtml(title, rows, labelFor) {
    if (!Array.isArray(rows) || !rows.length) return "";
    const chips = rows.slice(0, 8).map((row) => `<span>${escapeHtml(labelFor ? labelFor(row.id) : row.label)} · ${row.count}</span>`).join("");
    return `<section><h4>${escapeHtml(title)}</h4><div>${chips}</div></section>`;
  }

  function initializeSettings() {
    renderBackupEncryptionFields();
    const topicGroups = [...new Set(collections.medical.map((item) => item.topicGroup || item.topic).filter(Boolean))].sort((left, right) => left.localeCompare(right, "zh-CN"));
    elements.medicalPreferenceOptions.replaceChildren(...topicGroups.map((group) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = group;
      input.dataset.prefType = "medical";
      input.dataset.prefField = "topicGroups";
      label.append(input, document.createTextNode(group));
      return label;
    }));
    renderSettings();
  }

  function initializePlatformFeatures() {
    if (Appearance) {
      renderAppearanceState(Appearance.getState?.() || appearanceState);
      window.addEventListener("dailyatlasappearancestate", (event) => renderAppearanceState(event.detail));
    } else {
      for (const control of [elements.backgroundColor, elements.backgroundStyle, elements.compactModeEnabled, elements.dataSaverEnabled, elements.textSize, elements.contrastMode, elements.motionMode]) control.disabled = true;
      elements.appearanceStatus.textContent = "此版本未加载页面背景设置模块。";
    }

    Music?.initialize?.();
    if (Music?.TRACKS?.length) {
      elements.musicTrackSettings.replaceChildren(...Music.TRACKS.map((track) => {
        const option = document.createElement("option");
        option.value = track.id;
        option.textContent = track.menuLabel || track.title;
        return option;
      }));
      renderMusicSettingsState(Music.getState?.());
    } else {
      elements.musicTrackSettings.innerHTML = '<option value="">此浏览器无法载入音乐库</option>';
      elements.musicTrackSettings.disabled = true;
    }
    document.querySelector("#musicPrevious")?.addEventListener("click", () => Music?.previous?.());
    document.querySelector("#musicNext")?.addEventListener("click", () => Music?.next?.());

    Speech?.initialize?.();
    if (Speech?.createController) {
      speechController = Speech.createController({
        voiceSelect: elements.speechVoiceSelect,
        onState: renderSpeechState
      });
      elements.speechBoundary.textContent = Speech.DEVICE_VOICE_BOUNDARY || elements.speechBoundary.textContent;
    } else {
      elements.speechVoiceSelect.innerHTML = '<option value="">此浏览器不支持朗读</option>';
      elements.speechVoiceSelect.disabled = true;
    }

    Reminders?.initialize?.();
    if (Reminders) {
      reminderController = Reminders;
      const reminder = Reminders.load?.() || Reminders.getState?.();
      if (reminder?.time) elements.reminderTime.value = reminder.time;
      renderReminderState(reminder);
      window.addEventListener("dailyatlasreminderstate", (event) => renderReminderState(event.detail));
    }

    if (PWA) {
      PWA.onInstallAvailable?.(() => { elements.installAppButton.hidden = false; });
      renderPwaState(PWA.status?.() || PWA.getState?.());
      window.addEventListener("dailyatlaspwastate", (event) => renderPwaState(event.detail));
      void PWA.getOfflineStatus?.();
      void refreshStoragePreflight();
    } else {
      for (const control of [elements.offlineLightMode, elements.offlineFullMode, elements.pauseOfflineButton, elements.resumeOfflineButton, elements.cancelOfflineButton, elements.checkStorageButton, elements.persistStorageButton, elements.repairCacheButton]) {
        control.disabled = true;
      }
      elements.storagePreflightStatus.textContent = globalThis.DAILY_ATLAS_SAFE_MODE === true
        ? "安全模式不启动 Service Worker；返回普通模式后可检查离线空间和修复缓存。"
        : "当前浏览器没有加载离线与存储管理模块。";
    }
  }

  function renderSpeechState(state) {
    const current = currentItem("german");
    const active = Boolean(current && state && String(state.itemId || "") === current.id && (state.speaking || state.pending));
    const button = elements.germanCard.querySelector("[data-german-speak]");
    if (button) {
      button.setAttribute("aria-pressed", String(active));
      button.textContent = active ? "■ 停止朗读" : "▶ 女声朗读例句";
    }
    const status = elements.germanCard.querySelector(".speech-status-inline");
    if (status) {
      if (state?.status === "unsupported") status.textContent = "此设备不支持浏览器朗读";
      else if (state?.status === "no-german-voice") status.textContent = "此设备未安装德语语音";
      else if (state?.status === "error") status.textContent = "朗读失败：固定音频与设备德语后备均不可用";
      else if (active && state?.playbackMode === "bundled-female") status.textContent = "正在播放随包固定德语合成女声";
      else if (active) status.textContent = "固定音频不可用，正在使用设备德语音色后备朗读";
      else status.textContent = "随包固定合成女声 · 点击后播放";
    }
  }

  function renderPwaState(state) {
    if (!state) return;
    elements.installAppButton.hidden = !state.installAvailable;
    const updateApplying = state.updateApplying === true;
    elements.updateAppButton.hidden = !state.updateAvailable && !updateApplying;
    elements.updateAppButton.disabled = updateApplying;
    elements.updateAppButton.textContent = updateApplying ? "正在切换版本…" : "应用更新并重新载入";
    const supported = state.supported !== false;
    const mode = state.offlineMode === "full" ? "full" : "light";
    const downloading = state.offlinePhase === "downloading";
    const paused = state.offlinePhase === "paused";
    elements.offlineLightMode.checked = mode === "light";
    elements.offlineFullMode.checked = mode === "full";
    elements.offlineLightMode.disabled = !supported;
    elements.offlineFullMode.disabled = !supported || downloading || paused;
    elements.pauseOfflineButton.hidden = !downloading;
    elements.pauseOfflineButton.disabled = !downloading;
    elements.resumeOfflineButton.hidden = !paused;
    elements.resumeOfflineButton.disabled = !paused;
    elements.cancelOfflineButton.disabled = !(downloading || paused);
    elements.offlineProgressPanel.hidden = !(downloading || paused);
    elements.offlineProgress.max = Math.max(1, Number(state.offlineTotalCount) || 700);
    elements.offlineProgress.value = Math.max(0, Number(state.offlineStagedCount ?? state.offlineCachedCount) || 0);
    elements.offlineProgressText.textContent = `${elements.offlineProgress.value}/${elements.offlineProgress.max} 条`;
    if (state.registered) {
      if (updateApplying) {
        elements.offlineStatus.textContent = "正在切换到已完整缓存的新版本；若浏览器未能及时激活，按钮会自动恢复以便重试。";
      } else if (state.updateAvailable) {
        elements.offlineStatus.textContent = "新版本轻量应用壳已完整缓存；点击按钮后原子切换并重新载入。";
      } else if (downloading) {
        elements.offlineStatus.textContent = `正在下载完整离线包：${elements.offlineProgress.value}/${elements.offlineProgress.max} 条。轻量应用壳仍可使用。`;
      } else if (paused) {
        elements.offlineStatus.textContent = `完整离线包已暂停在 ${elements.offlineProgress.value}/${elements.offlineProgress.max} 条；已下载部分保留，点击“继续下载”只补缺项。`;
      } else if (state.offlinePhase === "error") {
        const errors = {
          QUOTA: "设备可用存储空间不足",
          NETWORK: "网络中断或音频文件不可用",
          CURRENT_AUDIO_FAILED: "当前德语朗读暂未缓存",
          INVALID_VISUAL: "城市图片校验失败",
          INCOMPLETE_VISUAL: "城市图片包尚未完整写入",
          INVALID_VISUAL_MANIFEST: "城市图片清单校验失败",
          "worker-timeout": "浏览器没有及时完成离线任务"
        };
        elements.offlineStatus.textContent = `${errors[state.offlineErrorCode] || "离线包操作失败"}；轻量应用壳没有受损，可以稍后重试。`;
      } else if (state.offlinePhase === "cancelled") {
        elements.offlineStatus.textContent = "完整离线包下载已取消；当前使用轻量离线。";
      } else if (mode === "full") {
        elements.offlineStatus.textContent = "完整离线已启用：2,200 项详情、搜索索引、500 条德语朗读与 200 张开放许可城市图均可离线使用；书封和电影海报不属于完整离线包。";
      } else if (state.controlled) {
        const currentAudio = Number(state.offlineCachedCount) > 0 ? "，当前德语朗读已缓存" : "";
        elements.offlineStatus.textContent = `轻量离线已启用：应用壳、紧凑索引、医学图与已访问详情可离线使用${currentAudio}；城市图按访问尽力缓存，未访问详情、搜索索引和其余朗读按需下载。`;
      } else {
        elements.offlineStatus.textContent = "轻量离线应用壳已注册，刷新一次后接管页面。";
      }
      if (state.offlinePhase === "ready") cacheCurrentNarrationForOffline(currentItem("german"));
      return;
    }
    const unsupportedMessages = {
      "requires-http": "当前是本地文件模式；核心页面可用，但安装和离线更新需要 HTTPS 或 localhost。",
      "requires-secure-context": "当前连接不是安全上下文；请改用 HTTPS，核心页面仍可使用。",
      "service-worker-unavailable": "此浏览器未提供或已禁用离线应用能力；核心页面仍可使用。",
      "registration-failed": "离线组件注册失败；请检查网络、可用存储空间和浏览器站点权限后重试。"
    };
    elements.offlineStatus.textContent = unsupportedMessages[state.reason || state.status] ||
      state.boundary || "通过 HTTPS 或 localhost 打开后可安装离线应用壳。";
  }

  function renderReminderState(state) {
    if (!state) return;
    if (state.time) elements.reminderTime.value = state.time;
    if (state.supported === false) {
      elements.enableReminderButton.disabled = true;
      elements.enableReminderButton.setAttribute("aria-disabled", "true");
      elements.reminderStatus.textContent = "此浏览器不支持网页通知；仍可导出每日 ICS，交给系统日历长期提醒。";
      return;
    }
    const permission = state.permission === "granted" ? "通知已授权" : state.permission === "denied" ? "通知已被拒绝" : "通知尚未授权";
    elements.reminderStatus.textContent = state.enabled
      ? `已启用 ${state.time} 的运行中提醒 · ${permission}。网页关闭后的可靠提醒请导出 ICS。`
      : `提醒未启用 · ${permission}。网页关闭后不能保证准点唤醒。`;
  }

  function openSettingsDialog() {
    renderSettings();
    openDialog(elements.settingsDialog);
  }

  function renderSettings() {
    elements.personalizationEnabled.checked = profile.enabled;
    elements.themeLinkingEnabled.checked = profile.themeLinking;
    for (const input of elements.settingsDialog.querySelectorAll("[data-pref-type][data-pref-field]")) {
      const values = profile.explicit?.[input.dataset.prefType]?.[input.dataset.prefField] || [];
      input.checked = values.includes(input.value);
    }
    for (const input of elements.settingsDialog.querySelectorAll("[data-pref-both]")) {
      const field = input.dataset.prefBoth;
      input.checked = profile.explicit.book[field].includes(input.value) && profile.explicit.movie[field].includes(input.value);
    }
    renderAppearanceState(Appearance?.getState?.());
    renderMusicSettingsState(Music?.getState?.());
  }

  function renderMusicSettingsState(state) {
    if (!state?.trackId || !elements.musicTrackSettings.options.length) return;
    elements.musicTrackSettings.value = state.trackId;
  }

  function handleAppearanceChange(event) {
    if (!Appearance?.configure) return;
    const target = event?.target;
    let patch;
    if (target === elements.backgroundColor) patch = { color: target.value };
    else if (target === elements.backgroundStyle) patch = { style: target.value };
    else if (target === elements.compactModeEnabled) patch = { density: target.checked ? "compact" : "comfortable" };
    else if (target === elements.dataSaverEnabled) {
      patch = { dataSaver: target.checked };
    }
    else if (target === elements.textSize) patch = { textSize: target.value };
    else if (target === elements.contrastMode) patch = { contrast: target.value };
    else if (target === elements.motionMode) patch = { motion: target.value };
    else return;
    const next = Appearance.configure(patch);
    renderAppearanceState(next);
  }

  function renderAppearanceState(state) {
    if (!state) return;
    const dataSaverChanged = appearanceState && appearanceState.dataSaver !== state.dataSaver;
    appearanceState = state;
    elements.backgroundColor.value = state.color;
    elements.backgroundStyle.value = state.style;
    elements.compactModeEnabled.checked = state.density === "compact";
    elements.dataSaverEnabled.checked = state.dataSaver === true;
    elements.dataSaverEnabled.disabled = false;
    if (elements.dataSaverHelp) elements.dataSaverHelp.textContent = "默认优先在线加载原书封与电影海报，失败时自动显示原创本地主题插画；开启后会关闭这些第三方图片和日常同源城市图，医学图仍保留。";
    elements.textSize.value = state.textSize || "default";
    elements.contrastMode.value = state.contrast || "default";
    elements.motionMode.value = state.motion || "system";
    const description = `${state.colorLabel || "所选颜色"} · ${state.styleLabel || "所选样式"} · ${state.density === "compact" ? "紧凑" : "舒展"}${state.dataSaver ? " · 省流" : ""}`;
    if (state.persistenceStatus === "error" || state.persistenceStatus === "unavailable") {
      elements.appearanceStatus.textContent = `已在本次页面应用 ${description}，但浏览器未能保存。`;
    } else if (state.persistenceStatus === "memory-only") {
      elements.appearanceStatus.textContent = `已在本次会话应用 ${description}；关闭页面后不会保留。`;
    } else if (state.persistenceStatus === "saving") {
      elements.appearanceStatus.textContent = `已应用 ${description}，正在保存…`;
    } else {
      elements.appearanceStatus.textContent = `当前使用 ${description}。`;
    }
    if (dataSaverChanged) {
      renderCard("book");
      renderCard("movie");
      renderCard("city");
      if (exploreIndex) renderExploreResults(explorePage, false);
    }
  }

  function capturePreferenceIntent(target) {
    if (!target) return null;
    if (target === elements.personalizationEnabled) {
      return { kind: "setting", field: "enabled", value: target.checked };
    }
    if (target === elements.themeLinkingEnabled) {
      return { kind: "setting", field: "themeLinking", value: target.checked };
    }
    if (target.dataset.prefType && target.dataset.prefField) {
      return {
        kind: "explicit-toggle",
        type: target.dataset.prefType,
        field: target.dataset.prefField,
        value: target.value,
        checked: target.checked
      };
    }
    if (target.dataset.prefBoth) {
      return {
        kind: "both-toggle",
        field: target.dataset.prefBoth,
        value: target.value,
        checked: target.checked
      };
    }
    return null;
  }

  function applyExplicitToggle(source, type, field, value, checked, timestamp) {
    const values = new Set(source.explicit?.[type]?.[field] || []);
    if (checked) values.add(value);
    else values.delete(value);
    return Profile.setExplicit(source, type, field, [...values], timestamp);
  }

  function persistPreferenceIntent(intent) {
    return withPersistenceTransaction(() => {
      let next = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
      const timestamp = new Date();
      if (intent.kind === "setting") {
        next = Profile.setSetting(next, intent.field, intent.value, timestamp);
      } else if (intent.kind === "explicit-toggle") {
        next = applyExplicitToggle(next, intent.type, intent.field, intent.value, intent.checked, timestamp);
      } else if (intent.kind === "both-toggle") {
        next = applyExplicitToggle(next, "book", intent.field, intent.value, intent.checked, timestamp);
        next = applyExplicitToggle(next, "movie", intent.field, intent.value, intent.checked, timestamp);
      } else throw new TypeError("Unknown preference intent");
      const normalized = Profile.normalize(next, validIdsByType);
      storage.set(Profile.STORAGE_KEY, JSON.stringify(normalized));
      profile = normalized;
      return normalized;
    });
  }

  function createPreferencePersistence(onIdle) {
    let accepted = 0;
    let completed = 0;
    let failed = 0;
    let pending = 0;
    let lastAcceptedSequence = 0;
    let lastSettledSequence = 0;
    let lastError = null;
    let idleWaiters = [];

    function status() {
      return Object.freeze({
        accepted,
        completed,
        failed,
        pending,
        idle: pending === 0,
        lastAcceptedSequence,
        lastSettledSequence,
        lastError
      });
    }

    function settle(sequence, error) {
      pending = Math.max(0, pending - 1);
      lastSettledSequence = Math.max(lastSettledSequence, sequence);
      if (error) {
        failed += 1;
        lastError = Object.freeze({ name: error.name || "Error", code: error.code || null, message: String(error.message || error) });
      } else completed += 1;
      if (pending !== 0) return;
      const waiters = idleWaiters;
      idleWaiters = [];
      // UI settlement is part of the public whenIdle contract. Run it before
      // resolving observers so tests and callers never see pending=0 with
      // controls that still reflect an optimistic or peer snapshot.
      if (typeof onIdle === "function") {
        try { onIdle(status()); }
        catch (_error) { elements.storageWarning.hidden = false; }
      }
      for (const resolve of waiters) resolve();
    }

    function enqueue(intent) {
      const sequence = ++lastAcceptedSequence;
      accepted += 1;
      pending += 1;
      let operation;
      try { operation = persistPreferenceIntent(intent); }
      catch (error) { operation = Promise.reject(error); }
      return Promise.resolve(operation).then(
        (result) => {
          settle(sequence, null);
          return result;
        },
        (error) => {
          settle(sequence, error);
          throw error;
        }
      );
    }

    function whenIdle() {
      if (pending === 0) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    }

    return Object.freeze({ enqueue, whenIdle, status });
  }

  function settlePreferenceBatch(status) {
    if (status.failed > preferenceFailuresReported) {
      preferenceFailuresReported = status.failed;
      const recovered = recoverLocalModel(TYPES, status.lastError);
      elements.storageWarning.hidden = false;
      if (recovered) {
        renderSettings();
        renderTheme();
        renderAllCards();
        renderRecordCount();
        if (elements.recordDialog.open) renderRecordDialog();
        elements.liveRegion.textContent = !storage.available || globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE === false
          ? "偏好操作未执行；已切换到临时内存模式，请重新选择。后续偏好仅在本次会话有效。"
          : "偏好没有保存；本页已恢复为实际持久状态。";
      } else {
        elements.liveRegion.textContent = "偏好没有保存，且本页暂时无法重新核对持久状态；请停止修改并重新载入页面。";
      }
      return;
    }
    renderSettings();
    renderTheme();
    renderAllCards();
    elements.liveRegion.textContent = storage.available && globalThis.DAILY_ATLAS_PERSISTENCE_AVAILABLE !== false
      ? "偏好已保存在本机；当前合格内容保持不变，后续更换会采用新偏好。"
      : "偏好已应用到本次会话；刷新或关闭页面后不会保留。";
  }

  function handlePreferenceChange(event) {
    const target = event?.target;
    const intent = capturePreferenceIntent(target);
    if (!intent) return;
    // Acceptance and pending counters advance before this event listener
    // returns. Tests and other UI flows can therefore distinguish an event
    // that was never received from one that is queued, committed or failed.
    void preferencePersistence.enqueue(intent).catch(() => {});
  }

  async function resetPreferences() {
    const confirmed = window.confirm("重置喜欢、显式偏好和“不适合我”记录吗？收藏将保留。当前长期探索记录也不会被删除。");
    if (!confirmed) return;
    try {
      await withPersistenceTransaction(() => {
        const latest = Profile.parse(storage.get(Profile.STORAGE_KEY), validIdsByType);
        const reset = Profile.resetPreferences(latest, new Date(), validIdsByType);
        storage.set(Profile.STORAGE_KEY, JSON.stringify(reset));
        profile = reset;
      });
    } catch (error) {
      recoverLocalModel(TYPES, error);
      elements.storageWarning.hidden = false;
      elements.liveRegion.textContent = "偏好没有重置；请等待其他数据操作结束后重试。";
      return;
    }
    for (const type of TYPES) typeStates[type] = repairTypeState(typeStates[type]);
    rebuildViews();
    renderSettings();
    renderAllCards();
    renderRecordCount();
    elements.liveRegion.textContent = "已重置偏好与不适合记录，收藏和长期探索记录已保留。";
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function exportBackup() {
    if (!storage.available) {
      elements.backupStatus.textContent = "当前为临时内存模式，无法导出可恢复的本机备份。";
      return;
    }
    const encrypted = elements.encryptBackupEnabled.checked;
    const password = elements.exportBackupPassword.value;
    const confirmation = elements.exportBackupPasswordConfirm.value;
    if (encrypted && !BackupCrypto?.encrypt) {
      elements.backupStatus.textContent = "此浏览器没有加载本地加密模块；仍可关闭加密后导出普通 JSON。";
      return;
    }
    if (encrypted && password.length < 8) {
      elements.backupStatus.textContent = "请为加密备份设置至少 8 个字符的密码。密码遗忘后无法恢复。";
      elements.exportBackupPassword.focus();
      return;
    }
    if (encrypted && password !== confirmation) {
      elements.backupStatus.textContent = "两次输入的备份密码不一致。";
      elements.exportBackupPasswordConfirm.focus();
      return;
    }
    elements.exportBackupButton.disabled = true;
    elements.backupStatus.textContent = encrypted ? "正在本机加密备份；较旧手机可能需要数秒…" : "正在读取本机数据…";
    try {
      const serialize = (sharedStorage) => Backup.serialize(sharedStorage, {
        appVersion: APP_VERSION,
        catalogSnapshot: Catalog.snapshotDate,
        validIdsByType
      });
      const text = Lock && typeof Lock.readStorage === "function"
        ? await Lock.readStorage(serialize)
        : serialize(window.localStorage);
      const output = encrypted ? await BackupCrypto.encrypt(text, password) : text;
      const prefix = encrypted ? "daily-atlas-backup-encrypted" : "daily-atlas-backup";
      downloadText(`${prefix}-${currentDateKey}.json`, output, "application/json;charset=utf-8");
      elements.backupStatus.textContent = encrypted
        ? "加密 JSON 备份已导出。密码未保存，请与文件分开保管。"
        : "普通 JSON 备份已导出。";
      if (encrypted) {
        elements.exportBackupPassword.value = "";
        elements.exportBackupPasswordConfirm.value = "";
      }
    } catch (error) {
      elements.backupStatus.textContent = backupCryptoMessage(error, "当前浏览器阻止读取本地数据，无法导出备份。");
    } finally {
      elements.exportBackupButton.disabled = false;
    }
  }

  async function importBackup() {
    if (!storage.available) {
      elements.backupStatus.textContent = "当前为临时内存模式，无法导入并持久保存备份。";
      finishImportWithoutReload();
      return;
    }
    if (persistenceRecoveryBlocked) {
      elements.backupStatus.textContent = "上次导入尚未恢复完成；当前禁止继续导入，请先恢复存储并重新载入页面。";
      finishImportWithoutReload();
      return;
    }
    const file = elements.importBackupFile.files?.[0];
    elements.importBackupFile.value = "";
    if (!file) {
      finishImportWithoutReload();
      return;
    }
    const fileLimit = BackupCrypto?.MAX_BYTES || Backup.MAX_BYTES;
    if (file.size > fileLimit) {
      elements.backupStatus.textContent = `备份文件超过 ${BackupCrypto ? "3" : "2"} MB 上限，没有修改任何数据。`;
      finishImportWithoutReload();
      return;
    }
    let text;
    try { text = await file.text(); } catch (_error) {
      elements.backupStatus.textContent = "无法读取备份文件，没有修改任何数据。";
      finishImportWithoutReload();
      return;
    }
    let inspection = { encrypted: false, requiresPassword: false };
    try {
      if (BackupCrypto?.inspect) inspection = BackupCrypto.inspect(text);
    } catch (error) {
      elements.backupStatus.textContent = `${backupCryptoMessage(error, "无法识别该备份文件。")} 没有修改任何数据。`;
      finishImportWithoutReload();
      return;
    }
    pendingBackupImport = {
      filename: file.name,
      rawText: text,
      encrypted: inspection.encrypted === true,
      checked: null,
      local: null,
      localCanonical: null,
      preview: null
    };
    if (elements.settingsDialog.open) closeDialog(elements.settingsDialog);
    resetBackupPreviewDialog();
    openDialog(elements.backupPreviewDialog);
    if (inspection.encrypted) {
      elements.backupUnlockPanel.hidden = false;
      elements.backupPreviewDescription.textContent = `“${file.name}”已加密。密码只用于本机解锁，不会保存或上传。`;
      window.setTimeout(() => elements.importBackupPassword.focus(), 0);
      return;
    }
    await preparePendingBackupPreview(text);
  }

  function renderBackupEncryptionFields() {
    const supported = Boolean(BackupCrypto?.encrypt);
    if (!supported) {
      elements.encryptBackupEnabled.checked = false;
      elements.encryptBackupEnabled.disabled = true;
    }
    const enabled = supported && elements.encryptBackupEnabled.checked;
    elements.exportPasswordFields.hidden = !enabled;
    elements.exportBackupPassword.disabled = !enabled;
    elements.exportBackupPasswordConfirm.disabled = !enabled;
    if (!enabled) {
      elements.exportBackupPassword.value = "";
      elements.exportBackupPasswordConfirm.value = "";
    }
    if (!supported) {
      elements.backupStatus.textContent = "此浏览器不支持本地密码加密；普通 JSON 导出仍可用。";
    }
  }

  function resetBackupPreviewDialog() {
    elements.backupUnlockPanel.hidden = true;
    elements.backupPreviewPanel.hidden = true;
    elements.applyBackupButton.hidden = true;
    elements.applyBackupButton.disabled = false;
    elements.unlockBackupButton.disabled = false;
    elements.importBackupPassword.value = "";
    elements.backupMergeMode.checked = true;
    elements.backupReplaceMode.checked = false;
    elements.backupDiffSummary.replaceChildren();
    elements.backupDiffDetails.replaceChildren();
    elements.backupImportWarnings.hidden = true;
    elements.backupImportWarnings.textContent = "";
    elements.backupPreviewStatus.textContent = "";
  }

  async function unlockPendingBackupImport() {
    if (!pendingBackupImport?.encrypted || !BackupCrypto?.decrypt) return;
    const password = elements.importBackupPassword.value;
    if (!password) {
      elements.backupPreviewStatus.textContent = "请输入该备份的密码。";
      elements.importBackupPassword.focus();
      return;
    }
    elements.unlockBackupButton.disabled = true;
    elements.backupPreviewStatus.textContent = "正在本机解锁；较旧手机可能需要数秒…";
    try {
      const opened = await BackupCrypto.decrypt(pendingBackupImport.rawText, password);
      elements.importBackupPassword.value = "";
      await preparePendingBackupPreview(opened.plaintext);
    } catch (error) {
      elements.importBackupPassword.value = "";
      elements.backupPreviewStatus.textContent = backupCryptoMessage(error, "无法解锁该备份。");
      elements.importBackupPassword.focus();
    } finally {
      elements.unlockBackupButton.disabled = false;
    }
  }

  async function preparePendingBackupPreview(plaintext) {
    if (!pendingBackupImport) return;
    const checked = Backup.parseText(plaintext, validIdsByType);
    if (!checked.ok) {
      elements.backupPreviewStatus.textContent = `${checked.errors.join(" ")} 没有修改任何数据。`;
      elements.backupUnlockPanel.hidden = true;
      return;
    }
    elements.backupPreviewStatus.textContent = "正在读取本机快照并计算变化…";
    try {
      const local = await readCurrentBackupSnapshot();
      pendingBackupImport.checked = checked;
      pendingBackupImport.local = local;
      pendingBackupImport.localCanonical = canonicalImportSnapshot(local);
      elements.backupUnlockPanel.hidden = true;
      elements.backupPreviewPanel.hidden = false;
      elements.applyBackupButton.hidden = false;
      elements.backupPreviewDescription.textContent = `正在预览“${pendingBackupImport.filename}”。所有计算均在本机完成。`;
      renderPendingBackupPreview();
      window.setTimeout(() => elements.backupMergeMode.focus(), 0);
    } catch (_error) {
      elements.backupPreviewStatus.textContent = "无法读取一致的本机快照；没有修改任何数据，请稍后重试。";
      elements.applyBackupButton.hidden = true;
    }
  }

  function readCurrentBackupSnapshot() {
    const collect = (sharedStorage) => {
      const value = Backup.collect(sharedStorage, {
        appVersion: APP_VERSION,
        catalogSnapshot: Catalog.snapshotDate,
        validIdsByType
      });
      return { states: value.states, optional: value.optional };
    };
    return Lock && typeof Lock.readStorage === "function"
      ? Lock.readStorage(collect)
      : Promise.resolve(collect(window.localStorage));
  }

  function canonicalImportSnapshot(snapshot) {
    return JSON.stringify({ states: snapshot.states, optional: snapshot.optional });
  }

  function renderPendingBackupPreview() {
    if (!pendingBackupImport?.checked || !pendingBackupImport.local) return;
    const mode = elements.backupReplaceMode.checked ? "replace" : "merge";
    const preview = Backup.previewImport(pendingBackupImport.local, pendingBackupImport.checked.normalized, {
      mode,
      validIdsByType
    });
    pendingBackupImport.preview = preview;
    const totals = preview.diff.totals;
    const metrics = [
      [totals.knownAdded, "新增长期记录"],
      [totals.knownRemoved, "移除长期记录"],
      [totals.feedbackAdded, "新增反馈"],
      [totals.feedbackRemoved, "移除反馈"],
      [totals.explicitFieldsChanged + totals.settingsChanged, "偏好设置变化"],
      [totals.optionalAdded + totals.optionalReplaced + totals.optionalRemoved, "设备设置变化"]
    ];
    elements.backupDiffSummary.innerHTML = metrics.map(([count, label]) => `<div><strong>${count}</strong><span>${label}</span></div>`).join("");
    const stateDetails = TYPES.map((type) => {
      const diff = preview.diff.states[type];
      if (!diff.changed) return "";
      const current = diff.currentBefore === diff.currentAfter ? "当前项目不变" : "当前项目会变化";
      return `<section><h4>${escapeHtml(TYPE_META[type].label)}</h4><p>${current}；长期记录 ${diff.knownBefore} → ${diff.knownAfter}；今日跳过 ${diff.skippedBefore} → ${diff.skippedAfter}</p></section>`;
    }).filter(Boolean).join("");
    const profile = preview.diff.profile;
    const profileDetails = profile.changed
      ? `<section><h4>收藏与偏好</h4><p>反馈新增 ${totals.feedbackAdded}、移除 ${totals.feedbackRemoved}；明确偏好字段变化 ${totals.explicitFieldsChanged}；开关变化 ${totals.settingsChanged}</p></section>`
      : "";
    const optionalLabels = {
      "dailyAtlas.appearance.v1": "显示与流量",
      "dailyAtlas.audio.v1": "旧版音频",
      "dailyAtlas.audio.v2": "背景音乐",
      "dailyAtlas.speech.v1": "德语后备音色",
      "dailyAtlas.reminder.v1": "每日提醒"
    };
    const optionalDetails = Object.entries(preview.diff.optional)
      .filter(([, action]) => action !== "unchanged")
      .map(([key, action]) => `<li>${escapeHtml(optionalLabels[key] || key)}：${escapeHtml({ add: "新增", remove: "移除", replace: "替换" }[action] || action)}</li>`)
      .join("");
    elements.backupDiffDetails.innerHTML = `${stateDetails}${profileDetails}${optionalDetails ? `<section><h4>本机设置</h4><ul>${optionalDetails}</ul></section>` : ""}` || "<p>没有检测到内容变化。</p>";
    const warnings = pendingBackupImport.checked.warnings || [];
    elements.backupImportWarnings.hidden = warnings.length === 0;
    elements.backupImportWarnings.textContent = warnings.length ? `导入时将忽略：${warnings.join("；")}` : "";
    elements.applyBackupButton.textContent = mode === "merge" ? "确认合并" : "确认替换";
    elements.applyBackupButton.disabled = !preview.hasChanges;
    elements.backupPreviewStatus.textContent = preview.hasChanges
      ? `预览已就绪：${mode === "merge" ? "合并会保留本机当前项目和设备设置" : "替换会删除备份中缺少的本机数据"}。`
      : "该方式不会产生任何变化，无需恢复。";
  }

  async function applyPendingBackupImport() {
    if (!pendingBackupImport?.preview || !pendingBackupImport.preview.hasChanges) return;
    const mode = elements.backupReplaceMode.checked ? "replace" : "merge";
    elements.applyBackupButton.disabled = true;
    elements.cancelBackupPreviewButton.disabled = true;
    elements.backupPreviewStatus.textContent = "正在以单一事务恢复并核对全部数据…";
    try {
      await withPersistenceTransaction((lease) => {
        const value = Backup.collect(lease.storage, {
          appVersion: APP_VERSION,
          catalogSnapshot: Catalog.snapshotDate,
          validIdsByType
        });
        const latest = { states: value.states, optional: value.optional };
        if (canonicalImportSnapshot(latest) !== pendingBackupImport.localCanonical) {
          const stale = new Error("Local backup preview is stale");
          stale.code = "BACKUP_PREVIEW_STALE";
          stale.latest = latest;
          throw stale;
        }
        const finalPreview = Backup.previewImport(latest, pendingBackupImport.checked.normalized, { mode, validIdsByType });
        if (!finalPreview.hasChanges) return 0;
        return Backup.apply(lease.storage, finalPreview.result);
      });
      elements.backupStatus.textContent = `备份已${mode === "merge" ? "合并" : "替换"}恢复，页面即将重新载入。`;
      elements.backupPreviewStatus.textContent = "恢复完成，正在重新载入…";
      pendingBackupImport = null;
      closeDialog(elements.backupPreviewDialog);
      localImportIntent = false;
      peerSnapshotNeedsReload = false;
      reloadWhenPersistenceIdle(80);
    } catch (error) {
      if (error?.code === "BACKUP_PREVIEW_STALE") {
        pendingBackupImport.local = error.latest;
        pendingBackupImport.localCanonical = canonicalImportSnapshot(error.latest);
        renderPendingBackupPreview();
        elements.backupPreviewStatus.textContent = "另一个标签页刚刚修改了本机数据，预览已刷新；请重新核对后再确认。";
      } else if (error?.rollbackComplete === true) {
        elements.backupPreviewStatus.textContent = "恢复失败，已核对并回滚到导入前的数据。";
      } else if (error?.dataState === "before" && error?.recovery?.journalCleared === true) {
        elements.backupPreviewStatus.textContent = "恢复失败，但已核对本机数据没有发生改变。";
      } else if (error?.name !== "BackupApplyError") {
        elements.backupPreviewStatus.textContent = "恢复未执行，本机数据没有发生改变；请稍后重试。";
      } else {
        elements.backupPreviewStatus.textContent = "恢复失败，自动恢复尚未完成；请不要继续修改，重启浏览器后应用会再次恢复。";
        persistenceRecoveryBlocked = true;
        globalThis.DAILY_ATLAS_IMPORT_RECOVERY = error?.recovery || {
          ok: false,
          status: "recovery-incomplete",
          dataRestored: false,
          journalCleared: false
        };
        elements.storageWarning.hidden = false;
        disablePersistentActions();
      }
    } finally {
      elements.cancelBackupPreviewButton.disabled = false;
      if (pendingBackupImport?.preview) elements.applyBackupButton.disabled = !pendingBackupImport.preview.hasChanges;
    }
  }

  function cancelPendingBackupImport() {
    const restoreSettings = !peerSnapshotNeedsReload && !persistenceRecoveryBlocked;
    pendingBackupImport = null;
    elements.importBackupPassword.value = "";
    if (elements.backupPreviewDialog.open) closeDialog(elements.backupPreviewDialog);
    elements.backupStatus.textContent = "已取消恢复，没有修改任何数据。";
    finishImportWithoutReload();
    if (restoreSettings) {
      openDialog(elements.settingsDialog);
      window.setTimeout(() => elements.importBackupButton.focus({ preventScroll: true }), 0);
    }
  }

  function backupCryptoMessage(error, fallback) {
    if (error?.code === "AUTHENTICATION_FAILED") return "密码不正确，或加密备份已被修改。";
    if (error?.code === "PASSWORD_REQUIRED") return "请输入备份密码。";
    if (error?.code === "INVALID_PASSWORD") return "备份密码过长或格式无效。";
    if (error?.code === "UNSUPPORTED") return "此浏览器或当前非 HTTPS 页面不支持本地密码加密。";
    if (error?.code === "ENCRYPTION_FAILED") return "本机加密失败；没有生成不完整备份，请稍后重试。";
    if (error?.code === "FILE_TOO_LARGE" || error?.code === "PLAINTEXT_TOO_LARGE") return "备份超过允许的大小上限。";
    if (error?.code === "INVALID_FILE" || error?.code === "INVALID_ENVELOPE" || error?.code === "INVALID_PLAINTEXT") return "备份文件结构无效或已损坏。";
    return fallback;
  }

  function finishImportWithoutReload() {
    localImportIntent = false;
    if (!peerSnapshotNeedsReload) return;
    peerSnapshotNeedsReload = false;
    reloadWhenPersistenceIdle();
  }

  async function enableReminder() {
    if (!Reminders?.enable) {
      elements.reminderStatus.textContent = "此浏览器不支持通知；仍可导出 ICS。";
      return;
    }
    try { renderReminderState(await Reminders.enable(elements.reminderTime.value)); }
    catch (_error) { elements.reminderStatus.textContent = "提醒时间无效或通知授权失败。"; }
  }

  function disableReminder() {
    if (Reminders?.disable) renderReminderState(Reminders.disable());
  }

  function exportCalendarReminder() {
    if (!Reminders?.exportICS) {
      elements.reminderStatus.textContent = "当前环境无法生成日历文件。";
      return;
    }
    const ok = Reminders.exportICS({
      time: elements.reminderTime.value,
      title: "今日万象 · 每日五项精选",
      description: "打开今日万象，探索今日图书、电影、城市、德语和医学科普。"
    });
    elements.reminderStatus.textContent = ok ? "每日重复 ICS 已导出，请在系统日历中确认提醒设置。" : "当前环境无法下载 ICS。";
  }

  async function installPWA() {
    const result = await PWA?.install?.();
    if (result) elements.offlineStatus.textContent = result.outcome === "accepted" ? "安装请求已接受。" : "安装未完成；你可以稍后再试。";
  }

  async function changeOfflineMode(event) {
    if (!event.currentTarget.checked || !PWA?.setOfflineMode) return;
    const mode = event.currentTarget.value === "full" ? "full" : "light";
    if (mode === "full" && PWA.getStorageEstimate) {
      const estimate = await PWA.getStorageEstimate();
      renderStoragePreflight(estimate);
      if (Number.isFinite(estimate?.available) && Number.isFinite(estimate?.estimatedFullBytes) && estimate.available < estimate.estimatedFullBytes) {
        elements.offlineLightMode.checked = true;
        elements.offlineFullMode.checked = false;
        elements.offlineStatus.textContent = "可用站点空间小于完整离线包估算增量，下载未开始；轻量离线保持可用。";
        return;
      }
    }
    if (mode === "light") {
      pendingNarrationCachePath = null;
      cachedNarrationPath = null;
    }
    const result = await PWA.setOfflineMode(mode);
    if (mode === "light" && result?.ok !== false) cacheCurrentNarrationForOffline(currentItem("german"));
  }

  async function cancelOfflineDownload() {
    if (!PWA?.cancelOfflineDownload) return;
    await PWA.cancelOfflineDownload();
    pendingNarrationCachePath = null;
    cachedNarrationPath = null;
  }

  async function pauseOfflineDownload() {
    if (!PWA?.pauseOfflineDownload) return;
    elements.pauseOfflineButton.disabled = true;
    await PWA.pauseOfflineDownload();
  }

  async function resumeOfflineDownload() {
    if (!PWA?.resumeOfflineDownload) return;
    elements.resumeOfflineButton.disabled = true;
    await PWA.resumeOfflineDownload();
  }

  function storageBytes(value) {
    return RuntimeHealth?.humanBytes?.(value) || (Number.isFinite(Number(value)) ? `${Math.round(Number(value) / 1024 / 1024 * 10) / 10} MB` : "浏览器未报告");
  }

  function renderStoragePreflight(result) {
    if (!result?.supported) {
      elements.storagePreflightStatus.textContent = "此浏览器不提供站点配额估算；仍可使用轻量离线，完整包会在写入时检测失败并保留进度。";
      elements.persistStorageButton.disabled = true;
      return;
    }
    const enough = !Number.isFinite(result.available) || !Number.isFinite(result.estimatedFullBytes) || result.available >= result.estimatedFullBytes;
    const persistence = result.persisted === true ? "已获持久存储" : result.persisted === false ? "未获持久存储" : "持久状态未报告";
    elements.storagePreflightStatus.textContent = `站点已用 ${storageBytes(result.usage)} / 配额 ${storageBytes(result.quota)}；估算可用 ${storageBytes(result.available)}，完整离线包约需新增 ${storageBytes(result.estimatedFullBytes)} · ${persistence}${enough ? "。" : "。当前估算空间不足。"}`;
    elements.storagePreflightStatus.dataset.status = enough ? "ok" : "warning";
    elements.persistStorageButton.disabled = result.persisted === true || typeof PWA?.requestPersistentStorage !== "function";
  }

  async function refreshStoragePreflight() {
    if (!PWA?.getStorageEstimate) return;
    elements.checkStorageButton.disabled = true;
    elements.storagePreflightStatus.textContent = "正在读取浏览器提供的站点空间估算…";
    try { renderStoragePreflight(await PWA.getStorageEstimate()); }
    catch (_error) { elements.storagePreflightStatus.textContent = "本次未能读取站点空间；个人数据没有改变，可以稍后重试。"; }
    finally { elements.checkStorageButton.disabled = false; }
  }

  async function requestPersistentStorage() {
    if (!PWA?.requestPersistentStorage) return;
    elements.persistStorageButton.disabled = true;
    const result = await PWA.requestPersistentStorage();
    if (!result?.supported) elements.storagePreflightStatus.textContent = "此浏览器不提供持久存储申请；轻量离线仍可使用。";
    else if (result.persisted) elements.storagePreflightStatus.textContent = "浏览器已授予持久存储；仍建议保留 JSON 备份。";
    else elements.storagePreflightStatus.textContent = "浏览器没有授予持久存储；这不是错误，空间紧张时系统仍可能清理缓存。";
    await refreshStoragePreflight();
  }

  async function repairApplicationCaches() {
    if (!PWA?.repairCaches) return;
    const confirmed = window.confirm("修复今日万象应用缓存吗？这会清除应用管理的同源城市图缓存，并重新核对应用壳、内容、医学图、城市图与音频缓存；不会删除收藏、偏好、探索记录或备份。公开 LTS 不建立第三方书封／海报缓存。完整离线包可能需要补下载缺项。");
    if (!confirmed) return;
    elements.repairCacheButton.disabled = true;
    elements.storagePreflightStatus.textContent = "正在核对并修复应用缓存…";
    try {
      const result = await PWA.repairCaches();
      renderPwaState(result);
      elements.storagePreflightStatus.textContent = result?.ok === false
        ? "缓存修复没有完全结束；个人数据未改变，请切换网络后重试。"
        : "应用缓存已核对并修复；应用管理的按需同源城市图缓存已清除，个人数据未改变。请重新载入页面。";
    } catch (_error) {
      elements.storagePreflightStatus.textContent = "缓存修复失败；个人数据未改变，请打开独立诊断页查看具体状态。";
    } finally {
      elements.repairCacheButton.disabled = false;
      void refreshStoragePreflight();
    }
  }

  function cacheCurrentNarrationForOffline(item) {
    const path = String(item?.narration?.src || "");
    if (!path || !PWA?.cacheCurrentNarration) return;
    const pwaState = PWA.getState?.() || PWA.status?.();
    if (!pwaState?.registered || pwaState.offlinePhase === "downloading" || path === cachedNarrationPath || path === pendingNarrationCachePath) return;
    pendingNarrationCachePath = path;
    void PWA.cacheCurrentNarration(path).then((result) => {
      if (result?.ok !== false) cachedNarrationPath = path;
    }).finally(() => {
      if (pendingNarrationCachePath === path) pendingNarrationCachePath = null;
    });
  }

  function applyPwaUpdate() {
    const accepted = PWA?.applyUpdate?.({ reload: true });
    if (!accepted) {
      elements.offlineStatus.textContent = "当前没有等待应用的完整更新。";
      return;
    }
    elements.updateAppButton.disabled = true;
    elements.updateAppButton.textContent = "正在切换版本…";
    elements.offlineStatus.textContent = "正在切换到已完整缓存的新版本，页面即将重新载入。";
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function checkForNewDay() {
    if (!ensureCurrentDay(new Date())) return;
    showToast("新的一天到了，今日五项精选已经更新。", false);
    elements.liveRegion.textContent = "新的一天到了，图书、电影、城市、德语与医学科普均已更新。";
  }

  function nextSafeCounter(value) {
    const safe = State.safeSequence(value);
    return safe >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : safe + 1;
  }

  function randomUnit() {
    const cryptoObject = globalThis.crypto;
    if (!cryptoObject || typeof cryptoObject.getRandomValues !== "function") {
      const error = new Error("WEB_CRYPTO_UNAVAILABLE");
      error.code = "WEB_CRYPTO_UNAVAILABLE";
      throw error;
    }
    const value = new Uint32Array(1);
    try {
      cryptoObject.getRandomValues(value);
    } catch (_error) {
      const error = new Error("WEB_CRYPTO_UNAVAILABLE");
      error.code = "WEB_CRYPTO_UNAVAILABLE";
      throw error;
    }
    return value[0] / 0x100000000;
  }

  function bumpRecordVersion(record) {
    record.version = State.incrementVersion(record.version ?? record.revision);
    record.revision = nextSafeCounter(record.revision);
  }

  function invalidatePendingUndo(type, record) {
    if (pendingUndo?.type !== type) return false;
    const invalid = State.compareVersions(record.version, pendingUndo.version) > 0 ||
      record.currentId !== pendingUndo.replacementId;
    if (!invalid) return false;
    pendingUndo = null;
    hideToast();
    return true;
  }

  function trapDialogFocus(event) {
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const focusable = [...dialog.querySelectorAll("button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])")]
      .filter((element) => !element.hidden && element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function itemTitle(item) {
    if (item.type === "city") return item.cityZh || item.title;
    if (item.type === "german") return item.german;
    return item.title;
  }

  function seriesInstallmentLabel(value) {
    const label = String(value ?? "").trim();
    return /^\d+$/.test(label) ? `第 ${label} 部` : label;
  }

  function itemSubtitle(item) {
    if (item.type === "book" || item.type === "movie") return `${item.creator} · ${displayYearLabel(item)}`;
    if (item.type === "city") return `${item.countryZh} · ${item.region}`;
    if (item.type === "german") return `${item.level} · ${item.chinese}`;
    return `${item.topic} · ${item.sourceName}`;
  }

  function displayYearLabel(item) {
    return Number(item?.year) > 0 ? String(item.year) : "年份待核";
  }

  function safeColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#0b504e";
  }

  function safeImageUrl(value) {
    const url = String(value || "");
    return /^(https:\/\/|\.\/assets\/)/.test(url) ? escapeAttribute(url) : "./assets/favicon.svg";
  }

  function resolveVisual(item, type) {
    return Visuals?.resolve?.(item, type, {
      dataSaver: appearanceState?.dataSaver === true,
      safeMode: globalThis.DAILY_ATLAS_SAFE_MODE === true
    }) || Object.freeze({
      candidates: Object.freeze([]),
      sourceKind: "local-editorial",
      cachePolicy: "same-origin-shell",
      pendingLabel: "本地编辑视觉 · 原创主题插画",
      loadedLabel: "本地编辑视觉 · 原创主题插画",
      fallbackLabel: "本地编辑视觉 · 原创主题插画",
      sourcePage: `./sources-and-licenses.html#${type === "city" ? "city-images" : "media-images"}`,
      fallbackSourcePage: `./sources-and-licenses.html#${type === "city" ? "city-images" : "media-images"}`
    });
  }

  function editorialArtHtml(item, type) {
    const art = Visuals?.editorialArt?.(item, type);
    return art && /^<svg class="editorial-art"(?:\s|>)/.test(String(art.markup || "")) ? art.markup : "";
  }

  function visualImageHtml(visual, className, options) {
    const candidates = Array.isArray(visual?.candidates) ? visual.candidates.filter(Boolean) : [];
    if (!candidates.length) return "";
    const lazy = options?.lazy === true;
    return `<img class="${escapeAttribute(className)} daily-visual-image" src="${escapeAttribute(candidates[0])}" data-visual-candidates="${escapeAttribute(JSON.stringify(candidates))}" data-visual-index="0" alt="${escapeAttribute(visual.alt || "内容配图")}" loading="${lazy ? "lazy" : "eager"}" fetchpriority="${lazy ? "auto" : "high"}" decoding="async" referrerpolicy="no-referrer" hidden />`;
  }

  function visualCreditHtml(visual) {
    const candidates = Array.isArray(visual?.candidates) ? visual.candidates.filter(Boolean) : [];
    const initialState = candidates.length ? "pending" : "fallback";
    const pendingLabel = String(visual?.pendingLabel || visual?.provider || "图片来源待核");
    const loadedLabel = String(visual?.loadedLabel || visual?.provider || pendingLabel);
    const fallbackLabel = String(visual?.fallbackLabel || "本地编辑视觉");
    if (!fallbackLabel) return "";
    const defaultHref = safeVisualLink(visual?.sourcePage);
    const statusMeta = Object.fromEntries(["pending", "loaded", "fallback"].map((state) => {
      const stateName = `${state[0].toUpperCase()}${state.slice(1)}`;
      const href = safeVisualLink(visual?.[`${state}SourcePage`] || defaultHref);
      const external = href.startsWith("https://");
      const title = String(visual?.[`${state}SourceTitle`] || (external ? "查看当前图片来源与许可" : "查看图片来源说明"));
      return [state, { href, external, title, stateName }];
    }));
    const current = statusMeta[initialState];
    const label = initialState === "pending" ? pendingLabel : fallbackLabel;
    const stateAttributes = Object.entries(statusMeta).map(([state, meta]) => `data-visual-${state}-href="${escapeAttribute(meta.href)}" data-visual-${state}-external="${meta.external}" data-visual-${state}-title="${escapeAttribute(meta.title)}"`).join(" ");
    return `<a class="visual-credit" data-visual-status data-visual-state="${initialState}" data-visual-pending-label="${escapeAttribute(pendingLabel)}" data-visual-loaded-label="${escapeAttribute(loadedLabel)}" data-visual-fallback-label="${escapeAttribute(fallbackLabel)}" ${stateAttributes} href="${escapeAttribute(current.href)}" title="${escapeAttribute(current.title)}" ${current.external ? 'target="_blank" rel="noreferrer"' : ""}>${escapeHtml(label)}</a>`;
  }

  function safeVisualLink(value) {
    const url = String(value || "");
    if (/^https:\/\//.test(url)) return url;
    if (/^\.\/sources-and-licenses\.html(?:#[a-z0-9-]+)?$/.test(url)) return url;
    if (/^\.\/city-credits\.html#city-[a-z0-9-]+$/.test(url)) return url;
    return "./sources-and-licenses.html";
  }

  function safeLink(value) {
    const url = String(value || "");
    return /^https:\/\//.test(url) ? escapeAttribute(url) : "#";
  }

  function externalLinkIcon() {
    return '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value);
  }
})();
