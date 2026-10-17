// Run with: node --import tsx --test scripts/generate-audio.test.mjs (tsx only for the shared-contract parity test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'yaml';
import * as shared from '@linguo/shared';
import {
  AUDIO_ASSET_ID_RE,
  AUDIO_BUCKET,
  FatalError,
  applyYamlEdits,
  audioAssetId,
  audioAssetPath,
  buildPlan,
  buildTtsRequest,
  checkTargets,
  collectFromSource,
  collectTargets,
  defaultApiFor,
  durationMs,
  extractAudio,
  fetchWithRetry,
  fileLang,
  main,
  mergeManifest,
  normalizeText,
  parseArgs,
  parseDialogue,
  parseWav,
  pcmToWav,
  VOICES,
  planSpeech,
  publicAudioUrl,
  rateLimiter,
  readManifest,
  redact,
  retryDelayMs,
  toCanonicalWav,
} from './generate-audio.mjs';

const LESSON = `# a comment that must survive
schema_version: 1
key: en:lesson:x
exercises:
  - key: en:exercise:x-mcq
    type: mcq
    prompt: { question: Q }
  - key: en:exercise:x-listen
    type: listen
    prompt:
      audio_asset_id: null   # filled by generate-audio
      fallback_text: Remote workers tend to take fewer sick days.
      options:
        - { id: a, text: "Một", lang: vi }
  - key: en:exercise:x-listen-2
    type: listen
    prompt:
      audio_asset_id: null
      fallback_text: "Remote workers  tend to take fewer sick days."
`;

const EXAM = `schema_version: 1
language: ko
questions:
  - key: ko:examq:l01
    section: listening
    prompt:
      stem: 어디입니까?
      stem_lang: ko
      audio_asset_id: null
      script: |-
        남자: 이 책을 빌리고 싶어요.
        여자: 학생증을 보여 주세요.
  - key: ko:examq:r01
    section: reading
    prompt:
      stem: 읽으세요
      stem_lang: ko
`;

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gen-audio-'));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

test('constants match the shared contract', () => {
  assert.equal(AUDIO_BUCKET, shared.AUDIO_BUCKET);
  assert.equal(AUDIO_ASSET_ID_RE.source, shared.AUDIO_ASSET_ID_RE.source);
  const id = audioAssetId('ko', 'Kore', '안녕하세요');
  assert.equal(audioAssetPath(id), shared.audioAssetPath(id));
  assert.equal(publicAudioUrl('https://x.supabase.co/', id), shared.audioAssetUrl(id, 'https://x.supabase.co/'));
});

test('ids are deterministic and depend on lang, voice and normalised text', () => {
  const a = audioAssetId('en', 'Kore', 'Hello there.');
  assert.match(a, /^en-[0-9a-f]{32}$/);
  assert.equal(audioAssetId('en', 'Kore', '  Hello there.\r\n'), a);
  assert.notEqual(audioAssetId('en', 'Puck', 'Hello there.'), a);
  assert.notEqual(audioAssetId('en', 'Kore', 'Hello there!'), a);
  assert.match(audioAssetId('ko', 'Kore', 'Hello there.'), /^ko-/);
  // NFC: decomposed and precomposed Hangul hash the same.
  assert.equal(audioAssetId('ko', 'Kore', '한'.normalize('NFD')), audioAssetId('ko', 'Kore', '한'));
  assert.throws(() => audioAssetId('EN', 'Kore', 'x'));
});

test('normalizeText trims lines and collapses blank runs', () => {
  assert.equal(normalizeText(' a \r\n\r\n\r\n b \n'), 'a\n\nb');
});

