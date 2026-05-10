const BASE_URL = "https://www3.animeflv.net";

/**
 * Nuvio entrypoint.
 *
 * Primera versión:
 * - Espera IDs tipo: animeflv:naruto
 * - Para episodios usa season/episode desde Nuvio
 * - AnimeFLV normalmente usa episodio lineal, así que usamos episode directamente
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    if (mediaType !== "tv") {
      return [];
    }

    const parsed = parseAnimeFLVId(tmdbId);

    if (!parsed) {
      console.log("[AnimeFLV] ID no compatible:", tmdbId);
      return [];
    }

    const animeSlug = parsed.slug;
    const episodeNumber = Number(episode || parsed.episode || 1);

    if (!animeSlug || !episodeNumber) {
      console.log("[AnimeFLV] Faltan slug o episodio:", {
        animeSlug,
        episodeNumber
      });
      return [];
    }

    console.log("[AnimeFLV] Buscando streams:", {
      animeSlug,
      episodeNumber
    });

    const watchUrl = `${BASE_URL}/ver/${animeSlug}-${episodeNumber}`;
    const html = await fetchText(watchUrl);

    const videoOptions = extractVideoOptions(html);

    if (!videoOptions.length) {
      console.log("[AnimeFLV] No se encontraron opciones de video");
      return [];
    }

    const streams = [];

    for (const option of videoOptions) {
      const resolved = await resolveOption(option);

      if (resolved && resolved.url) {
        streams.push({
          name: resolved.name || option.server || "AnimeFLV",
          title: resolved.title || buildTitle(option),
          url: resolved.url,
          quality: resolved.quality || "Unknown",
          language: "es",
          subtitles: [],
          headers: resolved.headers || {
            Referer: BASE_URL,
            "User-Agent": defaultUserAgent()
          }
        });
      }
    }

    console.log("[AnimeFLV] Streams encontrados:", streams.length);

    return streams;
  } catch (error) {
    console.log("[AnimeFLV] Error en getStreams:", error && error.message ? error.message : error);
    return [];
  }
}

function parseAnimeFLVId(id) {
  if (!id || typeof id !== "string") {
    return null;
  }

  // Formato esperado: animeflv:naruto
  if (id.startsWith("animeflv:")) {
    const value = id.replace("animeflv:", "").trim();

    // Permite opcionalmente animeflv:naruto:12
    const parts = value.split(":");

    return {
      slug: parts[0],
      episode: parts[1] ? Number(parts[1]) : null
    };
  }

  return null;
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": defaultUserAgent(),
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": BASE_URL,
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} en ${url}`);
  }

  return await response.text();
}

function defaultUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
}

/**
 * AnimeFLV suele exponer opciones en algo parecido a:
 * var videos = {"SUB":[{"server":"yu","title":"YourUpload","code":"..."}]}
 */
function extractVideoOptions(html) {
  const options = [];

  const videosMatch = html.match(/var\s+videos\s*=\s*(\{[\s\S]*?\});/);

  if (!videosMatch || !videosMatch[1]) {
    return options;
  }

  let videos;

  try {
    videos = JSON.parse(videosMatch[1]);
  } catch (error) {
    console.log("[AnimeFLV] No se pudo parsear var videos:", error.message);
    return options;
  }

  const groups = ["SUB", "LAT", "ESP", "RAW"];

  for (const group of groups) {
    if (Array.isArray(videos[group])) {
      for (const item of videos[group]) {
        options.push({
          ...item,
          langGroup: group
        });
      }
    }
  }

  return options;
}

function buildTitle(option) {
  const parts = [];

  parts.push("AnimeFLV");

  if (option.langGroup) {
    parts.push(option.langGroup);
  }

  if (option.server) {
    parts.push(option.server);
  }

  if (option.title) {
    parts.push(option.title);
  }

  return parts.join(" - ");
}

