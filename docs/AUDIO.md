# Audio cho bài nghe

Bài `listen` trong bài học và phần nghe của đề luyện thi có thể dùng file audio thật thay cho giọng đọc của trình duyệt. Audio được tạo **offline** bằng Gemini TTS (`scripts/generate-audio.mjs`), không bao giờ tạo lúc người học yêu cầu, rồi lưu trong Supabase Storage. Khi một câu chưa có audio (`audio_asset_id: null`) giao diện vẫn đọc `fallback_text`/`script` bằng TTS của trình duyệt như trước.

## Hợp đồng (contract)

| Thành phần | Giá trị |
|---|---|
| Bucket | `content-audio`, **public read**; chỉ `service_role` ghi (không có policy ghi cho `anon`/`authenticated`, không có policy liệt kê) |
| `audio_asset_id` | `<lang>-<32 ký tự hex>`; regex `^([a-z]{2})-([0-9a-f]{32})$` (`AUDIO_ASSET_ID_RE`) |
| Cách tính id | 32 ký tự hex đầu của `sha256("<lang>\n<voiceKey>\n<văn bản đã chuẩn hoá>")`. Chuẩn hoá: NFC, xuống dòng `\n`, gộp khoảng trắng, cắt đầu cuối từng dòng. `voiceKey` là tên giọng (`Kore`) hoặc `Nhãn=Giọng\|Nhãn=Giọng` cho hội thoại hai người |
| Đường dẫn trong bucket | `<lang>/<audio_asset_id>.wav` |
| **URL công khai** | `${VITE_SUPABASE_URL}/storage/v1/object/public/content-audio/<lang>/<audio_asset_id>.wav` |
| Định dạng | WAV (RIFF), PCM 16-bit, mono, 24 kHz (`audio/wav`) |
| Registry | bảng `public.audio_assets` (id, lang, voice, model, storage_path, mime_type, duration_ms, byte_size, text_sha256, created_at): ai cũng đọc được, chỉ `service_role` ghi. Bản sao trong repo: `supabase/content-audio-manifest.json` |

Frontend lấy URL bằng hàm dùng chung (không tự ghép chuỗi):

```ts
import { audioAssetUrl } from '@linguo/shared';

const url = audioAssetUrl(prompt.audio_asset_id, env.supabaseUrl); // string | null
// null: chưa có audio (hoặc id không đúng dạng) -> đọc fallback_text / tts_text bằng TTS trình duyệt
```

`packages/shared/src/content/audio.ts` còn có `AUDIO_BUCKET`, `AUDIO_ASSET_EXT`, `AUDIO_ASSET_MIME`, `isAudioAssetId`, `audioAssetLang`, `audioAssetPath`. Ngôn ngữ nằm sẵn trong id nên không cần truyền thêm.

Id đi qua các RPC hiện có mà không cần đổi gì: bài học trả `prompt.audio_asset_id`; đề thi trả `prompt.audio_asset_id` và **chỉ khi id là `null`** mới kèm `tts_text` (`exam_served_prompt`, migration `20261015000200`). Nghĩa là câu nghe của đề đã có audio thì giao diện không còn văn bản để đọc dự phòng nếu tải audio lỗi; bài học thì luôn còn `fallback_text`.

## Lấy văn bản từ đâu

- Bài học: `exercises[type: listen].prompt.fallback_text`.
- Đề thi: `questions[section: listening].prompt.script`; ngôn ngữ lấy từ `prompt.stem_lang`.
- Ngôn ngữ của file: `content/<lang>/…` hoặc `content/exams/<lang>/…`. Ngôn ngữ mới (ví dụ `ja`) chỉ cần thêm vào `VOICES` trong script.

Hội thoại dạng `Nhãn: lời thoại` trên mọi dòng được đọc bằng nhiều giọng: hai người nói dùng chế độ multi-speaker của Gemini (tối đa hai giọng), nhãn nữ (`Woman`, `여자`, `女`…) dùng giọng nữ, nhãn nam dùng giọng nam, nhãn khác thì gán A/B theo thứ tự xuất hiện. Một người nói: một giọng theo nhãn, bỏ nhãn khi đọc. Từ ba người trở lên: một giọng, bỏ nhãn. Văn bản không có nhãn: đọc nguyên văn bằng giọng mặc định.