test('parseDialogue and planSpeech', () => {
  assert.equal(parseDialogue('Remote workers tend to take fewer sick days.'), null);
  assert.equal(parseDialogue('Time: 10:30 then\nno label here'), null);
  const d = parseDialogue('남자: 안녕하세요.\n여자： 네, 안녕하세요.');
  assert.deepEqual(d.speakers, ['남자', '여자']);

  const multi = planSpeech('ko', '남자: 이 책을 빌리고 싶어요.\n여자: 학생증을 보여 주세요.');
  assert.equal(multi.mode, 'multi');
  assert.deepEqual(multi.speakers.map((s) => [s.label, s.alias, s.voice]), [['남자', 'Speaker1', 'Charon'], ['여자', 'Speaker2', 'Kore']]);
  assert.deepEqual(multi.turns.map((t) => t.alias), ['Speaker1', 'Speaker2']);
  assert.equal(multi.voiceKey, '남자=Charon|여자=Kore');

  const one = planSpeech('ko', '남자: 주말에 뭐 했어요?');
  assert.deepEqual([one.mode, one.voice, one.text], ['single', 'Charon', '주말에 뭐 했어요?']);

  const unnamed = planSpeech('en', 'Anna: Hi.\nBen: Hello.');
  assert.notEqual(unnamed.speakers[0].voice, unnamed.speakers[1].voice);

  const sameGender = planSpeech('en', 'Woman: Hi.\nGirl: Hello.');
  assert.notEqual(sameGender.speakers[0].voice, sameGender.speakers[1].voice);

  const three = planSpeech('en', 'A1: x\nB1: y\nC1: z');
  assert.deepEqual([three.mode, three.text], ['single', 'x\ny\nz']);

  assert.equal(planSpeech('en', 'Plain sentence.').text, 'Plain sentence.');
  assert.throws(() => planSpeech('fr', 'x'));
});

test('WAV header round-trips and durations are right', () => {
  const pcm = Buffer.alloc(48000); // 1 s of 24 kHz mono 16-bit
  const wav = pcmToWav(pcm);
  assert.equal(wav.length, 44 + 48000);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(4), 36 + 48000);
  assert.equal(wav.toString('ascii', 8, 16), 'WAVEfmt ');
  assert.equal(wav.readUInt16LE(20), 1);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(28), 48000);
  assert.equal(wav.readUInt16LE(32), 2);
  assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), 48000);
  const parsed = parseWav(wav);
  assert.deepEqual([parsed.sampleRate, parsed.channels, parsed.bitsPerSample, parsed.pcm.length], [24000, 1, 16, 48000]);
  assert.equal(durationMs(48000), 1000);
  assert.throws(() => parseWav(Buffer.from('nope')));
});

test('toCanonicalWav accepts raw L16 and WAV (with extra chunks / streaming sizes)', () => {
  const pcm = Buffer.alloc(24000, 1);
  const raw = toCanonicalWav(pcm, 'audio/L16;codec=pcm;rate=24000');
  assert.equal(raw.duration_ms, 500);
  assert.equal(raw.wav.length, 44 + 24000);

  const r16 = toCanonicalWav(pcm, 'audio/l16;rate=16000');
  assert.equal(r16.duration_ms, 750);
  assert.equal(r16.wav.readUInt32LE(24), 16000);

  // WAV with a LIST chunk and a 0xFFFFFFFF data size (streaming encoder).
  const base = pcmToWav(pcm);
  const list = Buffer.concat([Buffer.from('LIST'), Buffer.from([4, 0, 0, 0]), Buffer.from('INFO')]);
  const weird = Buffer.concat([base.subarray(0, 36), list, base.subarray(36)]);
  weird.writeUInt32LE(0xffffffff, 36 + list.length + 4);
  const fixed = toCanonicalWav(weird, 'audio/wav');
  assert.equal(fixed.duration_ms, 500);
  assert.deepEqual(fixed.wav, base);

  assert.throws(() => toCanonicalWav(Buffer.alloc(10), 'audio/mpeg'));
});

