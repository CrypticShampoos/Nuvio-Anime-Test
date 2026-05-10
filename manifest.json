const BASE_URL = "https://www3.animeflv.net";

/**
 * Nuvio entrypoint - VERSIÓN DE TEST A
 */
async function getStreams(tmdbId, mediaType, season, episode) {
  try {
    // --- MODO TEST HARDCODEADO ---
    // Ignoramos lo que Nuvio pida y forzamos Naruto Shippuden (slug: naruto-shippuden)
    const animeSlug = "naruto-shippuden"; 
    const episodeNumber = 1; 
    
    console.log("[AnimeFLV TEST] Iniciando prueba con:", { animeSlug, episodeNumber });
    // ----------------------------

    const watchUrl = `${BASE_URL}/ver/${animeSlug}-${episodeNumber}`;
    const html = await fetchText(watchUrl);

    if (!html.includes('var videos =')) {
      console.log("[AnimeFLV TEST] El HTML no contiene la variable 'videos'");
      return [];
    }

    const videoOptions = extractVideoOptions(html);

    if (!videoOptions.length) {
      console.log("[AnimeFLV TEST] No se encontraron opciones de video en el HTML");
      return [];
    }

    const streams = [];

    for (const option of videoOptions) {
      const resolved = await resolveOption(option);

      if (resolved && resolved.url) {
        streams.push({
          name: resolved.name || option.server || "AnimeFLV",
          title: `[TEST] ${resolved.title || buildTitle(option)}`,
          url: resolved.url,
          quality: resolved.quality || "Unknown",
          language: "es",
          headers: resolved.headers || {
            Referer: BASE_URL,
            "User-Agent": defaultUserAgent()
          }
        });
      }
    }

    console.log("[AnimeFLV TEST] Streams encontrados:", streams.length);
    return streams;

  } catch (error) {
    console.log("[AnimeFLV TEST] Error crítico:", error.message);
    return [];
  }
}

/** 
 * Las funciones de apoyo se mantienen igual para validar que funcionen 
 */

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": defaultUserAgent(),
      "Referer": BASE_URL,
      ...(options.headers || {})
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

function defaultUserAgent() {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
}

function extractVideoOptions(html) {
  const options = [];
  const videosMatch = html.match(/var\s+videos\s*=\s*(\{[\s\S]*?\});/);
  if (!videosMatch || !videosMatch[1]) return options;

  try {
    const videos = JSON.parse(videosMatch[1]);
    const groups = ["SUB", "LAT", "ESP"];
    for (const group of groups) {
      if (Array.isArray(videos[group])) {
        for (const item of videos[group]) {
          options.push({ ...item, langGroup: group });
        }
      }
    }
  } catch (e) { console.log("Error JSON:", e.message); }
  return options;
}

function buildTitle(option) {
  return `AnimeFLV - ${option.langGroup || ""} - ${option.server || ""}`;
}

async function resolveOption(option) {
  const server = String(option.server).toLowerCase();
  const code = option.code || option.url || "";
  if (!code) return null;

  if (server === "yu") return await resolveYourUpload(code, option);
  if (server === "mp4") return await resolveMp4Upload(code, option);
  
  return null; // Por ahora ignoramos el resto para no saturar el test
}

async function resolveYourUpload(code, option) {
  const embed = `https://www.yourupload.com/embed/${code}`;
  return { name: "YourUpload", title: buildTitle(option), url: embed, quality: "Embed" };
}

async function resolveMp4Upload(code, option) {
  const embed = `https://www.mp4upload.com/embed-${code}.html`;
  return { name: "MP4Upload", title: buildTitle(option), url: embed, quality: "Embed" };
}

if (typeof module !== "undefined") {
  module.exports = { getStreams };
}
