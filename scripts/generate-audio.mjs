#!/usr/bin/env node
// Offline listening-audio generator (docs/AUDIO.md). Walks content/ for listening text — lesson `listen`
// exercises (`prompt.fallback_text`) and exam listening questions (`prompt.script`) — synthesises each text once
// with Gemini TTS, uploads a WAV to the public Storage bucket `content-audio` (service role) and writes the
// deterministic `audio_asset_id` back into the YAML (only the value's bytes are replaced, so comments and
// formatting stay as they are). Every uploaded file is also recorded in supabase/content-audio-manifest.json and
// in public.audio_assets.
//
//   pnpm audio:plan                                  # default: dry run, prints the plan, no network, no writes
//   pnpm audio:check                                 # fail on stale / unknown audio ids in content/
//   pnpm audio:generate -- --lang ko --limit 10      # = --apply: generate, upload, write back
//
// Flags: --apply | --dry-run (default) | --check, --lang en,ko, --limit N (max new syntheses), --concurrency N,
//        --rpm N (request starts per minute, free tier friendly), --model ID, --api interactions|generate-content,
//        --force (re-synthesise even if the asset exists), --out DIR (also keep local WAV copies),
//        --content DIR, --manifest FILE.
// Env (--apply only): GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Secrets are never logged.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '..');
export const DEFAULT_CONTENT_DIR = join(REPO_ROOT, 'content');
export const DEFAULT_MANIFEST = join(REPO_ROOT, 'supabase', 'content-audio-manifest.json');

// Keep in sync with packages/shared/src/content/audio.ts (generate-audio.test.mjs asserts it).
export const AUDIO_BUCKET = 'content-audio';
export const AUDIO_ASSET_EXT = 'wav';
export const AUDIO_ASSET_MIME = 'audio/wav';
export const AUDIO_ASSET_ID_RE = /^([a-z]{2})-([0-9a-f]{32})$/;

export const DEFAULT_MODEL = 'gemini-3.8-flash-tts';
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const SAMPLE_RATE = 24000;
/** Style hint sent as speech metadata (interactions API only; never spoken). Changing it does not change ids. */
export const SPEECH_STYLE = 'clear, natural and unhurried, like a recording for language learners';

/**
 * Prebuilt Gemini voices per language. `single` reads unlabelled text; `female`/`male` voice dialogue speakers
 * whose label says so (여자/Woman…); `a`/`b` voice other labels in order of appearance. Changing a voice changes the
 * ids of the affected texts, so they are regenerated on the next run.
 */
export const VOICES = {
  en: { single: 'Kore', female: 'Kore', male: 'Charon', a: 'Kore', b: 'Charon' },
  ko: { single: 'Kore', female: 'Kore', male: 'Charon', a: 'Kore', b: 'Charon' },
  ja: { single: 'Kore', female: 'Kore', male: 'Charon', a: 'Kore', b: 'Charon' },
};

const FEMALE = /^(woman|women|female|girl|lady|mother|mom|mum|w|f|여자|여|여성|엄마|어머니|女|女性|女の人|母)$/i;
const MALE = /^(man|men|male|boy|gentleman|father|dad|m|남자|남|남성|아빠|아버지|男|男性|男の人|父)$/i;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** NFC, unified newlines, single spaces, trimmed lines, no blank-line runs. This exact string is hashed. */
export function normalizeText(text) {
  return String(text)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+/g, ' ').trim())
    .filter((l, i, all) => l !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n')
    .trim();
}

export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Deterministic asset id: `<lang>-<first 32 hex of sha256(lang \n voiceKey \n normalised text)>`. */
export function audioAssetId(lang, voiceKey, text) {
  if (!/^[a-z]{2}$/.test(lang)) throw new Error(`bad lang: ${lang}`);
  return `${lang}-${sha256Hex(`${lang}\n${voiceKey}\n${normalizeText(text)}`).slice(0, 32)}`;
}

export function audioAssetPath(id) {
  const m = AUDIO_ASSET_ID_RE.exec(id ?? '');
  return m ? `${m[1]}/${id}.${AUDIO_ASSET_EXT}` : null;
}

export function publicAudioUrl(supabaseUrl, id) {
  const path = audioAssetPath(id);
  return path ? `${supabaseUrl.replace(/\/+$/, '')}/storage/v1/object/public/${AUDIO_BUCKET}/${path}` : null;
}

