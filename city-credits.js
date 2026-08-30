(function (root) {
  "use strict";

  function externalLink(href, label) {
    const link = document.createElement("a");
    link.textContent = label;
    if (/^https:\/\//.test(String(href || ""))) {
      link.href = href;
      link.target = "_blank";
      link.rel = "noreferrer";
    }
    return link;
  }

  function render() {
    const summary = document.querySelector("#cityCreditSummary");
    const list = document.querySelector("#cityCreditList");
    const manifest = root.DAILY_ATLAS_CITY_VISUALS;
    const items = Array.isArray(manifest?.items) ? manifest.items : [];
    if (manifest?.schemaVersion !== 1 || manifest?.count !== 200 || items.length !== 200) {
      summary.textContent = "城市图清单未完整载入；当前页面不把不完整结果标记为正式署名清单。";
      summary.dataset.status = "error";
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const [index, item] of items.entries()) {
      const article = document.createElement("article");
      article.className = "city-credit-item";
      const heading = document.createElement("h3");
      heading.textContent = `${index + 1}. ${item.id}`;
      const attribution = document.createElement("p");
      attribution.textContent = String(item.attribution || `${item.author || "作者待核"} · ${item.licenseName || "许可待核"}`);
      const metadata = document.createElement("p");
      metadata.className = "city-credit-meta";
      metadata.append(externalLink(item.sourcePage, "Commons 文件页"), document.createTextNode(" · "), externalLink(item.licenseUrl, item.licenseName || "许可原文"));
      const integrity = document.createElement("code");
      integrity.textContent = `${item.path} · ${item.width}×${item.height} · ${item.bytes} bytes · SHA-256 ${item.sha256}`;
      article.append(heading, attribution, metadata, integrity);
      fragment.append(article);
    }
    list.replaceChildren(fragment);
    summary.textContent = "清单已完整载入：200 张同源 WebP 均有作者、许可、来源文件页、尺寸、字节数与 SHA-256。";
    summary.dataset.status = "ok";
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render, { once: true });
  else render();
})(globalThis);