test('request bodies for both APIs', () => {
  const multi = planSpeech('ko', '남자: 안녕?\n여자: 응.');
  const i = buildTtsRequest('interactions', 'gemini-3.8-flash-tts', multi);
  assert.equal(i.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(i.body.model, 'gemini-3.8-flash-tts');
  assert.deepEqual(i.body.response_format, { type: 'audio' });
  assert.deepEqual(i.body.generation_config.speech_config.speakers, [{ speaker: 'Speaker1', voice: 'Charon' }, { speaker: 'Speaker2', voice: 'Kore' }]);
  assert.deepEqual(i.body.input[0].content.map((c) => [c.text, c.annotations[0].speaker]), [['안녕?', 'Speaker1'], ['응.', 'Speaker2']]);

  const single = planSpeech('en', 'Hello.');
  const s = buildTtsRequest('interactions', 'm', single);
  assert.deepEqual(s.body.generation_config.speech_config, [{ voice: 'Kore' }]);
  assert.equal(s.body.input[0].content[0].annotations[0].speaker, undefined);

  const g = buildTtsRequest('generate-content', 'gemini-2.5-flash-preview-tts', multi);
  assert.match(g.url, /models\/gemini-2\.5-flash-preview-tts:generateContent$/);
  assert.deepEqual(g.body.generationConfig.responseModalities, ['AUDIO']);
  assert.equal(g.body.contents[0].parts[0].text, 'Speaker1: 안녕?\nSpeaker2: 응.');
  assert.equal(g.body.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs[1].voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
  const gs = buildTtsRequest('generate-content', 'gemini-2.5-flash-preview-tts', single);
  assert.equal(gs.body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');

  assert.equal(defaultApiFor('gemini-2.5-flash-preview-tts'), 'generate-content');
  assert.equal(defaultApiFor('gemini-3.8-flash-tts'), 'interactions');
  assert.throws(() => buildTtsRequest('soap', 'm', single));
});

test('extractAudio reads both response shapes', () => {
  const b64 = Buffer.from('abcd').toString('base64');
  const a = extractAudio({ steps: [{ type: 'thought', content: [] }, { type: 'model_output', content: [{ type: 'text', text: 'x' }, { type: 'audio', data: b64, mime_type: 'audio/wav' }] }] });
  assert.equal(a.audio.toString(), 'abcd');
  assert.equal(a.mimeType, 'audio/wav');
  const b = extractAudio({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: b64 } }] } }] });
  assert.equal(b.mimeType, 'audio/L16;codec=pcm;rate=24000');
  assert.throws(() => extractAudio({ candidates: [] }), /no audio/);
});

test('collectFromSource finds lesson listen and exam listening texts with value ranges', () => {
  const lesson = collectFromSource(LESSON, { rel: 'en/x.yaml', lang: 'en' });
  assert.deepEqual(lesson.map((t) => [t.kind, t.key, t.current]), [['lesson', 'en:exercise:x-listen', null], ['lesson', 'en:exercise:x-listen-2', null]]);
  assert.equal(LESSON.slice(...lesson[0].range), 'null');
  const exam = collectFromSource(EXAM, { rel: 'exams/ko/x.yaml', lang: 'ko' });
  assert.equal(exam.length, 1);
  assert.equal(exam[0].lang, 'ko');
  assert.equal(exam[0].text, '남자: 이 책을 빌리고 싶어요.\n여자: 학생증을 보여 주세요.');
  assert.deepEqual(collectFromSource(': bad: [', { rel: 'x', lang: 'en' }), []);
  assert.equal(fileLang('en/programs/a.yaml'), 'en');
  assert.equal(fileLang('exams/ko/a.yaml'), 'ko');
  assert.equal(fileLang('sources.yaml'), null);
});

test('applyYamlEdits replaces only the value bytes and keeps comments/formatting', () => {
  const [t] = collectFromSource(LESSON, { rel: 'en/x.yaml', lang: 'en' });
  const id = audioAssetId('en', 'Kore', t.text);
  const out = applyYamlEdits(LESSON, [{ range: t.range, value: id }]);
  assert.equal(out, LESSON.replace('audio_asset_id: null   #', `audio_asset_id: ${id}   #`));
  assert.equal(parse(out).exercises[1].prompt.audio_asset_id, id);
  assert.throws(() => applyYamlEdits(LESSON, [{ range: t.range, value: 'x: y' }]));
});

