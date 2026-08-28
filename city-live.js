(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.DailyAtlasCityLive = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const CACHE_PREFIX = "dailyAtlas.cityLive.v1.";
  const CACHE_TTL_MS = 30 * 60 * 1000;
  const DEFAULT_TIMEOUT_MS = 8000;
  const SOURCE_NAME = "Open-Meteo";
  const SOURCE_URL = "https://open-meteo.com/en/docs";
  const PRIVACY_BOUNDARY = "实时天气只在用户主动请求后连接 Open-Meteo，并会向该服务暴露网络地址和所选城市坐标；缓存超过 30 分钟后会明确标为过期。";
  const memoryCache = new Map();

  function defaultStorage() {
    try { return root.localStorage || null; } catch (_error) { return null; }
  }

  const WEATHER_LABELS = Object.freeze({
    0: "晴朗", 1: "大致晴朗", 2: "局部多云", 3: "阴天",
    45: "有雾", 48: "雾凇", 51: "轻微毛毛雨", 53: "毛毛雨", 55: "较强毛毛雨",
    56: "轻微冻毛毛雨", 57: "较强冻毛毛雨", 61: "小雨", 63: "中雨", 65: "大雨",
    66: "轻微冻雨", 67: "较强冻雨", 71: "小雪", 73: "中雪", 75: "大雪", 77: "霰",
    80: "小阵雨", 81: "中阵雨", 82: "强阵雨", 85: "小阵雪", 86: "强阵雪",
    95: "雷暴", 96: "雷暴伴小冰雹", 99: "雷暴伴强冰雹"
  });

  function finiteNumber(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
    return number;
  }

  function normalizeCity(city) {
    if (!city || typeof city !== "object") throw new TypeError("city is required");
    const id = String(city.id || "").trim();
    const latitude = finiteNumber(city.coordinates?.latitude ?? city.latitude, "latitude");
    const longitude = finiteNumber(city.coordinates?.longitude ?? city.longitude, "longitude");
    const timezone = String(city.timezone || "auto").trim() || "auto";
    if (!id) throw new TypeError("city.id is required");
    if (latitude < -90 || latitude > 90) throw new RangeError("latitude is out of range");
    if (longitude < -180 || longitude > 180) throw new RangeError("longitude is out of range");
    if (timezone !== "auto") {
      try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date()); }
      catch (_error) { throw new RangeError("city.timezone is invalid"); }
    }
    return Object.freeze({
      id,
      title: String(city.cityZh || city.title || id),
      latitude,
      longitude,
      timezone
    });
  }

  function buildWeatherUrl(city) {
    const normalized = normalizeCity(city);
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(normalized.latitude));
    url.searchParams.set("longitude", String(normalized.longitude));
    url.searchParams.set("current", "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m");
    url.searchParams.set("timezone", normalized.timezone);
    url.searchParams.set("forecast_days", "1");
    return url.toString();
  }

  function weatherLabel(code) {
    return WEATHER_LABELS[Number(code)] || `天气代码 ${String(code)}`;
  }

  function parseWeatherResponse(payload) {
    const current = payload?.current;
    if (!current || typeof current.time !== "string") throw new TypeError("Open-Meteo response has no current observation");
    const weatherCode = finiteNumber(current.weather_code, "weather_code");
    const data = {
      observedAt: current.time,
      temperatureC: finiteNumber(current.temperature_2m, "temperature_2m"),
      apparentTemperatureC: finiteNumber(current.apparent_temperature, "apparent_temperature"),
      precipitationMm: finiteNumber(current.precipitation, "precipitation"),
      windSpeedKmh: finiteNumber(current.wind_speed_10m, "wind_speed_10m"),
      weatherCode,
      weatherLabel: weatherLabel(weatherCode),
      timezone: String(payload.timezone || ""),
      timezoneAbbreviation: String(payload.timezone_abbreviation || ""),
      utcOffsetSeconds: Number.isFinite(Number(payload.utc_offset_seconds)) ? Number(payload.utc_offset_seconds) : null
    };
    return Object.freeze(data);
  }

  function cacheKey(cityId) {
    return `${CACHE_PREFIX}${encodeURIComponent(cityId)}`;
  }

  function storageGet(storage, key) {
    if (memoryCache.has(key)) return memoryCache.get(key);
    try { return storage?.getItem(key) || null; } catch (_error) { return null; }
  }

  function storageSet(storage, key, value) {
    memoryCache.set(key, value);
    try { storage?.setItem(key, value); } catch (_error) {}
  }

  function storageRemove(storage, key) {
    memoryCache.delete(key);
    try { storage?.removeItem(key); } catch (_error) {}
  }

  function safeParse(value) {
    try { return value ? JSON.parse(value) : null; } catch (_error) { return null; }
  }

  function sameCity(record, city) {
    return record?.schemaVersion === 1 && record.cityId === city.id &&
      Number(record.latitude) === city.latitude && Number(record.longitude) === city.longitude &&
      record.requestedTimezone === city.timezone && record.data && typeof record.fetchedAt === "string";
  }

  function readCache(city, options) {
    const settings = options || {};
    const storage = settings.storage === undefined ? defaultStorage() : settings.storage;
    const record = safeParse(storageGet(storage, cacheKey(city.id)));
    if (!sameCity(record, city) || Number.isNaN(Date.parse(record.fetchedAt))) return null;
    try {
      const data = parseWeatherResponse({
        current: {
          time: record.data.observedAt,
          temperature_2m: record.data.temperatureC,
          apparent_temperature: record.data.apparentTemperatureC,
          precipitation: record.data.precipitationMm,
          weather_code: record.data.weatherCode,
          wind_speed_10m: record.data.windSpeedKmh
        },
        timezone: record.data.timezone,
        timezone_abbreviation: record.data.timezoneAbbreviation,
        utc_offset_seconds: record.data.utcOffsetSeconds
      });
      return { ...record, data };
    } catch (_error) {
      return null;
    }
  }

  function resultFromRecord(record, cacheStatus, now, error) {
    const ageMs = Math.max(0, now.getTime() - Date.parse(record.fetchedAt));
    return Object.freeze({
      cityId: record.cityId,
      cityTitle: record.cityTitle,
      sourceName: SOURCE_NAME,
      sourceUrl: SOURCE_URL,
      fetchedAt: record.fetchedAt,
      ageMs,
      cacheStatus,
      stale: cacheStatus === "stale-cache",
      data: record.data,
      error: error ? String(error) : null,
      boundary: PRIVACY_BOUNDARY
    });
  }

  async function fetchWeather(cityInput, options) {
    const city = normalizeCity(cityInput);
    const settings = options || {};
    const now = settings.now instanceof Date ? settings.now : new Date(settings.now || Date.now());
    if (Number.isNaN(now.getTime())) throw new RangeError("weather retrieval time is invalid");
    const cached = readCache(city, settings);
    const cachedAge = cached ? now.getTime() - Date.parse(cached.fetchedAt) : Infinity;
    if (!settings.force && cached && cachedAge >= 0 && cachedAge <= CACHE_TTL_MS) {
      const result = resultFromRecord(cached, "fresh-cache", now);
      dispatch(result);
      return result;
    }

    const fetchImpl = settings.fetchImpl || root.fetch;
    if (typeof fetchImpl !== "function") {
      if (cached) {
        const result = resultFromRecord(cached, "stale-cache", now, "network-unavailable");
        dispatch(result);
        return result;
      }
      throw new Error("Weather network access is unavailable");
    }

    const AbortControllerClass = root.AbortController || globalThis.AbortController;
    const controller = AbortControllerClass ? new AbortControllerClass() : null;
    const callerSignal = settings.signal || null;
    const abortFromCaller = () => controller?.abort(callerSignal.reason);
    callerSignal?.addEventListener?.("abort", abortFromCaller, { once: true });
    const timeoutMs = Number.isFinite(Number(settings.timeoutMs))
      ? Math.max(100, Number(settings.timeoutMs))
      : DEFAULT_TIMEOUT_MS;
    const timer = root.setTimeout?.(() => controller?.abort(new Error("weather-timeout")), timeoutMs);

    try {
      const response = await fetchImpl(buildWeatherUrl(city), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller?.signal || callerSignal || undefined
      });
      if (!response || !response.ok) throw new Error(`Open-Meteo returned HTTP ${response?.status || "unknown"}`);
      const data = parseWeatherResponse(await response.json());
      const record = {
        schemaVersion: 1,
        cityId: city.id,
        cityTitle: city.title,
        latitude: city.latitude,
        longitude: city.longitude,
        requestedTimezone: city.timezone,
        fetchedAt: now.toISOString(),
        data
      };
      const storage = settings.storage === undefined ? defaultStorage() : settings.storage;
      storageSet(storage, cacheKey(city.id), JSON.stringify(record));
      const result = resultFromRecord(record, "network", now);
      dispatch(result);
      return result;
    } catch (error) {
      if (cached) {
        const result = resultFromRecord(cached, "stale-cache", now, error?.name || error?.message || "weather-request-failed");
        dispatch(result);
        return result;
      }
      throw error;
    } finally {
      if (timer !== undefined) root.clearTimeout?.(timer);
      callerSignal?.removeEventListener?.("abort", abortFromCaller);
    }
  }

  function clearCache(cityId, options) {
    const id = String(cityId || "").trim();
    if (!id) return false;
    const storage = options?.storage === undefined ? defaultStorage() : options.storage;
    storageRemove(storage, cacheKey(id));
    return true;
  }

  function getLocalTime(cityInput, now) {
    const city = normalizeCity(cityInput);
    const date = now instanceof Date ? now : new Date(now || Date.now());
    const timezone = city.timezone === "auto" ? undefined : city.timezone;
    const formatter = new Intl.DateTimeFormat("zh-CN", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false
    });
    return Object.freeze({
      cityId: city.id,
      timezone: city.timezone,
      formatted: formatter.format(date),
      parts: Object.freeze(Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value])))
    });
  }

  function dispatch(result) {
    if (typeof root.CustomEvent !== "function" || typeof root.dispatchEvent !== "function") return;
    root.dispatchEvent(new root.CustomEvent("dailyatlascitylive", { detail: result }));
  }

  async function fetchCurrent(city, options) {
    const result = await fetchWeather(city, options);
    const data = result.data;
    return Object.freeze({
      summary: `${data.weatherLabel}，${data.temperatureC}°C，体感 ${data.apparentTemperatureC}°C；风速 ${data.windSpeedKmh} km/h，降水 ${data.precipitationMm} mm。`,
      retrievedAt: result.fetchedAt,
      cached: result.cacheStatus !== "network",
      stale: result.stale,
      sourceName: result.sourceName,
      sourceUrl: result.sourceUrl,
      details: result
    });
  }

  return Object.freeze({
    CACHE_TTL_MS,
    SOURCE_NAME,
    SOURCE_URL,
    PRIVACY_BOUNDARY,
    normalizeCity,
    buildWeatherUrl,
    parseWeatherResponse,
    weatherLabel,
    fetchCurrent,
    fetchWeather,
    clearCache,
    getLocalTime
  });
});