/** `Speaker: line` per line (ASCII or full-width colon) → turns; null when any line is unlabelled. */
export function parseDialogue(text) {
  const lines = normalizeText(text).split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  const turns = [];
  for (const line of lines) {
    const m = /^([^:：\n]{1,20}?)\s*[:：]\s*(\S.*)$/.exec(line);
    if (!m || /^\d+$/.test(m[1]) || /https?$/i.test(m[1])) return null;
    turns.push({ speaker: m[1].trim(), text: m[2].trim() });
  }
  return { turns, speakers: [...new Set(turns.map((t) => t.speaker))] };
}

export function speakerGender(label) {
  if (FEMALE.test(label)) return 'female';
  if (MALE.test(label)) return 'male';
  return null;
}

/**
 * How a text is spoken. Returns { mode: 'single', voice, text } or { mode: 'multi', speakers: [{label, alias, voice}],
 * turns: [{alias, text}] } plus `voiceKey`, the part of the id that names the voices.
 */
export function planSpeech(lang, rawText, voices = VOICES) {
  const v = voices[lang];
  if (!v) throw new Error(`no voices configured for ${lang}`);
  const text = normalizeText(rawText);
  const dialogue = parseDialogue(text);
  if (dialogue && dialogue.speakers.length === 1) {
    const g = speakerGender(dialogue.speakers[0]);
    const voice = g ? v[g] : v.single;
    return { mode: 'single', voice, voiceKey: voice, text: dialogue.turns.map((t) => t.text).join('\n') };
  }
  if (dialogue && dialogue.speakers.length === 2) {
    const used = new Set();
    const speakers = dialogue.speakers.map((label, i) => {
      const g = speakerGender(label);
      let voice = g ? v[g] : i === 0 ? v.a : v.b;
      if (used.has(voice)) voice = voice === v.a ? v.b : v.a; // two speakers never share a voice
      used.add(voice);
      return { label, alias: `Speaker${i + 1}`, voice };
    });
    const alias = new Map(speakers.map((s) => [s.label, s.alias]));
    return {
      mode: 'multi',
      speakers,
      voiceKey: speakers.map((s) => `${s.label}=${s.voice}`).join('|'),
      turns: dialogue.turns.map((t) => ({ alias: alias.get(t.speaker), text: t.text })),
    };
  }
  // Unlabelled text, or more than two speakers (the API voices at most two): one voice, labels kept as written
  // only when the text is not a dialogue.
  const spoken = dialogue ? dialogue.turns.map((t) => t.text).join('\n') : text;
  return { mode: 'single', voice: v.single, voiceKey: v.single, text: spoken };
}

/** RIFF/WAVE header + 16-bit PCM payload. */
export function pcmToWav(pcm, { sampleRate = SAMPLE_RATE, channels = 1, bitsPerSample = 16 } = {}) {
  const blockAlign = (channels * bitsPerSample) / 8;
  const h = Buffer.alloc(44);
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bitsPerSample, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Parses a PCM WAV (walking chunks); returns format + the raw PCM data. Throws on anything else. */
export function parseWav(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('not a RIFF/WAVE file');
  }
  let off = 12;
  let fmt = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    const body = off + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data before fmt');
      // Streaming encoders may leave 0 / 0xFFFFFFFF as the size: take the rest of the buffer.
      if (size === 0 || size === 0xffffffff || body + size > buf.length) size = buf.length - body;
      return { ...fmt, pcm: buf.subarray(body, body + size) };
    }
    off = body + size + (size % 2);
  }
  throw new Error('WAV without data chunk');
}

export function durationMs(pcmBytes, { sampleRate = SAMPLE_RATE, channels = 1, bitsPerSample = 16 } = {}) {
  return Math.round((pcmBytes / ((sampleRate * channels * bitsPerSample) / 8)) * 1000);
}