test('mergeManifest sorts and replaces entries', () => {
  const m = mergeManifest({ version: 1, bucket: AUDIO_BUCKET, assets: { 'ko-b': { n: 1 } } }, [{ id: 'en-a', n: 2 }, { id: 'ko-b', n: 3 }]);
  assert.deepEqual(Object.keys(m.assets), ['en-a', 'ko-b']);
  assert.deepEqual(m.assets['ko-b'], { n: 3 });
  assert.deepEqual(readManifest(join(tmpdir(), 'does-not-exist-audio.json')).assets, {});
});

test('buildPlan dedupes, honours --lang, and detects stale ids / write-back', () => {
  const dir = tree({ 'en/l.yaml': LESSON, 'exams/ko/e.yaml': EXAM });
  try {
    const targets = collectTargets(dir);
    assert.equal(targets.length, 3);
    let plan = buildPlan(targets, { assets: {} });
    assert.equal(plan.groups.length, 2); // the two English sentences normalise to one text
    assert.ok(plan.groups.every((g) => g.status === 'generate'));
    assert.equal(buildPlan(targets, { assets: {} }, { langs: ['ko'] }).groups.length, 1);

    const enId = plan.groups.find((g) => g.lang === 'en').id;
    plan = buildPlan(targets, { assets: { [enId]: {} } });
    assert.equal(plan.groups.find((g) => g.id === enId).status, 'writeback');

    const staleTargets = targets.map((t) => (t.lang === 'en' ? { ...t, current: 'en-00000000000000000000000000000000' } : t));
    plan = buildPlan(staleTargets, { assets: { [enId]: {} } });
    assert.equal(plan.stale.length, 2);
    assert.equal(buildPlan(targets.map((t) => (t.lang === 'en' ? { ...t, current: enId } : t)), { assets: { [enId]: {} } }).groups.find((g) => g.id === enId).status, 'ok');

    const problems = checkTargets(staleTargets, { assets: {} });
    assert.ok(problems.some((p) => /not in the audio manifest/.test(p)));
    assert.ok(problems.some((p) => /stale audio/.test(p)));
    assert.deepEqual(checkTargets(targets, { assets: {} }), []);
    assert.match(checkTargets([{ ...targets[0], current: 'hello.mp3' }], { assets: {} })[0], /not a generated id/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parseArgs', () => {
  assert.equal(parseArgs([]).mode, 'dry-run');
  const o = parseArgs(['--', '--apply', '--lang', 'en,ko', '--limit', '5', '--concurrency', '2', '--rpm', '10', '--model', 'gemini-2.5-flash-preview-tts', '--force']);
  assert.deepEqual([o.mode, o.langs, o.limit, o.concurrency, o.rpm, o.model, o.force], ['apply', ['en', 'ko'], 5, 2, 10, 'gemini-2.5-flash-preview-tts', true]);
  assert.equal(parseArgs(['--check']).mode, 'check');
  assert.throws(() => parseArgs(['--limit', '0']));
  assert.throws(() => parseArgs(['--lang']));
  assert.throws(() => parseArgs(['--api', 'soap']));
  assert.throws(() => parseArgs(['--wat']));
});

test('retry helpers', async () => {
  const headers = (h) => ({ get: (k) => h[k] ?? null });
  assert.equal(retryDelayMs({ headers: headers({ 'retry-after': '7' }) }, ''), 7000);
  assert.equal(retryDelayMs({ headers: headers({}) }, '{"retryDelay": "31s"}'), 31000);
  assert.equal(retryDelayMs({ headers: headers({}) }, ''), null);

  const slept = [];
  const sleep = async (ms) => slept.push(ms);
  const responses = [
    { ok: false, status: 503, headers: headers({}), text: async () => 'busy' },
    { ok: false, status: 429, headers: headers({}), text: async () => '{"retryDelay": "10s"}' },
    { ok: true, status: 200, headers: headers({}), text: async () => '' },
  ];
  const res = await fetchWithRetry(async () => responses.shift(), 'u', {}, { sleep, baseMs: 100 });
  assert.equal(res.status, 200);
  assert.deepEqual(slept, [100, 10000]);

  await assert.rejects(
    fetchWithRetry(async () => ({ ok: false, status: 429, headers: headers({}), text: async () => 'Quota exceeded for metric generate_requests_per_model_per_day, limit PerDay' }), 'u', {}, { sleep }),
    FatalError,
  );
  await assert.rejects(fetchWithRetry(async () => ({ ok: false, status: 400, headers: headers({}), text: async () => 'bad' }), 'u', {}, { sleep }), /HTTP 400/);
  await assert.rejects(fetchWithRetry(async () => ({ ok: false, status: 403, headers: headers({}), text: async () => '' }), 'u', {}, { sleep }), FatalError);

  let t = 0;
  const waits = [];
  const limit = rateLimiter(3, { now: () => t, sleep: async (ms) => waits.push(ms) });
  await limit();
  await limit();
  await limit();
  assert.deepEqual(waits, [20000, 40000]);
});

test('redact hides secrets', () => {
  assert.equal(redact('key=supersecretvalue!', ['supersecretvalue', '', undefined]), 'key=***!');
});

test('main: dry run makes no network calls and writes nothing; --check passes on unfilled content', async () => {
  const dir = tree({ 'en/l.yaml': LESSON, 'exams/ko/e.yaml': EXAM });
  const manifest = join(dir, 'manifest.json');
  const logs = [];
  const fetchImpl = () => assert.fail('no network in dry run');
  try {
    assert.equal(await main(['--content', dir, '--manifest', manifest], { fetchImpl, log: (m) => logs.push(m), env: {} }), 0);
    assert.ok(logs.some((l) => /dry run/.test(l)));
    assert.equal(readFileSync(join(dir, 'en/l.yaml'), 'utf8'), LESSON);
    assert.equal(await main(['--check', '--content', dir, '--manifest', manifest], { fetchImpl, log: () => {}, env: {} }), 0);
    assert.equal(await main(['--apply', '--content', dir, '--manifest', manifest], { fetchImpl, log: (m) => logs.push(m), env: {} }), 2);
    assert.ok(logs.some((l) => /missing env: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY/.test(l)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('main --apply with mocked network: synthesises, uploads, records, writes back, never logs secrets', async () => {
  const dir = tree({ 'en/l.yaml': LESSON, 'exams/ko/e.yaml': EXAM });
  const manifest = join(dir, 'manifest.json');
  const env = { GEMINI_API_KEY: 'gemini-secret-key-123', SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret-456' };
  const calls = [];
  const pcm = Buffer.alloc(4800).toString('base64'); // 100 ms
  const ok = (body) => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => '', json: async () => body });
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (init.method === 'HEAD') return { ok: false, status: 404, headers: { get: () => null } };
    if (url.endsWith('/interactions')) return ok({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: pcm, mime_type: 'audio/l16;rate=24000' }] }] });
    return ok({});
  };
  const logs = [];
  try {
    const code = await main(['--apply', '--content', dir, '--manifest', manifest, '--rpm', '1000'], { env, fetchImpl, log: (m) => logs.push(m), sleep: async () => {}, now: () => new Date('2026-10-17T00:00:00Z') });
    assert.equal(code, 0);
    const tts = calls.filter((c) => c.url.endsWith('/interactions'));
    assert.equal(tts.length, 2);
    assert.equal(tts[0].headers['x-goog-api-key'], env.GEMINI_API_KEY);
    const uploads = calls.filter((c) => c.url.includes('/storage/v1/object/content-audio/'));
    assert.equal(uploads.length, 2);
    assert.equal(uploads[0].headers['content-type'], 'audio/wav');
    assert.equal(uploads[0].headers.authorization, `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`);
    assert.equal(uploads[0].body.toString('ascii', 0, 4), 'RIFF');
    const rows = calls.filter((c) => c.url.includes('/rest/v1/audio_assets')).map((c) => JSON.parse(c.body));
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => AUDIO_ASSET_ID_RE.test(r.id) && r.storage_path === `${r.lang}/${r.id}.wav` && r.duration_ms === 100 && r.byte_size === 4844));

    const lesson = readFileSync(join(dir, 'en/l.yaml'), 'utf8');
    const ids = parse(lesson).exercises.slice(1).map((e) => e.prompt.audio_asset_id);
    assert.equal(ids[0], ids[1]);
    assert.match(ids[0], /^en-[0-9a-f]{32}$/);
    assert.ok(lesson.startsWith('# a comment that must survive'));
    assert.ok(lesson.includes('# filled by generate-audio'));
    const exam = parse(readFileSync(join(dir, 'exams/ko/e.yaml'), 'utf8'));
    assert.match(exam.questions[0].prompt.audio_asset_id, /^ko-/);

    const m = JSON.parse(readFileSync(manifest, 'utf8'));
    assert.equal(Object.keys(m.assets).length, 2);
    assert.equal(m.assets[ids[0]].voice, 'Kore');
    assert.equal(m.assets[exam.questions[0].prompt.audio_asset_id].voice, '남자=Charon|여자=Kore');

    for (const l of logs) assert.ok(!l.includes(env.GEMINI_API_KEY) && !l.includes(env.SUPABASE_SERVICE_ROLE_KEY), l);

    // Second run: everything is done, nothing is sent; --check is clean.
    calls.length = 0;
    assert.equal(await main(['--apply', '--content', dir, '--manifest', manifest], { env, fetchImpl, log: () => {}, sleep: async () => {} }), 0);
    assert.equal(calls.length, 0);
    assert.equal(await main(['--check', '--content', dir, '--manifest', manifest], { log: () => {} }), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('main --apply stops on a daily quota and keeps finished work', async () => {
  const dir = tree({ 'en/l.yaml': LESSON, 'exams/ko/e.yaml': EXAM });
  const manifest = join(dir, 'manifest.json');
  const env = { GEMINI_API_KEY: 'k'.repeat(20), SUPABASE_URL: 'http://localhost:54321', SUPABASE_SERVICE_ROLE_KEY: 's'.repeat(20) };
  let tts = 0;
  const fetchImpl = async (url, init = {}) => {
    if (init.method === 'HEAD') return { ok: false, status: 404, headers: { get: () => null } };
    if (url.endsWith('/interactions')) {
      tts++;
      if (tts > 1) return { ok: false, status: 429, headers: { get: () => null }, text: async () => 'limit PerDay' };
      return { ok: true, status: 200, json: async () => ({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: Buffer.alloc(480).toString('base64') }] }] }) };
    }
    return { ok: true, status: 200, text: async () => '' };
  };
  const logs = [];
  try {
    assert.equal(await main(['--apply', '--content', dir, '--manifest', manifest], { env, fetchImpl, log: (m) => logs.push(m), sleep: async () => {} }), 1);
    assert.ok(logs.some((l) => /daily quota/.test(l)));
    assert.equal(Object.keys(JSON.parse(readFileSync(manifest, 'utf8')).assets).length, 1);
    assert.match(parse(readFileSync(join(dir, 'en/l.yaml'), 'utf8')).exercises[1].prompt.audio_asset_id, /^en-/);
    assert.equal(parse(readFileSync(join(dir, 'exams/ko/e.yaml'), 'utf8')).questions[0].prompt.audio_asset_id, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('German (de): voices, gendered dialogue labels, ids and file language', () => {
  assert.deepEqual(Object.keys(VOICES.de).sort(), Object.keys(VOICES.en).sort());
  const dialogue = planSpeech('de', 'Frau: Guten Tag, ich möchte einen Tisch reservieren.\nMann: Gern, für wie viele Personen?');
  assert.equal(dialogue.mode, 'multi');
  assert.deepEqual(dialogue.speakers.map((s) => [s.label, s.voice]), [['Frau', 'Kore'], ['Mann', 'Charon']]);
  assert.equal(planSpeech('de', 'Herr: Wie spät ist es?').voice, 'Charon');
  assert.equal(planSpeech('de', 'Das Wetter ist heute schön.').voiceKey, 'Kore');
  const id = audioAssetId('de', 'Kore', 'Das Wetter ist heute schön.');
  assert.match(id, /^de-[0-9a-f]{32}$/);
  assert.equal(shared.audioAssetLang(id), 'de');
  assert.equal(fileLang('de/a1/u01/l1.yaml'), 'de');
  assert.equal(fileLang('exams/de/goethe-a1-mock-1.yaml'), 'de');
});