## Ghi id ngược vào YAML

Script ghi `audio_asset_id` thẳng vào file YAML, nhưng chỉ thay đúng các byte của giá trị (`null` → id) theo vị trí mà parser `yaml` trả về; comment, thứ tự khoá và định dạng giữ nguyên. Lý do không dùng file manifest riêng trong `content/`: `content/` chỉ cho phép `.yaml`/`.md`, và import nội dung đã đọc `audio_asset_id` từ YAML. Manifest (`supabase/content-audio-manifest.json`) chỉ ghi những file đã có trên Storage để chạy lại không tạo lại và để `audio:check` hoạt động không cần mạng.

Đổi câu (hoặc đổi giọng trong `VOICES`) thì id dự kiến đổi theo: `pnpm audio:check` báo "stale", lần `audio:generate` sau tạo file mới và thay id trong YAML. Đổi model hay `SPEECH_STYLE` **không** đổi id; muốn tạo lại thì chạy với `--force`. File cũ trên Storage không bị xoá tự động (vô hại, URL vẫn ổn định cho bản app cũ đang cache).

Ghi id làm đổi hash nội dung của bài tập/câu hỏi, nên lần import tiếp theo tăng `version` của dòng đó (bình thường, như mọi lần sửa nội dung).

## Chạy

```bash
pnpm audio:plan                       # mặc định: chỉ in kế hoạch, không gọi mạng, không ghi file
pnpm audio:plan -- --lang ko --limit 20
pnpm audio:check                      # lỗi nếu YAML có id lạ, không có trong manifest, hoặc đã cũ

# Tạo thật (cần ba biến môi trường; không in ra log):
GEMINI_API_KEY=... SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm audio:generate -- --lang ko --limit 15 --rpm 3
```

Cờ: `--apply` / `--dry-run` (mặc định) / `--check`, `--lang en,ko`, `--limit N` (số file tạo mới tối đa trong lần chạy), `--concurrency N` (mặc định 1), `--rpm N` (số request TTS bắt đầu mỗi phút, mặc định 3 cho gói miễn phí), `--model` (mặc định `gemini-3.8-flash-tts`, hoặc biến `GEMINI_TTS_MODEL`), `--api interactions|generate-content` (mặc định tự chọn: model `gemini-2.5-*` dùng `generateContent`, còn lại dùng Interactions API), `--force`, `--out DIR` (giữ thêm bản WAV trong máy để nghe thử), `--content`, `--manifest`.

Hành vi mạng: 429/5xx thử lại với backoff luỹ thừa và tôn trọng `Retry-After`/`retryDelay`; 429 do hết quota **ngày** dừng cả lần chạy; 401/403 dừng ngay. Mỗi file thành công được ghi vào manifest ngay, nên dừng giữa chừng không mất phần đã trả tiền/quota. Trước khi gọi TTS script kiểm tra URL công khai bằng `HEAD`: file đã có trên Storage thì chỉ ghi nhận lại, không tạo lại. Cuối lần chạy script ghi id vào YAML cho mọi file đã có.

Quy trình đề xuất:

1. Chạy trên **Supabase local** trước (`SUPABASE_URL=http://127.0.0.1:54321`, service key từ `supabase status`) với `--limit 3 --out <thư mục ngoài repo>`, nghe thử các file, chỉnh `VOICES` nếu cần.
2. Chạy production theo từng ngôn ngữ, ít một (giới hạn quota gói miễn phí); không chạy từ CI.
3. `pnpm content:check && pnpm audio:check`, xem diff `content/` + manifest, commit, rồi import nội dung như thường lệ (DEPLOY.md).

Lưu ý bản quyền: audio do Gemini TTS sinh từ văn bản Linguo tự soạn; ghi nguồn trong `content/sources.yaml` nếu cần công bố cách tạo.