/** Normalises whatever the API returned (WAV or headerless L16) to our canonical WAV. */
export function toCanonicalWav(audio, mimeType = '') {
  if (audio.length >= 12 && audio.toString('ascii', 0, 4) === 'RIFF') {
    const w = parseWav(audio);
    if (w.format !== 1 || w.bitsPerSample !== 16) throw new Error(`unsupported WAV format ${w.format}/${w.bitsPerSample}`);
    const opts = { sampleRate: w.sampleRate, channels: w.channels, bitsPerSample: 16 };
    return { wav: pcmToWav(w.pcm, opts), duration_ms: durationMs(w.pcm.length, opts) };
  }
  if (mimeType && !/l16|pcm/i.test(mimeType)) throw new Error(`unsupported audio mime type: ${mimeType}`);
  const rate = Number(/rate=(\d+)/i.exec(mimeType)?.[1] ?? SAMPLE_RATE);
  const pcm = audio.length % 2 ? audio.subarray(0, audio.length - 1) : audio;
  return { wav: pcmToWav(pcm, { sampleRate: rate }), duration_ms: durationMs(pcm.length, { sampleRate: rate }) };
}

// ---------------------------------------------------------------------------
// Gemini requests
// ---------------------------------------------------------------------------

/** gemini-2.5 TTS previews only speak generateContent; newer models use the Interactions API. */
export function defaultApiFor(model) {
  return /^gemini-2\.5-/.test(model) ? 'generate-content' : 'interactions';
}

export function buildTtsRequest(api, model, plan) {
  if (api === 'interactions') {
    const meta = (alias) => ({ type: 'speech_metadata', ...(alias ? { speaker: alias } : {}), style: SPEECH_STYLE });
    const content =
      plan.mode === 'multi'
        ? plan.turns.map((t) => ({ type: 'text', text: t.text, annotations: [meta(t.alias)] }))
        : [{ type: 'text', text: plan.text, annotations: [meta(null)] }];
    return {
      url: `${GEMINI_BASE}/interactions`,
      body: {
        model,
        input: [{ type: 'user_input', content }],
        response_format: { type: 'audio' },
        generation_config: {
          speech_config:
            plan.mode === 'multi'
              ? { mode: 'conversational', speakers: plan.speakers.map((s) => ({ speaker: s.alias, voice: s.voice })) }
              : [{ voice: plan.voice }],
        },
      },
    };
  }
  if (api === 'generate-content') {
    const voice = (name) => ({ prebuiltVoiceConfig: { voiceName: name } });
    const text = plan.mode === 'multi' ? plan.turns.map((t) => `${t.alias}: ${t.text}`).join('\n') : plan.text;
    return {
      url: `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`,
      body: {
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig:
            plan.mode === 'multi'
              ? { multiSpeakerVoiceConfig: { speakerVoiceConfigs: plan.speakers.map((s) => ({ speaker: s.alias, voiceConfig: voice(s.voice) })) } }
              : { voiceConfig: voice(plan.voice) },
        },
      },
    };
  }
  throw new Error(`unknown api: ${api}`);
}

/** Base64 audio from either response shape → { audio: Buffer, mimeType }. */
export function extractAudio(json) {
  for (const step of [...(json?.steps ?? [])].reverse()) {
    const block = [...(step?.content ?? [])].reverse().find((c) => c?.type === 'audio' && typeof c.data === 'string');
    if (block) return { audio: Buffer.from(block.data, 'base64'), mimeType: block.mime_type ?? block.mimeType ?? '' };
  }
  for (const part of json?.candidates?.[0]?.content?.parts ?? []) {
    const d = part?.inlineData ?? part?.inline_data;
    if (d && typeof d.data === 'string') return { audio: Buffer.from(d.data, 'base64'), mimeType: d.mimeType ?? d.mime_type ?? '' };
  }
  throw new Error('no audio in TTS response');
}

// ---------------------------------------------------------------------------
// Content walk + YAML write-back
// ---------------------------------------------------------------------------

function walkYaml(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkYaml(full));
    else if (/\.ya?ml$/i.test(name)) out.push(full);
  }
  return out;
}

/** Language a content file belongs to: `<lang>/…` or `exams|diagnostic/<lang>/…`; null otherwise. */
export function fileLang(rel) {
  const parts = rel.split(/[\\/]/);
  if (/^[a-z]{2}$/.test(parts[0])) return parts[0];
  if ((parts[0] === 'exams' || parts[0] === 'diagnostic') && /^[a-z]{2}$/.test(parts[1] ?? '')) return parts[1];
  return null;
}

function scalarText(node) {
  return isScalar(node) && typeof node.value === 'string' ? node.value : null;
}