async function resolveOption(option) {
  const server = String(option.server || "").toLowerCase();
  const code = option.code || option.url || "";

  if (!code) {
    return null;
  }

  // A veces AnimeFLV ya entrega una URL directa o embebida.
  if (code.startsWith("http")) {
    return {
      name: option.title || option.server || "AnimeFLV",
      title: buildTitle(option),
      url: code,
      quality: guessQuality(code),
      headers: {
        Referer: BASE_URL,
        "User-Agent": defaultUserAgent()
      }
    };
  }

  // YourUpload
  if (server.includes("yourupload") || server === "yu") {
    return await resolveYourUpload(code, option);
  }

  // MP4Upload
  if (server.includes("mp4upload") || server === "mp4") {
    return await resolveMp4Upload(code, option);
  }

  // Fallback: si no sabemos resolverlo, intenta armar embed.
  const fallbackUrl = guessEmbedUrl(server, code);

  if (fallbackUrl) {
    return {
      name: option.title || option.server || "AnimeFLV",
      title: `${buildTitle(option)} - embed`,
      url: fallbackUrl,
      quality: "Embed",
      headers: {
        Referer: BASE_URL,
        "User-Agent": defaultUserAgent()
      }
    };
  }

  return null;
}

function guessEmbedUrl(server, code) {
  if (!server || !code) {
    return null;
  }

  if (server === "yu") {
    return `https://www.yourupload.com/embed/${code}`;
  }

  if (server === "mp4") {
    return `https://www.mp4upload.com/embed-${code}.html`;
  }

  return null;
}

async function resolveYourUpload(code, option) {
  const embedUrl = code.startsWith("http")
    ? code
    : `https://www.yourupload.com/embed/${code}`;

  const html = await fetchText(embedUrl, {
    headers: {
      Referer: BASE_URL
    }
  });

  // Patrones comunes de YourUpload
  const fileMatch =
    html.match(/file\s*:\s*["']([^"']+)["']/) ||
    html.match(/jwplayer\([^)]*\)\.setup\(\s*\{[\s\S]*?file\s*:\s*["']([^"']+)["']/);

  if (!fileMatch || !fileMatch[1]) {
    return {
      name: "YourUpload",
      title: `${buildTitle(option)} - embed`,
      url: embedUrl,
      quality: "Embed",
      headers: {
        Referer: embedUrl,
        "User-Agent": defaultUserAgent()
      }
    };
  }

  return {
    name: "YourUpload",
    title: buildTitle(option),
    url: fileMatch[1],
    quality: guessQuality(fileMatch[1]),
    headers: {
      Referer: embedUrl,
      "User-Agent": defaultUserAgent()
    }
  };
}

async function resolveMp4Upload(code, option) {
  const embedUrl = code.startsWith("http")
    ? code
    : `https://www.mp4upload.com/embed-${code}.html`;

  const html = await fetchText(embedUrl, {
    headers: {
      Referer: BASE_URL
    }
  });

  const fileMatch =
    html.match(/player\.src\(\s*\{\s*type\s*:\s*["']video\/mp4["']\s*,\s*src\s*:\s*["']([^"']+)["']/) ||
    html.match(/src\s*:\s*["']([^"']+\.mp4[^"']*)["']/) ||
    html.match(/file\s*:\s*["']([^"']+\.mp4[^"']*)["']/);

  if (!fileMatch || !fileMatch[1]) {
    return {
      name: "MP4Upload",
      title: `${buildTitle(option)} - embed`,
      url: embedUrl,
      quality: "Embed",
      headers: {
        Referer: embedUrl,
        "User-Agent": defaultUserAgent()
      }
    };
  }

  return {
    name: "MP4Upload",
    title: buildTitle(option),
    url: fileMatch[1],
    quality: guessQuality(fileMatch[1]),
    headers: {
      Referer: embedUrl,
      "User-Agent": defaultUserAgent()
    }
  };
}

function guessQuality(url) {
  const text = String(url).toLowerCase();

  if (text.includes("1080")) return "1080p";
  if (text.includes("720")) return "720p";
  if (text.includes("480")) return "480p";
  if (text.includes("360")) return "360p";

  return "Unknown";
}

// Export común para runtimes tipo Nuvio.
if (typeof module !== "undefined") {
  module.exports = {
    getStreams
  };
}