function audioSlot(prompt) {
  const pair = prompt.items.find((p) => isScalar(p.key) && p.key.value === 'audio_asset_id');
  if (!pair) return { present: false, current: null, range: null };
  if (!isScalar(pair.value)) return { present: true, current: null, range: null };
  const v = pair.value.value;
  return { present: true, current: v === null ? null : String(v), range: [pair.value.range[0], pair.value.range[1]] };
}

/**
 * Every listening text in one YAML source: lesson `exercises[type=listen].prompt.fallback_text` and exam
 * `questions[section=listening].prompt.script`.
 */
export function collectFromSource(src, { rel, lang }) {
  const doc = parseDocument(src);
  if (doc.errors.length > 0 || !isMap(doc.contents)) return [];
  const out = [];
  const visit = (seqKey, match, textKey, kind) => {
    const seq = doc.contents.get(seqKey, true);
    if (!isSeq(seq)) return;
    for (const node of seq.items) {
      if (!isMap(node) || !match(node)) continue;
      const prompt = node.get('prompt', true);
      if (!isMap(prompt)) continue;
      const text = scalarText(prompt.get(textKey, true));
      if (!text) continue;
      const itemLang = (kind === 'exam' && scalarText(prompt.get('stem_lang', true))) || lang;
      out.push({ rel, kind, key: scalarText(node.get('key', true)) ?? '?', lang: itemLang, text: normalizeText(text), ...audioSlot(prompt) });
    }
  };
  visit('exercises', (n) => n.get('type') === 'listen', 'fallback_text', 'lesson');
  visit('questions', (n) => n.get('section') === 'listening', 'script', 'exam');
  return out;
}

export function collectTargets(contentDir) {
  const out = [];
  for (const file of walkYaml(contentDir)) {
    const rel = relative(contentDir, file).split(sep).join('/');
    const lang = fileLang(rel);
    if (!lang) continue;
    out.push(...collectFromSource(readFileSync(file, 'utf8'), { rel, lang }).map((t) => ({ ...t, file })));
  }
  return out;
}

/** Replaces byte ranges [start, end) with ids, last first. Ids are plain YAML scalars (letters, digits, dash). */
export function applyYamlEdits(src, edits) {
  let out = src;
  for (const e of [...edits].sort((a, b) => b.range[0] - a.range[0])) {
    if (!AUDIO_ASSET_ID_RE.test(e.value)) throw new Error(`refusing to write non-id value ${e.value}`);
    out = out.slice(0, e.range[0]) + e.value + out.slice(e.range[1]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export function readManifest(path) {
  if (!existsSync(path)) return { version: 1, bucket: AUDIO_BUCKET, assets: {} };
  const m = JSON.parse(readFileSync(path, 'utf8'));
  return { version: 1, bucket: AUDIO_BUCKET, ...m, assets: { ...(m.assets ?? {}) } };
}

/** Adds/replaces entries; returns a new manifest with ids sorted (stable diffs). */
export function mergeManifest(manifest, entries) {
  const assets = { ...manifest.assets };
  for (const e of entries) {
    const { id, ...rest } = e;
    assets[id] = rest;
  }
  return { ...manifest, assets: Object.fromEntries(Object.keys(assets).sort().map((k) => [k, assets[k]])) };
}

export function writeManifest(path, manifest) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

/**
 * Groups targets by expected id. Status per id: `ok` (YAML already has it, manifest knows it), `writeback` (asset
 * known, YAML not pointing to it), `generate` (asset unknown). `stale` lists YAML ids that no longer match the text.
 */
export function buildPlan(targets, manifest, { langs = null, force = false, voices = VOICES } = {}) {
  const byId = new Map();
  const stale = [];
  const skipped = [];
  for (const t of targets) {
    if (langs && !langs.includes(t.lang)) continue;
    if (!voices[t.lang]) {
      skipped.push({ ...t, reason: `no voices for ${t.lang}` });
      continue;
    }
    if (!t.present || (t.current === null && !t.range)) {
      skipped.push({ ...t, reason: 'prompt has no `audio_asset_id: null` line to fill' });
      continue;
    }
    const speech = planSpeech(t.lang, t.text, voices);
    const id = audioAssetId(t.lang, speech.voiceKey, t.text);
    if (t.current !== null && t.current !== id) stale.push({ ...t, expected: id });
    const g = byId.get(id) ?? { id, lang: t.lang, text: t.text, speech, targets: [] };
    g.targets.push(t);
    byId.set(id, g);
  }
  const groups = [...byId.values()].map((g) => {
    const known = Boolean(manifest.assets[g.id]);
    const allSet = g.targets.every((t) => t.current === g.id);
    return { ...g, status: force || !known ? 'generate' : allSet ? 'ok' : 'writeback' };
  });
  return { groups, stale, skipped };
}

/** --check: problems that would serve wrong or missing audio. */
export function checkTargets(targets, manifest, voices = VOICES) {
  const problems = [];
  for (const t of targets) {
    if (t.current === null) continue;
    if (!AUDIO_ASSET_ID_RE.test(t.current)) {
      problems.push(`${t.rel} ${t.key}: audio_asset_id "${t.current}" is not a generated id`);
      continue;
    }
    if (!manifest.assets[t.current]) problems.push(`${t.rel} ${t.key}: ${t.current} is not in the audio manifest`);
    if (voices[t.lang]) {
      const expected = audioAssetId(t.lang, planSpeech(t.lang, t.text, voices).voiceKey, t.text);
      if (expected !== t.current) problems.push(`${t.rel} ${t.key}: stale audio (text or voice changed), run pnpm audio:generate`);
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Network (only with --apply)
// ---------------------------------------------------------------------------

export class FatalError extends Error {}

const sleepReal = (ms) => new Promise((r) => setTimeout(r, ms));

/** Seconds to wait from Retry-After or a google.rpc.RetryInfo `retryDelay: "30s"`. */
export function retryDelayMs(res, bodyText) {
  const ra = Number(res.headers?.get?.('retry-after'));
  if (Number.isFinite(ra) && ra > 0) return ra * 1000;
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(bodyText ?? '');
  return m ? Math.ceil(Number(m[1]) * 1000) : null;
}

/** Retries 429/5xx/network errors with exponential backoff; a daily-quota 429 aborts the run. */
export async function fetchWithRetry(fetchImpl, url, init, { retries = 5, baseMs = 2000, sleep = sleepReal, what = 'request' } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchImpl(url, init);
    } catch (err) {
      if (attempt >= retries) throw new Error(`${what}: network error (${err?.name ?? 'Error'})`, { cause: err });
      await sleep(baseMs * 2 ** attempt);
      continue;
    }
    if (res.ok) return res;
    const body = await res.text().catch(() => '');
    if (res.status === 429 && /per ?day|PerDay|daily/i.test(body)) throw new FatalError(`${what}: daily quota exhausted (429), try again after the quota resets`);
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(Math.max(retryDelayMs(res, body) ?? 0, baseMs * 2 ** attempt));
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new FatalError(`${what}: HTTP ${res.status} (check the key and its permissions)`);
    throw new Error(`${what}: HTTP ${res.status} ${body.slice(0, 300).replace(/\s+/g, ' ')}`);
  }
}

/** Spaces request starts at least 60000/rpm ms apart across all workers. */
export function rateLimiter(rpm, { now = Date.now, sleep = sleepReal } = {}) {
  const gap = rpm > 0 ? 60000 / rpm : 0;
  let next = 0;
  return async () => {
    const t = now();
    const at = Math.max(t, next);
    next = at + gap;
    if (at > t) await sleep(at - t);
  };
}

export async function synthesize({ fetchImpl, apiKey, api, model, speech, sleep }) {
  const { url, body } = buildTtsRequest(api, model, speech);
  const res = await fetchWithRetry(
    fetchImpl,
    url,
    { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) },
    { sleep, what: 'Gemini TTS' },
  );
  const { audio, mimeType } = extractAudio(await res.json());
  return toCanonicalWav(audio, mimeType);
}

export async function uploadAsset({ fetchImpl, supabaseUrl, serviceKey, id, wav, sleep }) {
  const base = supabaseUrl.replace(/\/+$/, '');
  const headers = { authorization: `Bearer ${serviceKey}`, apikey: serviceKey };
  await fetchWithRetry(
    fetchImpl,
    `${base}/storage/v1/object/${AUDIO_BUCKET}/${audioAssetPath(id)}`,
    { method: 'POST', headers: { ...headers, 'content-type': AUDIO_ASSET_MIME, 'cache-control': '31536000', 'x-upsert': 'true' }, body: wav },
    { sleep, what: 'Storage upload' },
  );
}

export async function recordAsset({ fetchImpl, supabaseUrl, serviceKey, row, sleep }) {
  const base = supabaseUrl.replace(/\/+$/, '');
  await fetchWithRetry(
    fetchImpl,
    `${base}/rest/v1/audio_assets?on_conflict=id`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
        'content-type': 'application/json',
        prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    },
    { sleep, what: 'audio_assets upsert' },
  );
}

/** HEAD on the public URL: size of an already uploaded file, or null. */
export async function remoteSize(fetchImpl, supabaseUrl, id) {
  try {
    const res = await fetchImpl(publicAudioUrl(supabaseUrl, id), { method: 'HEAD' });
    if (!res.ok) return null;
    const n = Number(res.headers.get('content-length'));
    return Number.isFinite(n) && n > 44 ? n : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

export function parseArgs(argv) {
  const opts = { mode: 'dry-run', langs: null, limit: Infinity, concurrency: 1, rpm: 3, model: null, api: null, force: false, out: null, content: DEFAULT_CONTENT_DIR, manifest: DEFAULT_MANIFEST };
  const value = (i, name) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`);
    return v;
  };
  const positive = (v, name) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
    return n;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') continue;
    else if (a === '--apply') opts.mode = 'apply';
    else if (a === '--dry-run') opts.mode = 'dry-run';
    else if (a === '--check') opts.mode = 'check';
    else if (a === '--force') opts.force = true;
    else if (a === '--lang') opts.langs = value(i++, a).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--limit') opts.limit = positive(value(i++, a), a);
    else if (a === '--concurrency') opts.concurrency = positive(value(i++, a), a);
    else if (a === '--rpm') opts.rpm = positive(value(i++, a), a);
    else if (a === '--model') opts.model = value(i++, a);
    else if (a === '--api') opts.api = value(i++, a);
    else if (a === '--out') opts.out = resolve(value(i++, a));
    else if (a === '--content') opts.content = resolve(value(i++, a));
    else if (a === '--manifest') opts.manifest = resolve(value(i++, a));
    else throw new Error(`unknown argument: ${a}`);
  }
  if (opts.api && !['interactions', 'generate-content'].includes(opts.api)) throw new Error('--api must be interactions or generate-content');
  return opts;
}

/** Removes any secret value from a message before it is printed. */
export function redact(message, secrets) {
  let out = String(message);
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join('***');
  return out;
}

function writeBack(groups, log) {
  const perFile = new Map();
  for (const g of groups) {
    for (const t of g.targets) {
      if (t.current === g.id || !t.range) continue;
      const list = perFile.get(t.file) ?? [];
      list.push({ range: t.range, value: g.id });
      perFile.set(t.file, list);
    }
  }
  for (const [file, edits] of perFile) {
    const src = readFileSync(file, 'utf8');
    writeFileSync(file, applyYamlEdits(src, edits));
    log(`  wrote ${edits.length} audio id(s) into ${relative(REPO_ROOT, file).split(sep).join('/')}`);
  }
  return [...perFile.values()].reduce((n, e) => n + e.length, 0);
}

export async function main(argv = process.argv.slice(2), { env = process.env, fetchImpl = globalThis.fetch, log = console.log, sleep = sleepReal, now = () => new Date() } = {}) {
  const opts = parseArgs(argv);
  const manifest = readManifest(opts.manifest);
  const targets = collectTargets(opts.content);

  if (opts.mode === 'check') {
    const problems = checkTargets(opts.langs ? targets.filter((t) => opts.langs.includes(t.lang)) : targets, manifest);
    for (const p of problems) log(`✗ ${p}`);
    log(problems.length ? `${problems.length} audio problem(s)` : `audio ok: ${targets.filter((t) => t.current).length}/${targets.length} listening texts have audio`);
    return problems.length ? 1 : 0;
  }

  const plan = buildPlan(targets, manifest, { langs: opts.langs, force: opts.force });
  const toGenerate = plan.groups.filter((g) => g.status === 'generate');
  const selected = toGenerate.slice(0, opts.limit);
  const count = (s) => plan.groups.filter((g) => g.status === s).length;
  log(`listening texts: ${targets.length} in content/, ${plan.groups.length} distinct audio files after --lang/dedupe`);
  log(`  already done: ${count('ok')}, write-back only: ${count('writeback')}, to synthesise: ${toGenerate.length} (this run: ${selected.length})`);
  if (plan.stale.length) log(`  stale ids (text or voice changed, will be replaced): ${plan.stale.length}`);
  for (const s of plan.skipped) log(`  skip ${s.rel} ${s.key}: ${s.reason}`);

  const model = opts.model ?? env.GEMINI_TTS_MODEL ?? DEFAULT_MODEL;
  const api = opts.api ?? defaultApiFor(model);

  if (opts.mode === 'dry-run') {
    for (const g of selected) {
      const voices = g.speech.mode === 'multi' ? g.speech.speakers.map((s) => `${s.label}→${s.voice}`).join(', ') : g.speech.voice;
      log(`  + ${g.id} [${voices}] ${g.text.replace(/\n/g, ' / ').slice(0, 70)} (${g.targets.map((t) => t.key).join(', ')})`);
    }
    log(`dry run: nothing was sent or written (model ${model} via ${api}). Use --apply to generate.`);
    return 0;
  }

  const apiKey = env.GEMINI_API_KEY;
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const missing = [['GEMINI_API_KEY', apiKey], ['SUPABASE_URL', supabaseUrl], ['SUPABASE_SERVICE_ROLE_KEY', serviceKey]].filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    log(`missing env: ${missing.join(', ')}`);
    return 2;
  }
  const secrets = [apiKey, serviceKey];
  const say = (m) => log(redact(m, secrets));
  if (opts.out) mkdirSync(opts.out, { recursive: true });

  let current = manifest;
  const done = new Set(plan.groups.filter((g) => g.status !== 'generate').map((g) => g.id));
  const wait = rateLimiter(opts.rpm, { sleep });
  let fatal = null;
  let failures = 0;
  const queue = [...selected];

  const work = async () => {
    while (queue.length && !fatal) {
      const g = queue.shift();
      try {
        let entry;
        const existing = opts.force ? null : await remoteSize(fetchImpl, supabaseUrl, g.id);
        if (existing) {
          entry = { bytes: existing, duration_ms: durationMs(existing - 44) };
          say(`  = ${g.id} already in Storage, recorded`);
        } else {
          await wait();
          const { wav, duration_ms } = await synthesize({ fetchImpl, apiKey, api, model, speech: g.speech, sleep });
          await uploadAsset({ fetchImpl, supabaseUrl, serviceKey, id: g.id, wav, sleep });
          if (opts.out) {
            const p = join(opts.out, audioAssetPath(g.id));
            mkdirSync(dirname(p), { recursive: true });
            writeFileSync(p, wav);
          }
          entry = { bytes: wav.length, duration_ms };
          say(`  + ${g.id} ${(duration_ms / 1000).toFixed(1)}s ${g.targets.map((t) => t.key).join(', ')}`);
        }
        const meta = {
          lang: g.lang,
          voice: g.speech.voiceKey,
          model,
          path: audioAssetPath(g.id),
          duration_ms: Math.max(1, entry.duration_ms),
          bytes: entry.bytes,
          text_sha256: sha256Hex(g.text),
          created_at: now().toISOString(),
        };
        await recordAsset({
          fetchImpl,
          supabaseUrl,
          serviceKey,
          sleep,
          row: { id: g.id, lang: meta.lang, voice: meta.voice, model, storage_path: meta.path, mime_type: AUDIO_ASSET_MIME, duration_ms: meta.duration_ms, byte_size: meta.bytes, text_sha256: meta.text_sha256 },
        });
        current = mergeManifest(current, [{ id: g.id, ...meta }]);
        writeManifest(opts.manifest, current); // after every file: an interrupted run keeps what it paid for
        done.add(g.id);
      } catch (err) {
        if (err instanceof FatalError) fatal = err;
        else failures++;
        say(`  ✗ ${g.id} (${g.targets.map((t) => t.key).join(', ')}): ${err?.message ?? err}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, Math.max(1, queue.length)) }, work));

  const written = writeBack(plan.groups.filter((g) => done.has(g.id)), say);
  say(`done: ${done.size - (plan.groups.length - toGenerate.length)} new asset(s), ${written} YAML value(s) updated, ${failures} failure(s)`);
  if (fatal) say(`stopped early: ${fatal.message}`);
  if (written) say('next: pnpm content:check && pnpm audio:check, review the diff, commit content/ and the manifest, then import content.');
  return fatal || failures ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error(err?.message ?? err);
      process.exit(2);
    },
  );
}
