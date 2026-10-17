# Linguo · Tiếng Đức (de) — Ma trận giáo trình từng bài (pre-A1 → B2)

Ngày lập: 2026-10-17 · Người soạn: agent G5 (AI, chưa qua giáo viên DaF) · Trạng thái: **bản đề xuất, chờ chủ dự án duyệt** (kế hoạch `docs/superpowers/plans/2026-10-17-linguo-german.md`, giai đoạn 2).

Tài liệu này là **nguồn duy nhất** cho các agent viết nội dung tiếng Đức. Nó quyết định: mỗi bài dạy gì, điểm ngữ pháp nào được *giới thiệu* ở đâu (đúng một lần), lemma nào thuộc bài nào (không trùng giữa các bài), cách đặt key/tên file. Agent viết unit **không được** tự thêm điểm ngữ pháp mới, không được giới thiệu lemma đã thuộc bài khác; cần đổi gì thì ghi vào báo cáo cho orchestrator.

Đầu ra mục tiêu: người Việt bắt đầu từ số 0 đạt **CEFR B2** (mức Goethe-Zertifikat B2). Khung tham chiếu: CEFR Companion Volume (2020), *Profile deutsch*, mô tả đề Goethe-Zertifikat A1 (Start Deutsch 1), A2, B1, B2. Tiến trình được đối chiếu với các giáo trình phổ biến (Netzwerk neu, Menschen, Schritte plus, Begegnungen, Studio d) **chỉ ở mức cấu trúc** — không chép câu chữ, bài tập hay đề thi nào.

## 0. Cách dùng tài liệu (đọc trước khi viết bất kỳ file nào)

1. Tìm unit của bạn ở mục 1 (key, thư mục, tên, mục tiêu) rồi đọc 5 khối bài của unit ở mục 2.
2. Mỗi khối bài cho: key + tên file + `level` + `skills`, Can-do (dùng làm `objectives`/`objective`), **Ngữ pháp mới** (item `grammar_point`, key đầy đủ = `de:item:` + mã trong ngoặc ngược), **Từ mới** (lemma/cụm được *giới thiệu*), lỗi người Việt cần đưa vào `common_mistake`/`known_wrong`, ghi chú văn hoá – ngữ dụng.
3. Item được ôn lại (cột "Ôn lại ở" ở mục 3) phải xuất hiện trong bài đó với `role: reuse` và được dùng ít nhất trong một ví dụ hoặc bài tập.
4. Ngữ pháp chưa được giới thiệu thì không được xuất hiện trong bài tập sản sinh (`fill_blank`, `translate vi_to_target`, `word_bank`) — được phép xuất hiện trong ví dụ đọc hiểu nếu có chú thích, hoặc như **cụm cố định** đã ghi rõ trong khối bài (ví dụ "Ich hätte gern …", "ins Kino gehen", "Wie geht es Ihnen?").
5. Quy ước kỹ thuật (key, file, `order_index`, `difficulty`, số lượng và loại bài tập, audio) ở mục 5; checklist người duyệt ở mục 6.

Tổng quan quy mô (đếm bằng script từ chính các khối bài ở mục 2):

| Chương trình | Bài | Bài dạy mới (L1–L4) | Item ngữ pháp | Lemma/cụm giới thiệu | Tổng item | TB item/bài dạy |
|---|---|---|---|---|---|---|
| P0 `aussprache-basics` | 15 | 12 | 19 | 100 | 119 | 9,9 |
| A1 `a1` | 40 | 32 | 61 | 323 | 384 | 12,0 |
| A2 `a2` | 40 | 32 | 51 | 313 | 364 | 11,4 |
| B1 `b1` | 50 | 40 | 65 | 334 | 399 | 10,0 |
| B2 `b2` | 50 | 40 | 61 | 315 | 376 | 9,4 |
| **Tổng** | **195** | **156** | **257** | **1.385** | **1.642** | 10,5 |

(257 item ngữ pháp = 225 điểm ngữ pháp thật sự + 15 quy tắc phát âm/chính tả của P0 + 17 mục "Redemittel/kỹ năng" như cách viết thư, thuyết trình, thảo luận — xem cột "Loại" ở mục 3.)

## 1. Chương trình và unit

Quy ước chung cho cả 5 chương trình: `kind: core`, **`goal_types: []`** (bắt buộc — ràng buộc DB `programs_goal_types_only_for_goal` trong `supabase/migrations/20261014000100_content.sql` chỉ cho `goal_types` khác rỗng khi `kind = 'goal'`). Cột "Mục tiêu phục vụ" dưới đây chỉ để định hướng (lộ trình nào dùng chương trình nào), **không ghi vào YAML**. `source`: dùng nguồn nội dung tự soạn như en/ja (`src:linguo-demo`) trừ khi orchestrator chỉ định nguồn riêng cho de.

| order_index | Key | Thư mục | Tiêu đề (vi) | level_from → level_to | Mục tiêu phục vụ (không ghi vào YAML) | Unit × bài |
|---|---|---|---|---|---|---|
| 1 | `de:program:aussprache-basics` | `content/de/programs/aussprache-basics/` | Phát âm và chữ cái tiếng Đức (nhập môn) | `pre_a1 → pre_a1` | foundation | 3 × 5 |
| 2 | `de:program:a1` | `content/de/programs/a1/` | Tiếng Đức sơ cấp 1 (A1 – Start Deutsch 1) | `a1 → a1` | foundation, goethe | 8 × 5 |
| 3 | `de:program:a2` | `content/de/programs/a2/` | Tiếng Đức sơ cấp 2 (A2 – Goethe-Zertifikat A2) | `a2 → a2` | foundation, daily_communication, goethe | 8 × 5 |
| 4 | `de:program:b1` | `content/de/programs/b1/` | Tiếng Đức trung cấp (B1 – Goethe-Zertifikat B1) | `b1 → b1` | daily_communication, goethe, skill_focus | 10 × 5 |
| 5 | `de:program:b2` | `content/de/programs/b2/` | Tiếng Đức trung cao cấp (B2 – Goethe-Zertifikat B2) | `b2 → b2` | goethe, skill_focus | 10 × 5 |

Mô tả chương trình (`description.vi`, gợi ý — người viết program.yaml có thể rút gọn):
- **P0:** Bảng chữ cái, nguyên âm dài – ngắn, ä ö ü, nguyên âm đôi, các phụ âm khó với người Việt (ch, r, s/sch/sp/st, z, w/v), trọng âm và ngữ điệu, der/die/das lần đầu, chào hỏi, số 0–20, câu tự giới thiệu mẫu và câu dùng trong lớp.
- **A1:** Làm quen, gia đình và nghề, ăn uống – mua sắm, một ngày của tôi, nhà ở và thành phố, thời gian rảnh và hẹn gặp, đi lại và quần áo, sức khoẻ và cơ quan; sein/haben, chia động từ, V2, Akkusativ, Dativ cơ bản, động từ tách, modal, Imperativ, Perfekt; luyện dạng bài Start Deutsch 1.
- **A2:** Kể chuyện (Perfekt, Präteritum), chuyển nhà (giới từ hai cách, đuôi tính từ), công việc (câu phụ weil/dass), sức khoẻ (phản thân, lời khuyên), du lịch (als/wenn, so sánh nhất), dịch vụ (câu hỏi gián tiếp, zu-Infinitiv, um…zu, lassen), lễ hội – truyền thông – tiêu dùng; luyện đề Goethe A2.
- **B1:** Câu chuyện đời người, quan hệ – cảm xúc, thế giới việc làm, giáo dục, sức khoẻ – dinh dưỡng, môi trường, truyền thông – công nghệ, khác biệt văn hoá, xã hội; mệnh đề quan hệ, bị động, Konjunktiv II, Genitiv, liên từ B1, phân từ làm tính từ, Futur I; luyện đề Goethe B1.
- **B2:** Giáo dục – sự nghiệp, kinh tế, khoa học – công nghệ, truyền thông, chính trị – xã hội, di cư – hội nhập, môi trường bền vững, nghệ thuật – văn học, luật pháp; Nominalstil, thay thế bị động, Konjunktiv I và lời gián tiếp, Konjunktiv II quá khứ, cụm phân từ, Funktionsverbgefüge, liên từ B2; luyện đề Goethe B2.

Kỹ năng theo bài (áp dụng cho mọi unit, trừ unit thi): **L1–L3** ngữ pháp + từ vựng + một kỹ năng sản sinh/tiếp nhận (nói hoặc đọc); **L4** nghe + nói (vẫn có 1–2 điểm ngữ pháp); **L5** đọc + viết (+ nghe/nói theo dạng thi), chỉ ôn. Từ A2, mọi L5 có ít nhất một nhiệm vụ viết giao tiếp; unit cuối mỗi cấp gắn từng bài với một phần thi Goethe.

Mã unit viết thường (`a1u03`) là **tiền tố của mọi key** trong unit đó (unit, bài, item, bài tập) và của tên file items.

### 1.1 P0 · `aussprache-basics` (pre_a1)

| Mã | Key unit | Thư mục | Tên (vi / de) | Chủ đề | Can-do chính | Ngữ pháp/quy tắc trọng tâm |
|---|---|---|---|---|---|---|
| P0U1 | `de:unit:p0u1-alphabet-vokale` | `01-alphabet-vokale` | Chữ cái và nguyên âm / Das Alphabet und die Vokale | chữ cái, từ quốc tế | Đánh vần, đọc nguyên âm dài/ngắn, ä ö ü, nguyên âm đôi | alphabet, độ dài nguyên âm, umlaut, ei/eu/au, -e/-er |
| P0U2 | `de:unit:p0u2-konsonanten` | `02-konsonanten` | Phụ âm và câu đầu tiên / Konsonanten und erste Sätze | chào hỏi, số 0–20, tự giới thiệu | Chào hỏi, đếm, nói tên – quê bằng câu mẫu | w/v/f/z, ch, -ig, s/sch/sp/st/ß, r, phụ âm cuối |
| P0U3 | `de:unit:p0u3-im-kurs` | `03-im-kurs` | Trong lớp học và đọc câu ngắn / Im Deutschkurs | đồ vật lớp học, câu dùng trong lớp | Gọi đồ vật kèm mạo từ, xin nhắc lại, đọc đoạn 3–4 câu | der/die/das, Nomen viết hoa, ngữ điệu, trọng âm, từ ghép, Das ist …, Herr/Frau |

### 1.2 A1 · `a1`

| Mã | Key unit | Thư mục | Tên (vi / de) | Chủ đề | Can-do chính | Ngữ pháp trọng tâm |
|---|---|---|---|---|---|---|
| A1U01 | `de:unit:a1u01-hallo` | `01-hallo` | Xin chào! Làm quen / Hallo! Ich bin … | bản thân, quốc gia, ngôn ngữ, số | Tự giới thiệu, hỏi – đáp thông tin cá nhân, điền form | đại từ, sein, du/Sie, chia động từ, W-/Ja-Nein-Frage, V2, số đến 100 |
| A1U02 | `de:unit:a1u02-familie-beruf` | `02-familie-beruf` | Gia đình và nghề nghiệp / Familie und Beruf | gia đình, thú cưng, nghề | Giới thiệu gia đình, nghề, phủ định | mein/dein…, haben, số nhiều, ein/kein/nicht, doch, nghề không mạo từ, -in |
| A1U03 | `de:unit:a1u03-essen-einkaufen` | `03-essen-einkaufen` | Ăn uống và mua sắm / Essen und Einkaufen | thực phẩm, nhà hàng, tiệm bánh, chợ | Gọi món, mua hàng, hỏi giá | đổi nguyên âm, gern, **Akkusativ**, möchten/mögen, und/aber/oder, số lớn, số lượng |
| A1U04 | `de:unit:a1u04-tagesablauf` | `04-tagesablauf` | Một ngày của tôi / Mein Tag | giờ, sinh hoạt, lịch | Kể thói quen, hẹn ngày giờ, từ chối có lý do | giờ, um/von–bis, động từ tách, khung câu, können/müssen/wollen, am/im/um, số thứ tự |
| A1U05 | `de:unit:a1u05-wohnen-stadt` | `05-wohnen-stadt` | Nhà ở và thành phố / Wohnen und Orte | nhà, đồ đạc, địa điểm, chỉ đường | Tả nhà, hỏi vị trí, hỏi đường | es gibt, unser/euer, đại từ Akk, giống của đại từ, **Dativ** (Wo?), Imperativ |
| A1U06 | `de:unit:a1u06-freizeit` | `06-freizeit` | Thời gian rảnh và hẹn gặp / Freizeit und Verabredungen | sở thích, lời mời, cuối tuần, thời tiết | Rủ – nhận lời – từ chối, kể cuối tuần | gern/lieber/am liebsten, dürfen, man, **Perfekt** (haben/sein), war/hatte |
| A1U07 | `de:unit:a1u07-unterwegs-kleidung` | `07-unterwegs-kleidung` | Đi lại và quần áo / Unterwegs und Kleidung | phương tiện, nhà ga, quần áo, mua sắm | Mua vé, hiểu thông báo, mua quần áo, so sánh | giới từ + Dativ, nach/zu Hause, welcher, đại từ Dativ, gefallen/passen, Komparativ |
| A1U08 | `de:unit:a1u08-gesundheit-aemter` | `08-gesundheit-aemter` | Sức khoẻ, cơ quan và ôn A1 / Gesundheit, Ämter, Start Deutsch 1 | cơ thể, bác sĩ, thủ tục, thư từ | Đi khám, đăng ký cư trú, viết thiệp/e-mail; làm đề mô phỏng | sollen, wehtun, einmal am Tag, für/ohne + Akk, chào đầu – cuối thư |

### 1.3 A2 · `a2`

| Mã | Key unit | Thư mục | Tên (vi / de) | Chủ đề | Can-do chính | Ngữ pháp trọng tâm |
|---|---|---|---|---|---|---|
| A2U01 | `de:unit:a2u01-erzaehlen` | `01-erzaehlen` | Kể chuyện / Erzählen | trải nghiệm, sự cố, tiểu sử | Kể chuyện quá khứ theo trình tự, nói mốc đời | Partizip không ge-, Präteritum modal, trạng từ kể, vor/nach + Dat, Akk thời gian, seit + Präsens, năm |
| A2U02 | `de:unit:a2u02-wohnen-umziehen` | `02-wohnen-umziehen` | Nhà ở và chuyển nhà / Wohnen und Umziehen | chuyển nhà, hàng xóm, thuê nhà | Sắp xếp đồ, nhờ hàng xóm, tả và hỏi thuê nhà | **giới từ hai cách**, động từ vị trí, Dat + Akk, **đuôi tính từ bảng 1** |
| A2U03 | `de:unit:a2u03-arbeit` | `03-arbeit` | Công việc và xin việc / Arbeit und Bewerbung | điều kiện làm việc, điện thoại, ứng tuyển | Giải thích lý do, nêu ý kiến, gọi điện công việc | **câu phụ** (weil, dass), denn, câu phụ đứng đầu, động từ + Dativ, werden |
| A2U04 | `de:unit:a2u04-gesundheit` | `04-gesundheit` | Sức khoẻ / Gesundheit | thể trạng, vệ sinh, lối sống, hiệu thuốc | Nói cảm giác, cho lời khuyên, mua thuốc | **phản thân** Akk/Dat, sollte/könnte, Würden Sie …?, wenn điều kiện |
| A2U05 | `de:unit:a2u05-reisen-urlaub` | `05-reisen-urlaub` | Du lịch và kỳ nghỉ / Reisen und Urlaub | kỳ nghỉ, tham quan, cảnh quan, khách sạn | Kể chuyến đi, so sánh, đặt phòng, phàn nàn | Präteritum, als/wenn, **đuôi tính từ bảng 2**, so sánh nhất, giới từ du lịch |
| A2U06 | `de:unit:a2u06-stadt-dienste` | `06-stadt-dienste` | Thành phố và dịch vụ / Stadt und Dienstleistungen | cơ quan, ngân hàng, bưu điện, dịch vụ | Hỏi lịch sự, làm thủ tục ngân hàng/bưu điện | câu hỏi gián tiếp, ob, zu-Infinitiv, um…zu, deshalb, lassen, nicht müssen ≠ nicht dürfen |
| A2U07 | `de:unit:a2u07-feste-medien-konsum` | `07-feste-medien-konsum` | Lễ hội, truyền thông, tiêu dùng / Feste, Medien und Konsum | lễ Tết, mua online, báo – TV, mạng xã hội | Kể về lễ hội, đổi trả hàng, nói về truyền thông | dieser/jeder, sondern, **đuôi tính từ bảng 3**, was für ein, es geht um, Annas, einer/keiner |
| A2U08 | `de:unit:a2u08-pruefung-a2` | `08-pruefung-a2` | Tương lai, môi trường và thi A2 / Zukunft, Umwelt, Goethe-Zertifikat A2 | kế hoạch, rác thải, thông báo, hẹn | Nói kế hoạch, đọc biển báo, nghe thông báo, cùng lên kế hoạch; đề mô phỏng | động từ + giới từ, hiện tại chỉ tương lai, nguyên thể mệnh lệnh, giới từ thời gian, Lass uns … |

### 1.4 B1 · `b1`

| Mã | Key unit | Thư mục | Tên (vi / de) | Chủ đề | Can-do chính | Ngữ pháp trọng tâm |
|---|---|---|---|---|---|---|
| B1U01 | `de:unit:b1u01-lebensgeschichten` | `01-lebensgeschichten` | Câu chuyện cuộc đời / Lebensgeschichten | tuổi thơ, di cư, mốc đời | Kể tiểu sử, hồi ký | Präteritum đầy đủ, Plusquamperfekt, nachdem/bevor/seitdem/bis, Perfekt của modal |
| B1U02 | `de:unit:b1u02-beziehungen` | `02-beziehungen` | Quan hệ và cảm xúc / Beziehungen und Gefühle | tình bạn, tình yêu, xung đột | Tả người, nói cảm xúc mâu thuẫn | **mệnh đề quan hệ** (Nom/Akk/Dat/giới từ), darauf/worauf, động từ/tính từ + giới từ, obwohl/trotzdem |
| B1U03 | `de:unit:b1u03-arbeitswelt` | `03-arbeitswelt` | Thế giới việc làm / Arbeitswelt | tuyển dụng, doanh nghiệp, văn phòng | Đọc tin tuyển dụng, viết tin nhắn trang trọng | **bị động** (hiện tại, Präteritum, Perfekt), **Genitiv**, damit, n-Deklination, đại từ bất định |
| B1U04 | `de:unit:b1u04-bildung` | `04-bildung` | Giáo dục và học tập / Bildung und Lernen | trường học, đại học, học ngoại ngữ, học nghề | Bàn lựa chọn học tập, ước muốn, giả định | **Konjunktiv II** (dạng, ước, điều kiện không thật, modal), liên từ hai vế, je…desto, was/wo, brauchen zu |
| B1U05 | `de:unit:b1u05-gesundheit-ernaehrung` | `05-gesundheit-ernaehrung` | Sức khoẻ và dinh dưỡng / Gesundheit und Ernährung | dinh dưỡng, chuyên khoa, thực phẩm, nghiện | Đọc lời khuyên, mô tả triệu chứng, đọc nhãn | bị động + modal, falls, **tính từ đủ 4 cách**, tính từ danh từ hoá, hậu tố → giống, phủ định mở rộng |
| B1U06 | `de:unit:b1u06-umwelt` | `06-umwelt` | Môi trường và tương lai / Umwelt und Zukunft | khí hậu, ô nhiễm, năng lượng, tranh luận | Dự báo, nêu nguyên nhân – hậu quả, tranh luận | Futur I, wohl, giới từ Genitiv, da/nämlich, sodass, âm nối từ ghép, nêu ý kiến |
| B1U07 | `de:unit:b1u07-medien-technik` | `07-medien-technik` | Truyền thông và công nghệ / Medien und Technik | thiết bị số, thói quen, hướng dẫn, tin tức | Đọc hướng dẫn, nghe tin vắn, bình luận | Partizip I/II làm tính từ, während/sobald/solange, bị động trạng thái, beim + nguyên thể, mốc thời gian chính xác |
| B1U08 | `de:unit:b1u08-reisen-kultur` | `08-reisen-kultur` | Du lịch và khác biệt văn hoá / Reisen und Kulturen | phong tục, lịch sự, lễ hội, lưu trú | So sánh văn hoá, lên kế hoạch chung, khiếu nại | statt/ohne…zu, hin/her, tiểu từ tình thái 1, tiền tố tách/không tách, Mittelfeld, đề nghị bằng KII |
| B1U09 | `de:unit:b1u09-gesellschaft` | `09-gesellschaft` | Xã hội và cuộc sống chung / Gesellschaft und Zusammenleben | tình nguyện, hàng xóm, bầu cử, thuyết trình | Kể hoạt động xã hội, giải quyết mâu thuẫn, thuyết trình | zu-Infinitiv hay dass, tính từ phái sinh, câu so sánh, Redemittel thuyết trình |
| B1U10 | `de:unit:b1u10-pruefung-b1` | `10-pruefung-b1` | Ôn B1 và thi Goethe B1 / Prüfungstraining B1 | ngôn ngữ đề thi | Làm 4 module Goethe B1; đề mô phỏng | từ quy chiếu, ngôn ngữ nói, thư trang trọng, chiến lược hội thoại |

### 1.5 B2 · `b2`

| Mã | Key unit | Thư mục | Tên (vi / de) | Chủ đề | Can-do chính | Ngữ pháp trọng tâm |
|---|---|---|---|---|---|---|
| B2U01 | `de:unit:b2u01-bildung-karriere` | `01-bildung-karriere` | Giáo dục và sự nghiệp / Bildung und Karriere | học vấn, thăng tiến, năng lực, hợp đồng | Lập luận hai chiều, viết thư trang trọng, phỏng vấn | **Nominalstil**, chuỗi Genitiv, liên từ đối lập/nhượng bộ, auch wenn, indem, folglich, es-Korrelat |
| B2U02 | `de:unit:b2u02-wirtschaft` | `02-wirtschaft` | Kinh tế và thế giới lao động / Wirtschaft und Arbeitswelt | thị trường, giá cả, chiến lược, thống kê | Đọc báo kinh tế, tả biểu đồ | sich lassen, sein/haben + zu, **cụm phân từ mở rộng**, **Funktionsverbgefüge**, giới từ Genitiv trang trọng |
| B2U03 | `de:unit:b2u03-wissenschaft-technik` | `03-wissenschaft-technik` | Khoa học và công nghệ / Wissenschaft und Technik | nghiên cứu, AI, phát minh, thuyết trình | Đọc khoa học phổ thông, phỏng đoán, thuyết trình 4 phút | bị động không chủ ngữ, bị động + modal quá khứ, Futur II, modal phỏng đoán, dessen/deren, tiền tố |
| B2U04 | `de:unit:b2u04-medien` | `04-medien` | Truyền thông và giao tiếp / Medien und Kommunikation | báo chí, tin giả, nguồn tin, phi ngôn ngữ | Thuật lại phát ngôn, kiểm chứng tin, tóm tắt | **Konjunktiv I, lời gián tiếp**, laut/zufolge, sollen/wollen, tiểu từ tình thái 2 |
| B2U05 | `de:unit:b2u05-politik-gesellschaft` | `05-politik-gesellschaft` | Chính trị và xã hội / Politik und Gesellschaft | nhà nước, bất bình đẳng, tham gia, tranh luận | Đọc văn bản quy chế, viết đoạn lập luận, thảo luận | sofern/es sei denn, bei + Nomen, trạng từ nối văn bản, zumal, động từ/danh từ + giới từ B2 |
| B2U06 | `de:unit:b2u06-migration` | `06-migration` | Di cư và hội nhập / Migration und Integration | di cư, giấy tờ, tị nạn, bản sắc | Nói tiếc nuối, phê bình lịch sự, kể trải nghiệm hội nhập | **Konjunktiv II quá khứ**, hätte … sollen, als ob, phân từ danh từ hoá, ngôn ngữ trung lập giới, ohne/anstatt dass |
| B2U07 | `de:unit:b2u07-nachhaltigkeit` | `07-nachhaltigkeit` | Môi trường và phát triển bền vững / Umwelt und Nachhaltigkeit | khí thải, đa dạng sinh học, tiêu dùng, lập luận | Lập luận pro/contra, viết bài ý kiến 150 từ | nguyên thể quá khứ/bị động, aus/vor/dank, mệnh đề quan hệ nối tiếp, Redemittel lập luận |
| B2U08 | `de:unit:b2u08-kunst-kultur` | `08-kunst-kultur` | Nghệ thuật, văn hoá, văn học / Kunst, Kultur und Literatur | văn học, thành ngữ, nghệ thuật, review | Bình luận tác phẩm, hiểu thành ngữ và ngữ vực | Wer …, (der) …, ngữ vực, tính từ + cách, Redemittel đánh giá |
| B2U09 | `de:unit:b2u09-recht` | `09-recht` | Luật pháp và cuộc sống chung / Recht und Zusammenleben | toà án, hợp đồng, quy định, khiếu nại | Hiểu điều khoản, viết khiếu nại trang trọng | FVG nghĩa bị động, điều kiện không wenn, gemäß/entsprechend, einander, Redemittel khiếu nại |
| B2U10 | `de:unit:b2u10-pruefung-b2` | `10-pruefung-b2` | Ôn B2 và thi Goethe B2 / Prüfungstraining B2 | ngôn ngữ đề thi B2 | Làm 4 module Goethe B2; đề mô phỏng | dấu hiệu loại văn bản, tín hiệu bài nói, bố cục bài viết, điều phối thảo luận |

## 2. Ma trận từng bài (195 bài)

Cách đọc một "dòng" bài (mỗi bài là một khối có nhãn cố định để agent và script đọc được):

- **Mã** `A1U03L2` = cấp A1, unit 03, bài 2. Thư mục unit và tên file bài ghi ở mục 1 và ở đây.
- **Ngữ pháp mới**: các item `grammar_point` mà bài này **giới thiệu** (key đầy đủ = `de:item:` + mã ghi trong ngoặc ngược). Bài khác chỉ được `reuse`.
- **Từ mới**: lemma/cụm mà bài này **giới thiệu** (`type: vocab` hoặc `phrase`), ngăn nhau bằng ` · `. Lemma nằm trong danh sách của bài khác thì **không** được giới thiệu lại (dùng `reuse`). Cách ghi danh từ theo quy tắc chung: `der Tisch, -e`, `(Sg.)`, `(Pl.)`.
- Bài 5 của mỗi unit **không giới thiệu gì**: chỉ `reuse` + đọc/viết/kỹ năng thi.

### Chương trình P0 · `de:program:aussprache-basics` (pre_a1)

---

#### Unit P0U1 · Chữ cái và nguyên âm (Das Alphabet und die Vokale) · `de:unit:p0u1-alphabet-vokale` · thư mục `01-alphabet-vokale`

#### P0U1L1 · Bảng chữ cái và đánh vần (Das Alphabet)
- **Key** `de:lesson:p0u1-alphabet` · file `01-alphabet.yaml` · level `pre_a1` · skills `pronunciation, listening, speaking`
- **Can-do:** Đọc tên 26 chữ cái + ä ö ü ß, đánh vần tên mình và nghe – viết lại một tên được đánh vần.
- **Ngữ pháp mới:** `p0u1-g-alphabet` (tên chữ cái: a /aː/, be, ce /tseː/, … j /jɔt/, v /faʊ/, w /veː/, y /ˈʏpsilɔn/, z /tsɛt/; ä ö ü đọc là âm, ß = "eszett") · `p0u1-g-buchstabieren` (đánh vần: "Wie schreibt man das?", chữ hoa "großes N", hai chữ giống nhau "Doppel-s")
- **Từ mới** (trường: từ quốc tế dễ đánh vần): das Taxi, -s · das Hotel, -s · der Bus, -se · das Radio, -s · die Pizza, -s · das Baby, -s · der Tee, -s · die Cola, -s
- **Lỗi người Việt:** đọc chữ cái theo tiếng Anh (j = "giây", e = "i", i = "ai"); đọc v như "v" tiếng Việt (tiếng Đức thường là /f/); quên ß là một chữ riêng.
- **Văn hoá/ngữ dụng:** Ở Thụy Sĩ không dùng ß (viết ss); ở miền Nam Đức/Áo hay nói "das Cola".

#### P0U1L2 · Nguyên âm dài và ngắn (Lange und kurze Vokale)
- **Key** `de:lesson:p0u1-vokale-lang-kurz` · file `02-vokale-lang-kurz.yaml` · level `pre_a1` · skills `pronunciation, listening, reading`
- **Can-do:** Nghe và đọc đúng nguyên âm dài/ngắn trong từ quen thuộc; đoán độ dài từ chữ viết.
- **Ngữ pháp mới:** `p0u1-g-vokallaenge` (dài: nguyên âm đôi chữ `ee/oo/aa`, sau đó có `h`, `ie`, trước một phụ âm; ngắn: trước phụ âm đôi `tt/nn/ss` hoặc cụm phụ âm)
- **Từ mới** (trường: đồ vật, thiên nhiên quanh ta): der Name, -n · der Mann, ¨-er · das Bett, -en · der See, -n · das Boot, -e · die Sonne, -n · die Uhr, -en · das Bier, -e
- **Lỗi người Việt:** tiếng Việt không phân biệt độ dài nguyên âm nên đọc "Bett" và "Beet" như nhau; đọc `ie` thành "i-ê" (đúng là một âm i dài).
- **Văn hoá/ngữ dụng:** —

#### P0U1L3 · Ä, Ö, Ü (Die Umlaute)
- **Key** `de:lesson:p0u1-umlaute` · file `03-umlaute.yaml` · level `pre_a1` · skills `pronunciation, listening, speaking`
- **Can-do:** Phát âm và nghe phân biệt u/ü, o/ö, a/ä trong từ thông dụng; gõ được ä ö ü (hoặc ae/oe/ue).
- **Ngữ pháp mới:** `p0u1-g-umlaute` (ü = giữ lưỡi như "i", tròn môi như "u"; ö = lưỡi như "ê", môi tròn như "ô"; ä ≈ "e" mở; dài/ngắn như mục trước; cách gõ thay thế ae/oe/ue)
- **Từ mới** (trường: tính từ và từ thường ngày có umlaut): schön · müde · hören · über · die Tür, -en · das Mädchen, - · der Käse (Sg.) · das Brötchen, -
- **Lỗi người Việt:** đọc ü thành "uy" hoặc "u", ö thành "ô"; bỏ dấu chấm khi viết (schon ≠ schön).
- **Văn hoá/ngữ dụng:** "das Mädchen" là giống trung (đuôi -chen) dù chỉ con gái – cảnh báo sớm: giống ngữ pháp ≠ giới tính. Ở Áo/Bayern: die Semmel = das Brötchen.

#### P0U1L4 · Nguyên âm đôi và âm cuối -e, -er (Diphthonge, -e und -er)
- **Key** `de:lesson:p0u1-diphthonge` · file `04-diphthonge.yaml` · level `pre_a1` · skills `pronunciation, listening, reading`
- **Can-do:** Đọc đúng ei/ai, ie, eu/äu, au; đọc nhẹ âm -e (ơ) và -er (a nhẹ) ở cuối từ.
- **Ngữ pháp mới:** `p0u1-g-diphthonge` (ei = "ai", eu/äu = "oi", au = "ao"; phân biệt ei ≠ ie) · `p0u1-g-schwa-er` (âm -e cuối không nhấn ≈ "ơ" rất nhẹ; -er cuối ≈ "a" nhẹ, không cuộn r)
- **Từ mới** (trường: người và nhà): das Ei, -er · das Haus, ¨-er · die Frau, -en · heute · neu · die Leute (Pl.) · der Lehrer, - · die Zeit, -en
- **Lỗi người Việt:** đọc ei thành "ê-i", eu thành "ê-u"; đọc to và rõ -er như "e-rơ".
- **Văn hoá/ngữ dụng:** —

#### P0U1L5 · Ôn tập: đọc tên, đánh vần, nghe phân biệt (Wiederholung)
- **Key** `de:lesson:p0u1-wiederholung` · file `05-wiederholung.yaml` · level `pre_a1` · skills `pronunciation, listening, reading, writing`
- **Can-do:** Đánh vần một tên/địa chỉ email, nghe chọn từ đúng trong cặp tối thiểu (Mann/Name, Bett/Boot, schon/schön), đọc to danh sách từ đã học.
- **Ngữ pháp mới:** — (ôn mọi item của P0U1)
- **Từ mới:** — (chỉ reuse)
- **Kỹ năng:** `listen` cặp tối thiểu, `word_bank` ghép chữ cái thành từ đã học, đọc một danh sách mua sắm ngắn (Taxi, Pizza, Tee, Cola).

---

#### Unit P0U2 · Phụ âm và những câu đầu tiên (Konsonanten und erste Sätze) · `de:unit:p0u2-konsonanten` · thư mục `02-konsonanten`

#### P0U2L1 · Chào hỏi – w, v, f, z (Begrüßung)
- **Key** `de:lesson:p0u2-begruessung` · file `01-begruessung.yaml` · level `pre_a1` · skills `pronunciation, speaking, listening`
- **Can-do:** Chào và tạm biệt đúng thời điểm và mức trang trọng.
- **Ngữ pháp mới:** `p0u2-g-w-v-f-z` (w = "v" tiếng Việt; v thường = "ph" (Vater), trừ từ ngoại lai (Video); f/ph = "ph"; z/tz = "ts")
- **Từ mới** (trường: chào hỏi – `phrase`): Hallo! · Guten Morgen! · Guten Tag! · Guten Abend! · Gute Nacht! · Tschüss! · Auf Wiedersehen! · Wie geht's? · Danke, gut.
- **Lỗi người Việt:** đọc w như "u-ê" (kiểu tiếng Anh); đọc z như "d"; "Tschüss" thiếu âm "ch" đầu.
- **Văn hoá/ngữ dụng:** "Hallo/Tschüss" thân mật, "Guten Tag/Auf Wiedersehen" lịch sự; "Gute Nacht" chỉ khi đi ngủ. Áo/Bayern: Grüß Gott, Servus; Thụy Sĩ: Grüezi, Uf Wiederluege (chỉ giới thiệu để nhận ra, không là đáp án).

#### P0U2L2 · Số 0–20 – âm ch và -ig (Zahlen bis 20)
- **Key** `de:lesson:p0u2-zahlen-bis-20` · file `02-zahlen-bis-20.yaml` · level `pre_a1` · skills `pronunciation, listening, speaking`
- **Can-do:** Đếm và nghe số 0–20; đọc số điện thoại từng chữ số.
- **Ngữ pháp mới:** `p0u2-g-ch-laute` (ach-Laut sau a/o/u/au = "kh" tiếng Việt; ich-Laut sau i/e/ä/ö/ü/ei/eu và sau phụ âm ≈ "h" xì nhẹ giữa lưỡi; chs = "ks": sechs) · `p0u2-g-ig-endung` (-ig cuối từ đọc như "ich": zwanzig)
- **Từ mới** (trường: số): die Zahlen 0–12 (`phrase`) · die Zahlen 13–20 (`phrase`) · die Nummer, -n · die Handynummer, -n · richtig · falsch · ich
- **Lỗi người Việt:** đọc ich thành "ích" bật /k/; sechs đọc "séch"; nhầm sechzehn (bỏ -s) / siebzehn (bỏ -en).
- **Văn hoá/ngữ dụng:** Đọc số điện thoại theo từng số hoặc cặp số; "zwo" thay cho "zwei" khi nói qua điện thoại để khỏi nhầm với "drei".

#### P0U2L3 · s, sch, sp, st, ß (Schule, Sport, Straße)
- **Key** `de:lesson:p0u2-sch-sp-st` · file `03-sch-sp-st.yaml` · level `pre_a1` · skills `pronunciation, listening, reading`
- **Can-do:** Đọc đúng s (hữu thanh trước nguyên âm), sch, sp/st đầu từ, ss/ß; viết đúng ss hay ß.
- **Ngữ pháp mới:** `p0u2-g-s-laute` (s + nguyên âm đầu âm tiết ≈ "d" Bắc (Sonne, sehr); sch ≈ "s" uốn lưỡi + tròn môi; sp/st **đầu từ/đầu thành phần từ ghép** = "schp/scht"; ß sau nguyên âm dài/nguyên âm đôi, ss sau nguyên âm ngắn)
- **Từ mới** (trường: trường học và thể thao): die Schule, -n · der Sport (Sg.) · die Straße, -n · der Student, -en · die Studentin, -nen · der Fußball, ¨-e · die Musik (Sg.) · sehr · Entschuldigung! (`phrase`)
- **Lỗi người Việt:** đọc st/sp đầu từ như tiếng Anh ("Student" = "xtu-"); đọc s trong "Sonne" thành "x"; bỏ âm cuối -st, -tz.
- **Văn hoá/ngữ dụng:** "Entschuldigung!" vừa để xin lỗi vừa để gọi người lạ ("Entschuldigung, wo ist …?").

#### P0U2L4 · Tôi là… – âm r, phụ âm cuối (Ich heiße …)
- **Key** `de:lesson:p0u2-ich-heisse` · file `04-ich-heisse.yaml` · level `pre_a1` · skills `pronunciation, speaking, listening`
- **Can-do:** Nói tên, nơi xuất thân bằng câu mẫu và hỏi lại người kia.
- **Ngữ pháp mới:** `p0u2-g-r-laut` (r đầu âm tiết = r lưỡi gà, gần "g/gh" tiếng Việt đọc nhẹ ra sau; r sau nguyên âm dài cuối âm tiết thành "a" nhẹ: Uhr, mir) · `p0u2-g-auslautverhaertung` (b/d/g cuối âm tiết đọc p/t/k: Tag, und, gelb; phụ âm cuối phải bật rõ)
- **Từ mới** (trường: tự giới thiệu – `phrase` trừ khi ghi khác): Ich heiße … · Ich bin … · Wie heißt du? · Wie heißen Sie? · Ich komme aus Vietnam. · Freut mich! · und · auch · Und du?
- **Lỗi người Việt:** đọc r rung đầu lưỡi hoặc như "z"; nuốt âm cuối (und → "un"); thêm âm "ơ" sau phụ âm cuối.
- **Văn hoá/ngữ dụng:** "Wie heißt du?" với bạn bè/người trẻ, "Wie heißen Sie?" với người lớn, người lạ, ở cơ quan. Các mẫu câu ở đây học như cụm cố định; chia động từ học ở A1U01.

#### P0U2L5 · Ôn tập: chào hỏi và số (Wiederholung)
- **Key** `de:lesson:p0u2-wiederholung` · file `05-wiederholung.yaml` · level `pre_a1` · skills `listening, speaking, reading, writing`
- **Can-do:** Hiểu và thực hiện một đoạn chào – giới thiệu – trao số điện thoại 4–6 lượt lời.
- **Ngữ pháp mới:** — · **Từ mới:** — (chỉ reuse P0U1–P0U2)
- **Kỹ năng:** nghe hội thoại ngắn, điền số nghe được (`fill_blank` chữ số), sắp xếp lượt lời (`word_bank`), đọc to câu chào.

---

#### Unit P0U3 · Trong lớp học và đọc câu ngắn (Im Deutschkurs) · `de:unit:p0u3-im-kurs` · thư mục `03-im-kurs`

#### P0U3L1 · der, die, das – đồ vật trong lớp (Der Tisch, die Tafel, das Buch)
- **Key** `de:lesson:p0u3-der-die-das` · file `01-der-die-das.yaml` · level `pre_a1` · skills `grammar, vocabulary, reading`
- **Can-do:** Gọi tên đồ vật trong lớp kèm mạo từ; hiểu ký hiệu số nhiều trong từ điển/thẻ từ.
- **Ngữ pháp mới:** `p0u3-g-genus-artikel` (danh từ có 3 giống der/die/das, không đoán theo nghĩa; luôn học cả cụm mạo từ + danh từ + số nhiều; đọc ký hiệu `-e`, `¨-er`, `-`) · `p0u3-g-nomen-gross` (mọi danh từ viết hoa chữ đầu, cả giữa câu)
- **Từ mới** (trường: lớp học): der Tisch, -e · der Stuhl, ¨-e · das Buch, ¨-er · das Heft, -e · der Stift, -e · der Kuli, -s · die Tafel, -n · das Fenster, - · das Handy, -s · die Tasche, -n
- **Lỗi người Việt:** học từ trơ không mạo từ; viết thường danh từ; đoán giống theo nghĩa ("cái bàn" không có giống).
- **Văn hoá/ngữ dụng:** —

#### P0U3L2 · Câu dùng trong lớp (Wie bitte? Noch einmal, bitte.)
- **Key** `de:lesson:p0u3-im-kurs-sprechen` · file `02-im-kurs-sprechen.yaml` · level `pre_a1` · skills `speaking, listening, pronunciation`
- **Can-do:** Xin nhắc lại, xin nói chậm, hỏi nghĩa/cách viết một từ.
- **Ngữ pháp mới:** `p0u3-g-satzmelodie` (câu kể và câu hỏi có từ để hỏi: giọng xuống; câu hỏi có/không: giọng lên; bitte làm câu lịch sự)
- **Từ mới** (trường: lớp học – `phrase` trừ khi ghi khác): bitte · Wie bitte? · Noch einmal, bitte. · Langsam, bitte. · verstehen (Ich verstehe das nicht.) · Was heißt … auf Deutsch? · Wie schreibt man das? · Ich weiß es nicht.
- **Lỗi người Việt:** dùng ngữ điệu thanh điệu tiếng Việt (lên xuống từng từ) thay vì ngữ điệu câu; nói "What?" thay vì "Wie bitte?".
- **Văn hoá/ngữ dụng:** "Was?" trống không nghe cộc; dùng "Wie bitte?". Trong lớp ở Đức người học thường xưng du với nhau, Sie với giáo viên (tuỳ lớp).

#### P0U3L3 · Trọng âm và từ ghép (Wortakzent und Komposita)
- **Key** `de:lesson:p0u3-wortakzent` · file `03-wortakzent.yaml` · level `pre_a1` · skills `pronunciation, listening, vocabulary`
- **Can-do:** Nhấn đúng âm tiết trong từ gốc Đức, từ quốc tế và từ ghép; đoán giống của từ ghép.
- **Ngữ pháp mới:** `p0u3-g-wortakzent` (từ gốc Đức nhấn âm tiết đầu của gốc; be-/ge-/ver-/er-/ent-/zer- không nhấn; từ ngoại lai nhấn cuối: -ion, -tät, -ie, -ieren, -ant/-ent) · `p0u3-g-komposita` (từ ghép: nhấn phần đầu, **giống theo phần cuối**: die Handynummer, der Fußball)
- **Từ mới** (trường: nơi chốn và đồ dùng quốc tế): das Restaurant, -s · das Café, -s · das Kino, -s · die Universität, -en · das Telefon, -e · der Computer, - · die Information, -en · das Problem, -e
- **Lỗi người Việt:** nhấn đều mọi âm tiết; đọc từ quốc tế theo trọng âm tiếng Anh ("Hotel" nhấn đầu); lấy giống của phần đầu từ ghép.
- **Văn hoá/ngữ dụng:** —

#### P0U3L4 · Đây là… – đọc đoạn ngắn (Das ist Frau Wagner.)
- **Key** `de:lesson:p0u3-das-ist` · file `04-das-ist.yaml` · level `pre_a1` · skills `reading, listening, speaking`
- **Can-do:** Giới thiệu người khác bằng "Das ist …", xưng hô Herr/Frau + họ, đọc hiểu đoạn 3–4 câu.
- **Ngữ pháp mới:** `p0u3-g-das-ist` (Das ist + tên/danh từ; Ist das …? – Ja./Nein.) · `p0u3-g-anrede` (Herr/Frau + họ khi dùng Sie; không ghép Herr/Frau với tên riêng)
- **Từ mới** (trường: người quanh ta): ja · nein · der Herr, -en · hier · da · gut · jetzt · Wer ist das? (`phrase`)
- **Lỗi người Việt:** gọi "Herr Minh" theo tên riêng như tiếng Việt; dịch "Đây là" thành "Hier ist".
- **Văn hoá/ngữ dụng:** Người Đức gọi nhau theo họ trong môi trường trang trọng; tên người Việt: giải thích họ – tên đệm – tên khi điền form (Nachname = họ).
- **Ghi chú điều phối:** "Wer ist das?" là `phrase` (key `p0u3-wer-ist-das`); lemma `wer` (từ để hỏi) thuộc A1U01L3.

#### P0U3L5 · Ôn P0: đọc to, nghe hiểu, chép chính tả ngắn (Wiederholung)
- **Key** `de:lesson:p0u3-wiederholung` · file `05-wiederholung.yaml` · level `pre_a1` · skills `reading, listening, writing, pronunciation`
- **Can-do:** Đọc to và hiểu đoạn tự giới thiệu 4 câu; chép đúng chính tả (hoa danh từ, ä/ö/ü/ß) một câu nghe được.
- **Ngữ pháp mới:** — · **Từ mới:** — (reuse toàn P0)
- **Kỹ năng:** nghe đoạn giới thiệu → chọn thông tin (`listen`), `word_bank` câu "Das ist Herr Wagner. Er …" chỉ với cấu trúc đã học, `mcq` chọn danh từ viết hoa đúng.

---

### Chương trình A1 · `de:program:a1` (a1)

---

#### Unit A1U01 · Xin chào! Làm quen (Hallo! Ich bin …) · `de:unit:a1u01-hallo` · thư mục `01-hallo`

#### A1U01L1 · Tôi, bạn, ngài – động từ sein (Ich bin, du bist, Sie sind)
- **Key** `de:lesson:a1u01-ich-du-sie` · file `01-ich-du-sie.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Giới thiệu mình và người khác bằng sein; chọn du hay Sie.
- **Ngữ pháp mới:** `a1u01-g-personalpronomen` (ich, du, er/sie/es, wir, ihr, sie/Sie – Nominativ) · `a1u01-g-sein` (bin, bist, ist, sind, seid, sind) · `a1u01-g-du-sie` (thân mật/trang trọng; Sie viết hoa, chia như số nhiều)
- **Từ mới** (trường: bạn bè, đồng nghiệp): der Vorname, -n · der Familienname, -n · der Freund, -e · die Freundin, -nen · der Kollege, -n · die Kollegin, -nen · nett · Wie geht es Ihnen? (`phrase`) · Es geht. (`phrase`)
- **Lỗi người Việt:** bỏ sein ("Ich Minh"); nhầm sie (cô ấy/họ) với Sie; dùng du với người lạ lớn tuổi.
- **Văn hoá/ngữ dụng:** du/Sie: Sie mặc định với người lạ, cơ quan, nơi làm việc khi chưa được mời "duzen"; giới trẻ, đồng nghiệp ở công ty khởi nghiệp hay du ngay. "der Freund" vừa là bạn vừa là bạn trai (ngữ cảnh). "Wie geht es Ihnen?" học như cụm (Dativ học ở A1U07).

#### A1U01L2 · Bạn đến từ đâu? – chia động từ (Woher kommst du?)
- **Key** `de:lesson:a1u01-woher-kommst-du` · file `02-woher-kommst-du.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói và hỏi quê quán, nơi ở.
- **Ngữ pháp mới:** `a1u01-g-praesens` (đuôi -e, -st, -t, -en, -t, -en; gốc tận cùng -t/-d thêm -e-: du arbeitest; gốc -s/-ß/-z chỉ thêm -t: du heißt) · `a1u01-g-laender-artikel` (đa số tên nước không mạo từ; die Schweiz, die Türkei, die USA, der Iran – học như cụm "aus der Schweiz", "in der Türkei")
- **Từ mới** (trường: quốc gia, nơi ở): kommen · wohnen · das Land, ¨-er · Deutschland · Österreich · die Schweiz · Vietnam · aus · in
- **Lỗi người Việt:** không chia động từ ("du kommen"); quên -e- ở "arbeitest"; "aus Schweiz" thiếu mạo từ.
- **Văn hoá/ngữ dụng:** Người Đức hỏi "Woher kommst du?" rất tự nhiên, trả lời có thể kèm thành phố (aus Hanoi).

#### A1U01L3 · Câu hỏi W- và câu hỏi có/không (W-Fragen)
- **Key** `de:lesson:a1u01-w-fragen` · file `03-w-fragen.yaml` · level `a1` · skills `grammar, vocabulary, speaking, listening`
- **Can-do:** Hỏi và trả lời thông tin cá nhân (tên, nơi ở, ngôn ngữ); nói ngôn ngữ mình biết.
- **Ngữ pháp mới:** `a1u01-g-w-fragen` (từ để hỏi ở vị trí 1, động từ vị trí 2) · `a1u01-g-ja-nein-frage` (động từ đứng đầu: Sprichst du Deutsch?) · `a1u01-g-v2` (câu kể: động từ chia luôn ở vị trí 2, kể cả khi thời gian đứng đầu: Heute lerne ich …)
- **Từ mới** (trường: ngôn ngữ, câu hỏi): sprechen (du sprichst) · lernen · die Sprache, -n · Deutsch · Englisch · Vietnamesisch · wer · wo · woher · was · wie
- **Lỗi người Việt:** đặt từ để hỏi cuối câu như tiếng Việt ("Du wohnst wo?" chỉ dùng khi hỏi lại); "Heute ich lerne" (sai V2) – lỗi số 1 của người Việt.
- **Văn hoá/ngữ dụng:** Ngôn ngữ viết hoa khi là danh từ (Ich lerne Deutsch), viết thường khi là tính từ (vietnamesisch kochen) – chỉ nêu, không kiểm tra.
- **Ghi chú:** dạng đổi nguyên âm của sprechen ghi trên thẻ; quy tắc chung học ở A1U03L1.

#### A1U01L4 · Số đến 100, tuổi, địa chỉ (Zahlen bis 100)
- **Key** `de:lesson:a1u01-zahlen-bis-100` · file `04-zahlen-bis-100.yaml` · level `a1` · skills `listening, speaking, vocabulary`
- **Can-do:** Nói tuổi, số nhà, mã bưu chính, số điện thoại; điền một mẫu đơn đơn giản.
- **Ngữ pháp mới:** `a1u01-g-zahlen-bis-100` (21–99: **đơn vị trước, chục sau** einundzwanzig – ngược tiếng Việt; dreißig có ß; sechzig, siebzig) · `a1u01-g-alter` (Ich bin 25 Jahre alt. Wie alt bist du?)
- **Từ mới** (trường: thông tin cá nhân): die Zehnerzahlen 20–100 (`phrase`) · das Jahr, -e · alt · jung · die Adresse, -n · die E-Mail, -s · das Formular, -e · der Wohnort, -e · die Hausnummer, -n · die Postleitzahl, -en
- **Lỗi người Việt:** nghe 47 thành 74; "Ich habe 25 Jahre" (dịch theo "có"/tiếng Pháp).
- **Văn hoá/ngữ dụng:** Ở Đức số nhà đứng **sau** tên đường (Gartenstraße 12), mã bưu chính 5 số đứng trước thành phố; Áo/Thụy Sĩ mã 4 số.

#### A1U01L5 · Ôn tập + Start Deutsch 1: điền form, tự giới thiệu (Wiederholung)
- **Key** `de:lesson:a1u01-wiederholung` · file `05-wiederholung.yaml` · level `a1` · skills `reading, writing, speaking, listening`
- **Can-do:** Đọc hồ sơ ngắn của một người, điền form thông tin cá nhân (kiểu Schreiben Teil 1), tự giới thiệu theo 7 từ khoá (Name, Alter, Land, Wohnort, Sprachen, Beruf, Hobby – kiểu Sprechen Teil 1).
- **Ngữ pháp mới:** — · **Từ mới:** — (reuse A1U01)
- **Kỹ năng:** đọc profile → `mcq` richtig/falsch; `fill_blank` form; `word_bank` câu tự giới thiệu đúng V2.

---

#### Unit A1U02 · Gia đình và nghề nghiệp (Familie und Beruf) · `de:unit:a1u02-familie-beruf` · thư mục `02-familie-beruf`

#### A1U02L1 · Gia đình tôi – mein, dein (Meine Familie)
- **Key** `de:lesson:a1u02-meine-familie` · file `01-meine-familie.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Giới thiệu các thành viên gia đình và tả họ bằng tính từ đơn giản.
- **Ngữ pháp mới:** `a1u02-g-possessiv-singular` (mein/meine, dein/deine, sein/seine, ihr/ihre, Ihr/Ihre – Nominativ; đuôi -e cho danh từ giống cái và số nhiều; "sein" = của anh ấy, "ihr" = của cô ấy/của họ) · `a1u02-g-adjektiv-praedikativ` (tính từ sau sein không đổi đuôi: Meine Mutter ist klein.)
- **Từ mới** (trường: gia đình hạt nhân): die Familie, -n · die Mutter, ¨- · der Vater, ¨- · die Eltern (Pl.) · der Bruder, ¨- · die Schwester, -n · die Geschwister (Pl.) · das Kind, -er · groß · klein
- **Lỗi người Việt:** chọn sein/ihr theo giới tính **vật sở hữu** thay vì người sở hữu; "mein Mutter" thiếu -e.
- **Văn hoá/ngữ dụng:** Xưng hô gia đình tiếng Đức đơn giản hơn tiếng Việt (không phân anh/em bằng từ riêng: der ältere/jüngere Bruder chỉ nêu ở deep_explain).

#### A1U02L2 · Tôi có hai con – haben và số nhiều (Ich habe zwei Kinder)
- **Key** `de:lesson:a1u02-ich-habe-zwei-kinder` · file `02-ich-habe-zwei-kinder.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói mình có ai trong gia đình, tình trạng hôn nhân; nhận biết các kiểu số nhiều.
- **Ngữ pháp mới:** `a1u02-g-haben` (habe, hast, hat, haben, habt, haben) · `a1u02-g-plural` (5 kiểu số nhiều: -e, -(e)n, -er, -s, không đuôi/¨; mẹo: die … -e → -n, -in → -nen, -er/-el/-chen không đổi, từ mượn -o/-a/-y → -s; mạo từ số nhiều luôn "die")
- **Từ mới** (trường: đại gia đình, hôn nhân): der Sohn, ¨-e · die Tochter, ¨- · die Großeltern (Pl.) · die Oma, -s · der Opa, -s · der Onkel, - · die Tante, -n · verheiratet · ledig · geschieden
- **Lỗi người Việt:** quên số nhiều sau số đếm ("zwei Kind"); thêm -s như tiếng Anh ("Kinds").
- **Ràng buộc tiền quyết:** Akkusativ chưa học → ví dụ với haben chỉ dùng tân ngữ giống cái, giống trung, số nhiều (eine Schwester, ein Kind, zwei Brüder); **không** dùng tân ngữ giống đực số ít ("einen Sohn") cho tới A1U03L2.

#### A1U02L3 · ein, kein, nicht, doch (Das ist kein Hund!)
- **Key** `de:lesson:a1u02-kein-nicht` · file `03-kein-nicht.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói có/không có gì, phủ định câu, phản bác câu hỏi phủ định.
- **Ngữ pháp mới:** `a1u02-g-unbestimmter-artikel` (ein/eine – Nominativ; số nhiều không có mạo từ không xác định) · `a1u02-g-negation-nicht-kein` (kein = "nicht + ein" cho danh từ; nicht cho động từ, tính từ, danh từ có mạo từ xác định; nicht ở cuối câu đơn giản hoặc trước tính từ/nơi chốn) · `a1u02-g-doch` (trả lời "có" cho câu hỏi phủ định: Hast du keine Zeit? – Doch!)
- **Từ mới** (trường: thú cưng và đồ vật cá nhân): das Haustier, -e · der Hund, -e · die Katze, -n · das Auto, -s · das Fahrrad, ¨-er · das Foto, -s · das Hobby, -s
- **Lỗi người Việt:** "nicht ein Hund" thay vì "kein Hund"; trả lời "Ja" cho câu hỏi phủ định (tiếng Việt "Ừ, không có" gây nhầm).
- **Ràng buộc tiền quyết:** như A1U02L2 – "kein/ein" với giống đực chỉ ở Nominativ ("Das ist kein Hund."), chưa "Ich habe keinen Hund".

#### A1U02L4 · Nghề nghiệp (Was sind Sie von Beruf?)
- **Key** `de:lesson:a1u02-berufe` · file `04-berufe.yaml` · level `a1` · skills `listening, speaking, vocabulary`
- **Can-do:** Hỏi và nói nghề, nơi làm việc; nghe đoạn giới thiệu nghề.
- **Ngữ pháp mới:** `a1u02-g-beruf-ohne-artikel` (Ich bin Lehrerin. – không mạo từ, khác tiếng Anh "a teacher") · `a1u02-g-feminin-in` (nghề giống cái thêm -in, nhiều từ thêm umlaut: Arzt → Ärztin, Koch → Köchin)
- **Từ mới** (trường: nghề và nơi làm việc): der Beruf, -e · arbeiten · machen · der Arzt, ¨-e · der Ingenieur, -e · der Verkäufer, - · der Koch, ¨-e · der Pfleger, - · die Firma, Firmen · das Krankenhaus, ¨-er · als (arbeiten als …)
- **Lỗi người Việt:** "Ich bin ein Lehrer" (ảnh hưởng tiếng Anh); dùng dạng giống đực cho người nữ.
- **Văn hoá/ngữ dụng:** Ngành điều dưỡng (Pflege) ở Đức tuyển nhiều người Việt – giới thiệu Pflegefachfrau/Pflegefachmann là tên nghề chính thức hiện nay (chỉ nhắc, lemma là der Pfleger/die Pflegerin). "Was machen Sie beruflich?" = câu hỏi lịch sự hơn.

#### A1U02L5 · Ôn tập: viết về gia đình (Wiederholung)
- **Key** `de:lesson:a1u02-wiederholung` · file `05-wiederholung.yaml` · level `a1` · skills `reading, writing, speaking`
- **Can-do:** Đọc đoạn văn về một gia đình; viết 4–5 câu (~30 từ) về gia đình và nghề của mình; hỏi – đáp theo thẻ từ (kiểu Sprechen Teil 2, chủ đề Familie/Beruf).
- **Ngữ pháp mới:** — · **Từ mới:** — (reuse A1U01–A1U02)

---

#### Unit A1U03 · Ăn uống và mua sắm (Essen und Einkaufen) · `de:unit:a1u03-essen-einkaufen` · thư mục `03-essen-einkaufen`

#### A1U03L1 · Bạn thích ăn gì? (Was isst du gern?)
- **Key** `de:lesson:a1u03-was-isst-du-gern` · file `01-was-isst-du-gern.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói món mình thích/không thích ăn uống.
- **Ngữ pháp mới:** `a1u03-g-vokalwechsel` (động từ đổi nguyên âm ở du/er-sie-es: e→i essen–isst, sprechen–spricht; e→ie sehen–sieht, lesen–liest; a→ä fahren–fährt, schlafen–schläft) · `a1u03-g-gern` (động từ + gern / nicht gern; gern đứng sau động từ chia)
- **Từ mới** (trường: thực phẩm cơ bản): essen (du isst) · trinken · das Brot, -e · die Milch (Sg.) · der Kaffee (Sg.) · das Wasser (Sg.) · der Saft, ¨-e · das Obst (Sg.) · das Gemüse (Sg.) · der Apfel, ¨-
- **Lỗi người Việt:** "Ich gern esse"; "du esst"; dịch "thích" thành "mögen" cho mọi động từ (Ich mag essen).
- **Văn hoá/ngữ dụng:** Bữa sáng Đức (Brot, Brötchen, Käse, Wurst) và bữa tối lạnh "Abendbrot".

#### A1U03L2 · Gọi món – Akkusativ (Ich nehme den Salat.)
- **Key** `de:lesson:a1u03-ich-nehme-den-salat` · file `02-ich-nehme-den-salat.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Gọi món, hỏi thực đơn, xin thanh toán ở nhà hàng.
- **Ngữ pháp mới:** `a1u03-g-akkusativ` (tân ngữ trực tiếp: chỉ giống đực đổi der→den, ein→einen, kein→keinen, mein→meinen; die/das/số nhiều giữ nguyên; hỏi wen?/was?)
- **Từ mới** (trường: nhà hàng): nehmen (du nimmst) · der Salat, -e · die Suppe, -n · das Fleisch (Sg.) · der Fisch, -e · der Reis (Sg.) · die Speisekarte, -n · bestellen · die Rechnung, -en · Zusammen oder getrennt? (`phrase`)
- **Lỗi người Việt:** quên đổi den/einen (tiếng Việt không biến hình); đổi cả giống cái thành "einen".
- **Văn hoá/ngữ dụng:** Ở Đức gọi phục vụ để trả tiền tại bàn, hỏi "zusammen oder getrennt?" (trả chung hay riêng); tiền bo khoảng 5–10 % làm tròn.

#### A1U03L3 · Tôi muốn… – möchten, mögen (Ich möchte ein Stück Kuchen.)
- **Key** `de:lesson:a1u03-ich-moechte` · file `03-ich-moechte.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Đặt mua lịch sự ở tiệm bánh/quán cà phê; nối hai ý bằng und/aber/oder.
- **Ngữ pháp mới:** `a1u03-g-moechten` (ich möchte, du möchtest, er möchte – không có -t ở ngôi 3; + Akk hoặc + động từ nguyên thể cuối câu) · `a1u03-g-moegen` (mag, magst, mag; mögen + danh từ = thích; möchte = muốn bây giờ) · `a1u03-g-und-aber-oder` (liên từ ở vị trí 0, không đổi trật tự)
- **Từ mới** (trường: quán cà phê, tiệm bánh): der Kuchen, - · das Stück, -e · das Glas, ¨-er · die Tasse, -n · die Flasche, -n · der Zucker (Sg.) · lecker · süß · die Bäckerei, -en · Was darf es sein? (`phrase`) · Ich hätte gern … (`phrase`)
- **Lỗi người Việt:** "er möchtet"; "ein Glas von Wasser"; đảo động từ sau aber ("aber ich möchte" là đúng, "aber möchte ich" sai).
- **Văn hoá/ngữ dụng:** "Ich hätte gern …" là cách gọi hàng lịch sự nhất – học như cụm (Konjunktiv II học ở A2U04/B1U04). Kaffee und Kuchen buổi chiều.

#### A1U03L4 · Ở chợ, ở siêu thị – giá và số lượng (Auf dem Markt)
- **Key** `de:lesson:a1u03-auf-dem-markt` · file `04-auf-dem-markt.yaml` · level `a1` · skills `listening, speaking, vocabulary`
- **Can-do:** Hỏi giá, nói số lượng, nghe giá tiền và tổng tiền.
- **Ngữ pháp mới:** `a1u03-g-zahlen-gross` (hundert, tausend, eine Million; viết 1.000 và 2,50 €; đọc 2,50 € = zwei Euro fünfzig) · `a1u03-g-mengen` (Wie viel?/Wie viele?; ein Kilo Tomaten, 200 Gramm Käse – không có giới từ; Euro/Kilo/Gramm sau số không thêm số nhiều)
- **Từ mới** (trường: mua sắm thực phẩm): kosten · kaufen · brauchen · der Euro, -s · der Cent, -s · das Kilo, -s · die Tomate, -n · die Kartoffel, -n · der Supermarkt, ¨-e · teuer · billig
- **Lỗi người Việt:** dùng dấu chấm thập phân (2.50); "zwei Euros"; nghe nhầm -zehn/-zig (fünfzehn/fünfzig).
- **Văn hoá/ngữ dụng:** Áo: der Paradeiser (cà chua), der Erdapfel (khoai tây); Thụy Sĩ dùng Franken (CHF). Mang túi riêng, Pfand chai (chi tiết ở A2U08L2).

#### A1U03L5 · Ôn tập: thực đơn, danh sách mua sắm (Wiederholung)
- **Key** `de:lesson:a1u03-wiederholung` · file `05-wiederholung.yaml` · level `a1` · skills `reading, writing, listening, speaking`
- **Can-do:** Đọc thực đơn/quảng cáo siêu thị (kiểu Lesen Teil 2), viết danh sách mua sắm và tin nhắn ngắn nhờ mua đồ, nghe hội thoại mua bán (kiểu Hören Teil 1).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A1U04 · Một ngày của tôi (Mein Tag) · `de:unit:a1u04-tagesablauf` · thư mục `04-tagesablauf`

#### A1U04L1 · Mấy giờ rồi? (Wie spät ist es?)
- **Key** `de:lesson:a1u04-wie-spaet-ist-es` · file `01-wie-spaet-ist-es.yaml` · level `a1` · skills `grammar, vocabulary, listening`
- **Can-do:** Nói giờ trang trọng và thân mật; nói lịch trong ngày.
- **Ngữ pháp mới:** `a1u04-g-uhrzeit` (chính thức: 14:30 = vierzehn Uhr dreißig; thân mật: Viertel nach, Viertel vor, **halb drei = 2:30**) · `a1u04-g-um-von-bis` (um 8 Uhr; von 9 bis 17 Uhr; Wann? / Wie spät ist es? / Wie viel Uhr ist es?)
- **Từ mới** (trường: thời gian trong ngày): die Stunde, -n · die Minute, -n · halb · das Viertel, - · spät · der Morgen, - · der Vormittag, -e · der Nachmittag, -e · der Abend, -e · die Nacht, ¨-e
- **Lỗi người Việt:** hiểu "halb drei" là 3:30 (đúng là 2:30); nhầm Uhr (giờ đồng hồ) với Stunde (khoảng một giờ).
- **Văn hoá/ngữ dụng:** Đúng giờ là chuẩn mực; một số vùng (Đông/Nam Đức, Áo) nói "viertel drei" = 2:15, "dreiviertel drei" = 2:45 – chỉ để nhận biết.

#### A1U04L2 · Tôi dậy lúc bảy giờ – động từ tách (Ich stehe um sieben Uhr auf.)
- **Key** `de:lesson:a1u04-ich-stehe-auf` · file `02-ich-stehe-auf.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Kể thói quen hằng ngày theo trình tự.
- **Ngữ pháp mới:** `a1u04-g-trennbare-verben` (tiền tố tách an-, auf-, aus-, ein-, mit-, fern-, zurück- … đứng cuối câu; trọng âm ở tiền tố) · `a1u04-g-satzklammer` (khung câu: động từ chia ở vị trí 2, phần còn lại ở cuối)
- **Từ mới** (trường: sinh hoạt hằng ngày): aufstehen · frühstücken · einkaufen · anrufen · fernsehen (du siehst fern) · aufräumen · anfangen (fängt an) · schlafen (du schläfst) · duschen · früh
- **Lỗi người Việt:** để tiền tố dính liền ("Ich aufstehe"); nghĩ frühstücken là động từ tách ("Ich stücke früh").
- **Văn hoá/ngữ dụng:** Giờ yên tĩnh buổi tối/Chủ nhật (nhắc trước, học kỹ ở B1U09L2).

#### A1U04L3 · Tôi phải, tôi có thể – động từ khiếm khuyết (Ich kann heute nicht.)
- **Key** `de:lesson:a1u04-ich-kann-nicht` · file `03-ich-kann-nicht.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói khả năng, nghĩa vụ, mong muốn; từ chối một lời rủ có lý do.
- **Ngữ pháp mới:** `a1u04-g-modalverben` (können, müssen, wollen: ich/er không đuôi – ich kann, er muss; nguyên âm đổi ở số ít) · `a1u04-g-modal-satzklammer` (động từ khiếm khuyết vị trí 2, nguyên thể cuối câu)
- **Từ mới** (trường: việc nhà, việc học): können · müssen · wollen · kochen · putzen · die Hausaufgabe, -n · der Kurs, -e · die Pause, -n · leider · morgen
- **Lỗi người Việt:** "er kannt", "ich muss zu arbeiten" (thêm zu); đặt nguyên thể ngay sau modal như tiếng Việt ("Ich kann kochen Pho" → đúng: Ich kann Pho kochen).
- **Văn hoá/ngữ dụng:** Từ chối lịch sự: "Leider kann ich heute nicht. Ich muss arbeiten."

#### A1U04L4 · Thứ, ngày, tháng (Wochentage und Termine)
- **Key** `de:lesson:a1u04-wochentage-termine` · file `04-wochentage-termine.yaml` · level `a1` · skills `listening, speaking, vocabulary`
- **Can-do:** Nói ngày sinh, hẹn ngày, hiểu thông báo ngày giờ.
- **Ngữ pháp mới:** `a1u04-g-am-im-um` (am + ngày/thứ/buổi: am Montag, am Wochenende; im + tháng/mùa: im Mai; um + giờ) · `a1u04-g-ordinalzahlen` (số thứ tự: der erste, zweite, dritte, siebte; -te đến 19, -ste từ 20; ngày: am ersten Mai, viết 1. Mai)
- **Từ mới** (trường: lịch): die Woche, -n · das Wochenende, -n · der Tag, -e · die Wochentage (`phrase`: Montag … Sonntag) · der Monat, -e · die Monate (`phrase`: Januar … Dezember) · die Jahreszeiten (`phrase`: der Frühling, der Sommer, der Herbst, der Winter) · der Geburtstag, -e · das Datum, Daten
- **Lỗi người Việt:** "in Montag"; đọc ngày theo thứ tự tiếng Việt; "der dreite".
- **Văn hoá/ngữ dụng:** Tuần bắt đầu thứ Hai; Áo: Jänner (= Januar), Feber. Chúc sinh nhật trước ngày bị coi là xui.

#### A1U04L5 · Ôn tập: một ngày của tôi (Wiederholung)
- **Key** `de:lesson:a1u04-wiederholung` · file `05-wiederholung.yaml` · level `a1` · skills `reading, writing, listening`
- **Can-do:** Đọc kế hoạch tuần, viết 5–6 câu về một ngày của mình, nghe đoạn hội thoại hẹn giờ và chọn đúng giờ (kiểu Hören Teil 1).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A1U05 · Nhà ở và thành phố (Wohnen und Orte) · `de:unit:a1u05-wohnen-stadt` · thư mục `05-wohnen-stadt`

#### A1U05L1 · Căn hộ của tôi – es gibt (Meine Wohnung)
- **Key** `de:lesson:a1u05-meine-wohnung` · file `01-meine-wohnung.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Tả căn hộ: có mấy phòng, phòng như thế nào.
- **Ngữ pháp mới:** `a1u05-g-es-gibt` (es gibt + Akkusativ: Es gibt einen Balkon.) · `a1u05-g-possessiv-plural` (unser/unsere, euer/eure – lưu ý euer bỏ e: eure Wohnung)
- **Từ mới** (trường: nhà ở): geben (du gibst) · die Wohnung, -en · das Zimmer, - · die Küche, -n · das Bad, ¨-er · das Wohnzimmer, - · das Schlafzimmer, - · der Balkon, -e · hell · ruhig · die Miete, -n
- **Lỗi người Việt:** dịch "có" thành haben ("Die Wohnung hat einen Balkon" đúng nhưng "Hier hat einen Park" sai → "Hier gibt es einen Park"); "es gibt ein Balkon" (thiếu Akk).
- **Văn hoá/ngữ dụng:** Quảng cáo nhà ở Đức tính số phòng không gồm bếp/bad (2-Zimmer-Wohnung); Kaltmiete/Warmmiete (giới thiệu, lemma ở A2U02L4).

#### A1U05L2 · Đồ đạc – đại từ Akkusativ (Ich finde ihn schön.)
- **Key** `de:lesson:a1u05-moebel` · file `02-moebel.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Hỏi và nêu nhận xét về đồ đạc; thay danh từ bằng đại từ đúng giống.
- **Ngữ pháp mới:** `a1u05-g-personalpronomen-akk` (mich, dich, ihn, sie, es, uns, euch, sie/Sie) · `a1u05-g-pronomen-genus` (đại từ theo **giống ngữ pháp**: der Tisch → er/ihn, die Lampe → sie, das Sofa → es; tiếng Việt chỉ dùng "nó")
- **Từ mới** (trường: đồ đạc): das Sofa, -s · der Schrank, ¨-e · das Regal, -e · die Lampe, -n · der Teppich, -e · die Möbel (Pl.) · finden (Wie findest du …?) · gemütlich · modern · praktisch
- **Lỗi người Việt:** dùng "es" cho mọi đồ vật; "Ich finde er schön" (thiếu Akk).
- **Văn hoá/ngữ dụng:** "gemütlich" – khái niệm ấm cúng rất Đức.

#### A1U05L3 · Ngân hàng ở đâu? – Dativ chỉ nơi chốn (Wo ist die Bank?)
- **Key** `de:lesson:a1u05-wo-ist-die-bank` · file `03-wo-ist-die-bank.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Hỏi và nói vị trí của địa điểm, đồ vật.
- **Ngữ pháp mới:** `a1u05-g-dativ-artikel` (Dativ: dem/der/dem/den + -n ở số nhiều; einem/einer/einem; keinem/meinem…; im = in dem, am = an dem) · `a1u05-g-wo-praep-dativ` (Wo? + in, an, auf, neben, hinter, vor, über, unter, zwischen + Dativ – chỉ vị trí đứng yên)
- **Từ mới** (trường: địa điểm trong thành phố): die Bank, -en · die Post (Sg.) · der Bahnhof, ¨-e · die Apotheke, -n · der Park, -s · das Zentrum, Zentren · die Kirche, -n · die Haltestelle, -n · neben · zwischen
- **Lỗi người Việt:** dùng Nominativ sau giới từ ("neben der Bahnhof" → neben dem Bahnhof); nhầm an/auf/in (dạy hình ảnh: an = sát cạnh, auf = trên bề mặt, in = bên trong).
- **Văn hoá/ngữ dụng:** die Bank (ngân hàng) số nhiều die Banken; die Bank (ghế băng) số nhiều die Bänke – chỉ nhắc.

#### A1U05L4 · Hỏi đường – câu mệnh lệnh (Wie komme ich zum …? Gehen Sie geradeaus!)
- **Key** `de:lesson:a1u05-wie-komme-ich` · file `04-wie-komme-ich.yaml` · level `a1` · skills `listening, speaking, grammar`
- **Can-do:** Hỏi đường, hiểu và chỉ đường đơn giản.
- **Ngữ pháp mới:** `a1u05-g-imperativ` (Sie: Gehen Sie!; du: Geh!/Nimm!/Lies! – e→i giữ, a→ä bỏ: Fahr!; ihr: Geht!; sein: Sei!/Seien Sie!) · `a1u05-g-hoefliche-bitte` (bitte trong câu mệnh lệnh; Können Sie mir helfen? – mir học như cụm)
- **Từ mới** (trường: chỉ đường): gehen · geradeaus · links · rechts · die Ampel, -n · die Kreuzung, -en · die Ecke, -n · weit · nah · zu Fuß (`phrase`)
- **Lỗi người Việt:** quên Sie trong mệnh lệnh lịch sự ("Gehen geradeaus!"); "Fährst!"; mệnh lệnh không có bitte nghe cộc.
- **Văn hoá/ngữ dụng:** "Wie komme ich zum Bahnhof?" – zum = zu dem, học như cụm ở đây (giới từ zu + Dativ dạy ở A1U07L1).

#### A1U05L5 · Ôn tập: quảng cáo nhà, e-mail tả nhà (Wiederholung)
- **Key** `de:lesson:a1u05-wiederholung` · file `05-wiederholung.yaml` · level `a1` · skills `reading, writing, listening`
- **Can-do:** Đọc quảng cáo cho thuê nhà ngắn (kiểu Lesen Teil 2), viết e-mail ngắn tả căn hộ mới, nghe chỉ đường và chọn bản đồ đúng.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A1U06 · Thời gian rảnh và hẹn gặp (Freizeit und Verabredungen) · `de:unit:a1u06-freizeit` · thư mục `06-freizeit`

#### A1U06L1 · Sở thích (Hobbys – gern, lieber, am liebsten)
- **Key** `de:lesson:a1u06-hobbys` · file `01-hobbys.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói sở thích, so sánh điều mình thích hơn, thích nhất; nói tần suất.
- **Ngữ pháp mới:** `a1u06-g-gern-lieber-am-liebsten` (bậc so sánh bất quy tắc của gern)
- **Từ mới** (trường: giải trí): lesen (du liest) · schwimmen · tanzen · spielen · wandern · singen · die Freizeit (Sg.) · das Konzert, -e · oft · manchmal · zum Beispiel (`phrase`, z. B.)
- **Lỗi người Việt:** "Ich lese mehr gern"; "am liebste".
- **Văn hoá/ngữ dụng:** Vereine (câu lạc bộ) là nơi chơi thể thao phổ biến ở Đức.

#### A1U06L2 · Bạn có rảnh không? – dürfen, man (Hast du Zeit?)
- **Key** `de:lesson:a1u06-hast-du-zeit` · file `02-hast-du-zeit.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Rủ, nhận lời, từ chối, đề xuất giờ khác; hiểu biển cấm đơn giản.
- **Ngữ pháp mới:** `a1u06-g-duerfen` (darf, darfst, darf – cho phép/cấm: Hier darf man nicht parken.) · `a1u06-g-man` (man + động từ ngôi 3 số ít, nghĩa "người ta")
- **Từ mới** (trường: hẹn hò, lời mời): einladen (lädt ein) · treffen (trifft) · die Party, -s · zusammen · Lust haben (`phrase`) · Gute Idee! (`phrase`) · vielleicht · schade · immer · nie · ins Kino gehen (`phrase`)
- **Lỗi người Việt:** "man müssen"; trả lời lời mời chỉ bằng "Nein." (cần lý do + lời cảm ơn).
- **Ràng buộc tiền quyết:** "ins Kino/ins Konzert gehen" là cụm cố định; in + Akk (wohin?) học có hệ thống ở A2U02L1.
- **Văn hoá/ngữ dụng:** Hẹn trước, đến đúng giờ; "Lust haben" thân mật hơn "möchten".

#### A1U06L3 · Bạn đã làm gì? – Perfekt với haben (Was hast du gemacht?)
- **Key** `de:lesson:a1u06-was-hast-du-gemacht` · file `03-was-hast-du-gemacht.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Kể ngắn về hôm qua, cuối tuần.
- **Ngữ pháp mới:** `a1u06-g-perfekt-haben` (haben ở vị trí 2 + Partizip II cuối câu) · `a1u06-g-partizip-ii` (động từ thường ge-…-t: gemacht, gekauft; động từ mạnh ge-…-en: gesehen, gegessen, getrunken; động từ tách: ein**ge**kauft, fern**ge**sehen)
- **Từ mới** (trường: hoạt động cuối tuần): gestern · letzt- (letzte Woche, letztes Wochenende – `phrase`) · der Film, -e · sehen (du siehst) · besuchen · das Museum, Museen · der Ausflug, ¨-e · Spaß machen (`phrase`) · toll · langweilig
- **Lỗi người Việt:** dùng hiện tại + "gestern" ("Gestern ich sehe …"); đặt Partizip ngay sau haben; "gesiehen".
- **Ràng buộc tiền quyết:** chưa dùng động từ có tiền tố không tách (besucht, bezahlt) và -ieren trong bài tập sản sinh – học ở A2U01L1; "besuchen" chỉ dùng ở hiện tại trong bài này.

#### A1U06L4 · Tôi đã đi – Perfekt với sein, war/hatte, thời tiết (Ich bin gefahren.)
- **Key** `de:lesson:a1u06-ich-bin-gefahren` · file `04-ich-bin-gefahren.yaml` · level `a1` · skills `listening, speaking, grammar`
- **Can-do:** Kể chuyến đi ngắn, nói thời tiết hôm đó thế nào.
- **Ngữ pháp mới:** `a1u06-g-perfekt-sein` (sein + Partizip II với động từ chuyển động/đổi trạng thái và sein, bleiben: Ich bin gefahren/geblieben/gewesen) · `a1u06-g-praeteritum-sein-haben` (war, warst, war, waren, wart, waren; hatte … – dùng thay Perfekt với sein/haben)
- **Từ mới** (trường: thời tiết, di chuyển): fahren (du fährst) · fliegen · bleiben · das Wetter (Sg.) · der Regen (Sg.) · regnen (es regnet) · der Schnee (Sg.) · warm · kalt · heiß
- **Lỗi người Việt:** "Ich habe gefahren" (aux sai); "Ich habe gewesen"; "Es ist gestern kalt" (quên war).
- **Văn hoá/ngữ dụng:** Miền Nam Đức/Áo/Thụy Sĩ dùng sein với sitzen/stehen/liegen (ich bin gesessen) – chuẩn Đức (miền Bắc) dùng haben; đề thi theo chuẩn Đức. Nhiệt độ độ C (20 Grad).

#### A1U06L5 · Ôn tập: bưu thiếp, trả lời lời mời (Wiederholung)
- **Key** `de:lesson:a1u06-wiederholung` · file `05-wiederholung.yaml` · level `a1` · skills `reading, writing, speaking`
- **Can-do:** Đọc bưu thiếp/blog kể cuối tuần (Perfekt), viết tin nhắn ~30 từ trả lời lời mời (kiểu Schreiben Teil 2: nhận/từ chối + lý do + đề xuất), hẹn giờ với bạn.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A1U07 · Đi lại và quần áo (Unterwegs und Kleidung) · `de:unit:a1u07-unterwegs-kleidung` · thư mục `07-unterwegs-kleidung`

#### A1U07L1 · Đi bằng tàu – giới từ đi với Dativ (Mit dem Zug nach Berlin)
- **Key** `de:lesson:a1u07-mit-dem-zug` · file `01-mit-dem-zug.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói đi đâu, bằng phương tiện gì, với ai, từ đâu về.
- **Ngữ pháp mới:** `a1u07-g-dativ-praepositionen` (aus, bei, mit, nach, von, zu + Dativ – kể cả mạo từ sở hữu: mit meiner Mutter; rút gọn zum, zur, beim, vom) · `a1u07-g-nach-zu-hause` (nach + thành phố/nước không mạo từ, nach Hause = về nhà; zu + người/địa điểm; zu Hause = ở nhà)
- **Từ mới** (trường: phương tiện): der Zug, ¨-e · die U-Bahn, -en · die S-Bahn, -en · die Straßenbahn, -en · das Flugzeug, -e · der Flughafen, ¨- · die Fahrkarte, -n · das Gleis, -e · nach Hause (`phrase`) · zu Hause (`phrase`)
- **Lỗi người Việt:** "mit der Bus"; "zu Berlin"; nhầm nach Hause/zu Hause; "Ich fahre mit Zug" (thiếu mạo từ).
- **Văn hoá/ngữ dụng:** Thụy Sĩ: das Tram, das Billett; Áo: die Bim (thân mật, tàu điện Vienna).

#### A1U07L2 · Ở nhà ga – welcher (Welcher Zug fährt nach München?)
- **Key** `de:lesson:a1u07-am-bahnhof` · file `02-am-bahnhof.yaml` · level `a1` · skills `listening, speaking, vocabulary`
- **Can-do:** Mua vé, hỏi giờ tàu, sân ga; hiểu thông báo trễ tàu.
- **Ngữ pháp mới:** `a1u07-g-welcher` (welcher/welche/welches – đuôi như mạo từ xác định ở Nom/Akk)
- **Từ mới** (trường: nhà ga, lịch trình): abfahren · ankommen · umsteigen · die Abfahrt, -en · die Ankunft, ¨-e · die Verspätung, -en · pünktlich · der Fahrplan, ¨-e · einfach (vé một chiều) · hin und zurück (`phrase`)
- **Lỗi người Việt:** nghe giờ chính thức (14.35) chậm; "Welche Zug".
- **Văn hoá/ngữ dụng:** Tàu Đức hay trễ – thông báo "Der Zug hat zehn Minuten Verspätung"; vé vùng/Deutschlandticket (giới thiệu, có thể thay đổi – ghi "kiểm tra thời điểm phát hành").

#### A1U07L3 · Quần áo – đại từ Dativ (Die Jacke gefällt mir.)
- **Key** `de:lesson:a1u07-kleidung` · file `03-kleidung.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói mình mặc gì, khen/chê quần áo, nói vừa/không vừa.
- **Ngữ pháp mới:** `a1u07-g-personalpronomen-dativ` (mir, dir, ihm, ihr, ihm, uns, euch, ihnen/Ihnen) · `a1u07-g-gefallen-passen-stehen` (vật là chủ ngữ, người ở Dativ: Die Hose passt mir nicht.)
- **Từ mới** (trường: quần áo, màu sắc): die Kleidung (Sg.) · die Hose, -n · das Hemd, -en · die Jacke, -n · der Pullover, - · das Kleid, -er · der Schuh, -e · die Farben (`phrase`: rot, blau, grün, gelb, schwarz, weiß, grau) · tragen (trägt) · gefallen (gefällt) · passen
- **Lỗi người Việt:** "Ich gefalle die Jacke" (dịch theo "Tôi thích"); "Die Hose passt mich".
- **Văn hoá/ngữ dụng:** Cỡ giày/quần áo châu Âu (38, 40 …).

#### A1U07L4 · Rẻ hơn, đẹp hơn – so sánh (Größer und billiger)
- **Key** `de:lesson:a1u07-vergleiche` · file `04-vergleiche.yaml` · level `a1` · skills `listening, speaking, grammar`
- **Can-do:** So sánh giá, cỡ, kiểu dáng khi mua sắm; nghe đoạn hội thoại trong cửa hàng.
- **Ngữ pháp mới:** `a1u07-g-komparativ` (tính từ + -er + als; so … wie bằng nhau; nhiều từ một âm tiết thêm umlaut: groß–größer, alt–älter; bất quy tắc gut–besser, viel–mehr)
- **Từ mới** (trường: cửa hàng quần áo): die Größe, -n · kurz · lang · eng · bequem · schick · das Kaufhaus, ¨-er · der Preis, -e · das Angebot, -e · die Kasse, -n
- **Lỗi người Việt:** "mehr billig" (theo tiếng Anh "more"); "größer wie" (văn nói, không chuẩn) – dạy "als".
- **Văn hoá/ngữ dụng:** Cửa hàng đóng cửa Chủ nhật ở Đức (Ladenschluss) – thường gặp trong đề Lesen.

#### A1U07L5 · Ôn tập: biển báo, thông báo nhà ga, tin nhắn (Wiederholung)
- **Key** `de:lesson:a1u07-wiederholung` · file `05-wiederholung.yaml` · level `a1` · skills `reading, listening, writing`
- **Can-do:** Đọc biển báo/thông báo (kiểu Lesen Teil 3), nghe thông báo ở ga (kiểu Hören Teil 2), viết SMS báo đến muộn.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A1U08 · Sức khoẻ, cơ quan và ôn A1 (Gesundheit, Ämter, Start Deutsch 1) · `de:unit:a1u08-gesundheit-aemter` · thư mục `08-gesundheit-aemter`

#### A1U08L1 · Cơ thể – sollen, đau ở đâu (Mir tut der Kopf weh.)
- **Key** `de:lesson:a1u08-der-koerper` · file `01-der-koerper.yaml` · level `a1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói chỗ đau, thuật lại lời bác sĩ dặn.
- **Ngữ pháp mới:** `a1u08-g-sollen` (soll, sollst, soll – lời người khác yêu cầu: Der Arzt sagt, ich soll im Bett bleiben.) · `a1u08-g-wehtun` (Mir tut der Kopf weh / Mir tun die Füße weh – người đau ở Dativ, động từ theo bộ phận)
- **Từ mới** (trường: cơ thể): der Körper, - · der Kopf, ¨-e · der Bauch, ¨-e · der Rücken, - · der Arm, -e · das Bein, -e · der Fuß, ¨-e · die Hand, ¨-e · das Auge, -n · der Hals, ¨-e · wehtun
- **Lỗi người Việt:** "Ich tue Kopf weh"; "Mein Kopf tut mir weh" (được nhưng ít tự nhiên hơn – chấp nhận).
- **Ghi chú:** "Der Arzt sagt, ich soll …" – sau dấu phẩy là câu chính (không phải câu phụ), không cần dass.

#### A1U08L2 · Đi khám bệnh (Beim Arzt)
- **Key** `de:lesson:a1u08-beim-arzt` · file `02-beim-arzt.yaml` · level `a1` · skills `listening, speaking, vocabulary`
- **Can-do:** Đặt lịch khám qua điện thoại, nói triệu chứng, hiểu cách dùng thuốc.
- **Ngữ pháp mới:** `a1u08-g-wie-oft-mal` (einmal/zweimal/dreimal am Tag; täglich; jeden Tag – cụm)
- **Từ mới** (trường: bệnh, phòng khám): krank · gesund · das Fieber (Sg.) · der Husten (Sg.) · der Schnupfen (Sg.) · die Erkältung, -en · die Praxis, Praxen · die Tablette, -n · das Rezept, -e · der Termin, -e
- **Lỗi người Việt:** "Ich bin Fieber" (dịch "bị"); "Ich habe ein Fieber"; nhầm Rezept (đơn thuốc) với Quittung.
- **Văn hoá/ngữ dụng:** Đi bác sĩ gia đình (Hausarzt) trước, gọi điện hẹn; mang thẻ bảo hiểm (lemma ở A2U04L4).

#### A1U08L3 · Ở cơ quan hành chính – für, ohne (Auf dem Amt)
- **Key** `de:lesson:a1u08-auf-dem-amt` · file `03-auf-dem-amt.yaml` · level `a1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc giờ mở cửa, hỏi giấy tờ cần mang, đăng ký cư trú cơ bản.
- **Ngữ pháp mới:** `a1u08-g-akk-praepositionen` (für, ohne, durch, gegen, um + Akkusativ: einen Termin für Montag, ohne Termin)
- **Từ mới** (trường: thủ tục): das Amt, ¨-er · der Ausweis, -e · der Pass, ¨-e · die Unterschrift, -en · unterschreiben · anmelden · die Anmeldung, -en · geöffnet · geschlossen · die Öffnungszeiten (Pl.)
- **Lỗi người Việt:** "für mich" đúng nhưng "für ich"; dùng Dativ sau für.
- **Văn hoá/ngữ dụng:** Đăng ký nơi ở (Anmeldung) tại Bürgeramt trong vòng 2 tuần sau khi chuyển đến (Đức); Termin thường đặt online.

#### A1U08L4 · Viết thiệp và e-mail ngắn (Eine Karte, eine E-Mail)
- **Key** `de:lesson:a1u08-e-mail-schreiben` · file `04-e-mail-schreiben.yaml` · level `a1` · skills `writing, reading, vocabulary`
- **Can-do:** Viết thiệp/e-mail ~30 từ thân mật và trang trọng (mở đầu, nội dung, chào kết đúng).
- **Ngữ pháp mới:** `a1u08-g-anrede-gruss` (Liebe Anna, / Lieber Tom, / Hallo Lisa, ↔ Sehr geehrte Frau Weber, / Sehr geehrter Herr Klein, / Sehr geehrte Damen und Herren,; sau dấu phẩy viết thường; Viele Grüße ↔ Mit freundlichen Grüßen)
- **Từ mới** (trường: thư từ): die Karte, -n · der Brief, -e · die Nachricht, -en · schreiben · schicken · antworten · die Einladung, -en · der Gruß, ¨-e · herzlich · Herzlichen Glückwunsch! (`phrase`)
- **Lỗi người Việt:** viết hoa sau dấu phẩy của lời chào; "Liebe Tom"; dùng "Hallo" trong thư cơ quan.
- **Văn hoá/ngữ dụng:** "Herr" trong "Sehr geehrter Herr Klein" (đuôi -er của tính từ học như cụm; n-Deklination: "an Herrn Klein").

#### A1U08L5 · Ôn A1 – bài thi mô phỏng Start Deutsch 1 (Modelltest)
- **Key** `de:lesson:a1u08-modelltest-start-deutsch-1` · file `05-modelltest-start-deutsch-1.yaml` · level `a1` · skills `listening, reading, writing, speaking`
- **Can-do:** Làm được dạng bài của 4 phần Start Deutsch 1: Hören (hội thoại ngắn, thông báo), Lesen (tin nhắn, quảng cáo, biển báo), Schreiben (Teil 1 điền form; Teil 2 tin nhắn ~30 từ theo 3 ý), Sprechen (giới thiệu; hỏi–đáp theo thẻ chủ đề; đưa ra/đáp lời đề nghị theo thẻ hình).
- **Ngữ pháp mới:** — · **Từ mới:** — (reuse toàn A1; mỗi bài tập ghi rõ phần thi tương ứng trong `explanation`)

### Chương trình A2 · `de:program:a2` (a2)

Từ A2, động từ bất quy tắc ghi đủ dạng trên thẻ: `fahren, fährt, fuhr, ist gefahren`. Mỗi bài 5 có ít nhất một nhiệm vụ viết giao tiếp.

---

#### Unit A2U01 · Kể chuyện (Erzählen) · `de:unit:a2u01-erzaehlen` · thư mục `01-erzaehlen`

#### A2U01L1 · Cuối tuần của bạn thế nào? – Perfekt mở rộng (Was hast du erlebt?)
- **Key** `de:lesson:a2u01-am-wochenende` · file `01-am-wochenende.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Kể chi tiết một trải nghiệm bằng Perfekt, kể cả động từ có tiền tố không tách và -ieren.
- **Ngữ pháp mới:** `a2u01-g-partizip-praefix-ieren` (tiền tố không tách be-, emp-, ent-, er-, ge-, miss-, ver-, zer- và động từ -ieren: **không** thêm ge- – besucht, vergessen, passiert, telefoniert; đối chiếu với tách: eingekauft)
- **Từ mới** (trường: trải nghiệm): erleben · besichtigen · verpassen · vergessen, vergisst, vergaß, hat vergessen · passieren (ist passiert) · erzählen · telefonieren · probieren · fotografieren · das Erlebnis, -se
- **Lỗi người Việt:** "gebesucht", "geverpasst", "hat passiert" (passieren đi với sein).
- **Văn hoá/ngữ dụng:** Văn nói Đức kể quá khứ bằng Perfekt; Präteritum chủ yếu trong văn viết (trừ sein/haben/modal).

#### A2U01L2 · Tôi đã phải làm việc – Präteritum của động từ khiếm khuyết (Ich musste arbeiten.)
- **Key** `de:lesson:a2u01-ich-musste-arbeiten` · file `02-ich-musste-arbeiten.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Kể việc mình đã phải/muốn/không thể làm và sắp xếp câu chuyện theo trình tự.
- **Ngữ pháp mới:** `a2u01-g-praeteritum-modal` (konnte, musste, wollte, durfte, sollte, mochte – bỏ umlaut; ich/er không đuôi) · `a2u01-g-erzaehl-adverbien` (zuerst, dann, danach, später, zum Schluss đứng vị trí 1 → động từ vị trí 2)
- **Từ mới** (trường: sự cố, trình tự): zuerst · dann · danach · später · zum Schluss · plötzlich · endlich · der Unfall, ¨-e · die Panne, -n · der Stau, -s
- **Lỗi người Việt:** "Ich müsste" (Konjunktiv II) thay vì "musste"; "Dann ich bin gefahren" (mất V2).

#### A2U01L3 · Cách đây một năm – mốc thời gian (Vor einem Jahr)
- **Key** `de:lesson:a2u01-vor-einem-jahr` · file `03-vor-einem-jahr.yaml` · level `a2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đặt sự việc đúng mốc thời gian quá khứ/tương lai.
- **Ngữ pháp mới:** `a2u01-g-vor-nach-dativ` (vor/nach + Dativ: vor dem Essen, nach der Arbeit, **vor zwei Jahren = cách đây hai năm**) · `a2u01-g-zeitangaben-akk` (letzte Woche, nächsten Monat, jeden Tag, diesen Sommer – Akkusativ không giới từ)
- **Từ mới** (trường: thời gian): vorgestern · übermorgen · nächst- (nächste Woche – `phrase`) · früher · damals · neulich · der Moment, -e · das Mal, -e (zum ersten Mal)
- **Lỗi người Việt:** "vor zwei Jahre" (thiếu -n Dativ số nhiều); "in letzte Woche"; "nach zwei Jahren" hiểu thành "hai năm nữa" (đúng: in zwei Jahren).

#### A2U01L4 · Lý lịch của tôi – seit, năm (Mein Lebenslauf)
- **Key** `de:lesson:a2u01-mein-lebenslauf` · file `04-mein-lebenslauf.yaml` · level `a2` · skills `listening, speaking, vocabulary`
- **Can-do:** Kể các mốc đời mình, nói việc kéo dài đến nay; nghe phỏng vấn tiểu sử.
- **Ngữ pháp mới:** `a2u01-g-seit-praesens` (seit + Dativ + **hiện tại** cho việc còn tiếp diễn: Ich wohne seit drei Jahren hier.) · `a2u01-g-jahreszahlen` (2010 = zweitausendzehn, 1998 = neunzehnhundertachtundneunzig; nói "2010" hoặc "im Jahr 2010", **không** "in 2010")
- **Từ mới** (trường: tiểu sử, học vấn): geboren (Ich bin … geboren.) · die Grundschule, -n · das Gymnasium, Gymnasien · das Abitur (Sg.) · die Ausbildung, -en · studieren · der Lebenslauf, ¨-e · die Erfahrung, -en · heiraten · die Prüfung, -en
- **Lỗi người Việt:** "Ich wohne hier seit drei Jahren gewohnt" (dùng Perfekt theo "đã… được"); "Ich bin in 1999 geboren".
- **Văn hoá/ngữ dụng:** Lebenslauf dạng bảng, có ảnh tuỳ chọn; Ausbildung (học nghề kép) là con đường phổ biến – giải thích ngắn.

#### A2U01L5 · Ôn tập: e-mail kể cuối tuần (Wiederholung)
- **Key** `de:lesson:a2u01-wiederholung` · file `05-wiederholung.yaml` · level `a2` · skills `reading, writing, listening`
- **Can-do:** Đọc blog du lịch ngắn; **viết** e-mail thân mật 40–50 từ kể cuối tuần (3 ý cho trước, kiểu Goethe A2 Schreiben Teil 2).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A2U02 · Nhà ở và chuyển nhà (Wohnen und Umziehen) · `de:unit:a2u02-wohnen-umziehen` · thư mục `02-wohnen-umziehen`

#### A2U02L1 · Để cái này ở đâu? – giới từ hai cách (Wohin stellen wir das Sofa?)
- **Key** `de:lesson:a2u02-wohin-damit` · file `01-wohin-damit.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Sắp xếp đồ khi chuyển nhà: nói đặt đâu, đang ở đâu.
- **Ngữ pháp mới:** `a2u02-g-wechselpraepositionen` (in, an, auf, über, unter, vor, hinter, neben, zwischen: Wohin? → Akkusativ (chuyển động tới), Wo? → Dativ (vị trí); ins = in das, ans = an das) · `a2u02-g-positionsverben` (stellen/stehen, legen/liegen, setzen/sitzen, hängen (hängte – hing); động từ "đặt" là động từ yếu + Akk, động từ "ở" là động từ mạnh + Dat)
- **Từ mới** (trường: chuyển nhà): stellen · stehen, stand, hat gestanden · legen · liegen, lag, hat gelegen · setzen · sitzen, saß, hat gesessen · hängen · der Umzug, ¨-e · umziehen, zog um, ist umgezogen · der Karton, -s
- **Lỗi người Việt:** "Ich stelle das Buch auf dem Tisch" (lẫn Dat/Akk); dùng "machen/để" chung cho mọi động từ đặt.
- **Văn hoá/ngữ dụng:** Bếp thường không có sẵn khi thuê nhà ở Đức (Einbauküche) – mẹo văn hoá.

#### A2U02L2 · Đưa anh ấy chìa khoá – hai tân ngữ (Gib ihm den Schlüssel!)
- **Key** `de:lesson:a2u02-gib-ihm-den-schluessel` · file `02-gib-ihm-den-schluessel.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nhờ/đưa/tặng ai cái gì với hàng xóm, chủ nhà.
- **Ngữ pháp mới:** `a2u02-g-dat-akk-verben` (geben, schenken, zeigen, bringen, leihen, erklären: người ở Dativ, vật ở Akkusativ) · `a2u02-g-objekt-stellung` (hai danh từ: Dativ trước Akk; có đại từ Akk: Akk trước (Ich gebe ihn dem Nachbarn / Ich gebe ihn ihm))
- **Từ mới** (trường: hàng xóm, chìa khoá): der Schlüssel, - · der Nachbar, -n · die Nachbarin, -nen · schenken · zeigen · bringen, brachte, hat gebracht · leihen, lieh, hat geliehen · erklären · der Hausmeister, -
- **Lỗi người Việt:** "Ich gebe den Nachbarn den Schlüssel" (Dat số ít sai: dem Nachbarn – n-Deklination nêu như từ riêng); đổi thứ tự đại từ.

#### A2U02L3 · Một căn hộ sáng sủa – đuôi tính từ sau ein (Eine helle Wohnung)
- **Key** `de:lesson:a2u02-eine-helle-wohnung` · file `03-eine-helle-wohnung.yaml` · level `a2` · skills `grammar, vocabulary, reading`
- **Can-do:** Tả căn hộ/phòng chi tiết bằng tính từ đứng trước danh từ.
- **Ngữ pháp mới:** `a2u02-g-adj-unbestimmt-nom-akk` (bảng 1, sau ein/kein/mein: Nom ein großer Balkon, eine helle Küche, ein ruhiges Zimmer; Akk einen großen Balkon; số nhiều sau keine/meine: -en; tính từ sau sein vẫn không đuôi)
- **Từ mới** (trường: tả nhà): dunkel · laut · leise · sauber · schmutzig · möbliert · der Altbau, -ten · der Neubau, -ten · die Lage, -n · zentral
- **Lỗi người Việt:** quên đuôi ("ein groß Balkon"); thêm đuôi sau sein ("Die Küche ist helle"); "dunkele" (đúng: dunkle).

#### A2U02L4 · Xem nhà – Dativ sau ein (Die Wohnungsbesichtigung)
- **Key** `de:lesson:a2u02-wohnungsbesichtigung` · file `04-wohnungsbesichtigung.yaml` · level `a2` · skills `listening, speaking, vocabulary`
- **Can-do:** Gọi điện hỏi nhà, hỏi chi phí, nghe cuộc xem nhà và ghi thông tin chính.
- **Ngữ pháp mới:** `a2u02-g-adj-unbestimmt-dativ` (sau einem/einer/meinen…: luôn -en: in einer kleinen Wohnung, mit einem netten Vermieter)
- **Từ mới** (trường: thuê nhà): der Vermieter, - · der Mieter, - · die Nebenkosten (Pl.) · die Kaution, -en · die Anzeige, -n · die Besichtigung, -en · der Quadratmeter, - · mieten · das Stockwerk, -e · die Heizung, -en
- **Lỗi người Việt:** nhầm vermieten/mieten; "in einer kleiner Wohnung".
- **Văn hoá/ngữ dụng:** Kaltmiete + Nebenkosten = Warmmiete; Kaution thường tối đa 3 tháng tiền thuê lạnh (Đức – ghi "cần kiểm tra quy định hiện hành"); Áo dùng "der Stock" phổ biến.

#### A2U02L5 · Ôn tập: e-mail gửi chủ nhà (Wiederholung)
- **Key** `de:lesson:a2u02-wiederholung` · file `05-wiederholung.yaml` · level `a2` · skills `reading, writing, listening`
- **Can-do:** Đọc nội quy nhà/quảng cáo nhà; **viết** e-mail trang trọng ~40 từ cho chủ nhà (báo hỏng hóc, xin hẹn) theo 3 ý.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A2U03 · Công việc và xin việc (Arbeit und Bewerbung) · `de:unit:a2u03-arbeit` · thư mục `03-arbeit`

#### A2U03L1 · Vì tôi… – câu phụ với weil, denn (Weil ich früh anfangen muss)
- **Key** `de:lesson:a2u03-weil-denn` · file `01-weil-denn.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Giải thích lý do (thích/không thích công việc, đến muộn…).
- **Ngữ pháp mới:** `a2u03-g-nebensatz-verbletzt` (câu phụ: động từ chia **cuối** câu; động từ tách ghép lại: weil ich früh aufstehe; modal/haben đứng sau cùng: weil ich arbeiten muss / gearbeitet habe; dấu phẩy bắt buộc) · `a2u03-g-weil` · `a2u03-g-denn` (denn ở vị trí 0, trật tự câu chính – so sánh với weil)
- **Từ mới** (trường: điều kiện làm việc): der Arbeitsplatz, ¨-e · die Stelle, -n · der Job, -s · verdienen · das Gehalt, ¨-er · der Chef, -s · die Arbeitszeit, -en · die Vollzeit (Sg.) · die Teilzeit (Sg.) · der Feierabend, -e
- **Lỗi người Việt:** "weil ich muss arbeiten" (lỗi phổ biến nhất ở A2–B1); quên dấu phẩy; dùng weil + V2 như văn nói.
- **Văn hoá/ngữ dụng:** "Feierabend!" – nét văn hoá tách bạch giờ làm/giờ nghỉ.

#### A2U03L2 · Tôi thấy rằng… – dass (Ich finde, dass …)
- **Key** `de:lesson:a2u03-dass` · file `02-dass.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nêu ý kiến đơn giản về công việc, đồng nghiệp.
- **Ngữ pháp mới:** `a2u03-g-dass` (Ich finde/glaube/denke/weiß, dass …) · `a2u03-g-nebensatz-vorne` (câu phụ đứng đầu chiếm vị trí 1 → động từ câu chính ngay sau dấu phẩy: Weil ich krank bin, bleibe ich zu Hause.)
- **Từ mới** (trường: đánh giá công việc): glauben · denken, dachte, hat gedacht · meinen · wichtig · interessant · anstrengend · stressig · das Team, -s · die Aufgabe, -n · selbstständig
- **Lỗi người Việt:** "Weil ich krank bin, ich bleibe zu Hause" (thứ tự kiểu tiếng Việt/Anh); viết "das" thay cho "dass".

#### A2U03L3 · Gọi điện ở công ty – động từ đi với Dativ (Kann ich Ihnen helfen?)
- **Key** `de:lesson:a2u03-am-telefon` · file `03-am-telefon.yaml` · level `a2` · skills `grammar, listening, speaking`
- **Can-do:** Nhận/chuyển cuộc gọi, nhắn lại, xin gọi lại.
- **Ngữ pháp mới:** `a2u03-g-dativ-verben` (helfen, danken, gehören, gratulieren, zuhören, fehlen, schmecken, antworten + Dativ người: Ich helfe dir. Das Essen schmeckt mir.)
- **Từ mới** (trường: điện thoại công việc): helfen, hilft, half, hat geholfen · danken · gehören · gratulieren · zuhören · fehlen · schmecken · verbinden, verband, hat verbunden · zurückrufen, rief zurück, hat zurückgerufen · ausrichten
- **Lỗi người Việt:** "Ich helfe dich" (theo nghĩa "giúp bạn" như tân ngữ trực tiếp).
- **Văn hoá/ngữ dụng:** Nghe máy ở Đức: nói họ/tên công ty trước ("Firma Becker, Schmidt am Apparat, guten Tag").

#### A2U03L4 · Xin việc – werden (Ich möchte Pflegefachfrau werden.)
- **Key** `de:lesson:a2u03-bewerbung` · file `04-bewerbung.yaml` · level `a2` · skills `listening, speaking, vocabulary`
- **Can-do:** Nói mục tiêu nghề nghiệp, điểm mạnh/yếu; nghe một cuộc phỏng vấn ngắn.
- **Ngữ pháp mới:** `a2u03-g-werden-vollverb` (werden, wirst, wird, werden, werdet, werden = trở thành: Ich werde Ingenieur. Es wird kalt.)
- **Từ mới** (trường: ứng tuyển): werden, wird, wurde, ist geworden · die Bewerbung, -en · das Vorstellungsgespräch, -e · das Praktikum, Praktika · die Stärke, -n · die Schwäche, -n · zuverlässig · flexibel · die Kenntnisse (Pl.) · der Bewerber, -
- **Lỗi người Việt:** "Ich werde ein Arzt"; nhầm werden (trở thành) với wollen (muốn): "Ich will Arzt werden" vs "Ich werde Arzt".
- **Văn hoá/ngữ dụng:** Hồ sơ xin việc ở Đức: Anschreiben + Lebenslauf + Zeugnisse.

#### A2U03L5 · Ôn tập: e-mail xin thực tập ngắn (Wiederholung)
- **Key** `de:lesson:a2u03-wiederholung` · file `05-wiederholung.yaml` · level `a2` · skills `reading, writing, speaking`
- **Can-do:** Đọc tin tuyển dụng ngắn; **viết** e-mail trang trọng ~50 từ hỏi về chỗ thực tập (3 ý); nói về công việc mơ ước.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A2U04 · Sức khoẻ (Gesundheit) · `de:unit:a2u04-gesundheit` · thư mục `04-gesundheit`

#### A2U04L1 · Bạn thấy trong người thế nào? – động từ phản thân (Wie fühlst du dich?)
- **Key** `de:lesson:a2u04-sich-fuehlen` · file `01-sich-fuehlen.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói cảm giác cơ thể, nghỉ ngơi, vận động.
- **Ngữ pháp mới:** `a2u04-g-reflexiv-akk` (sich + Akk: mich, dich, sich, uns, euch, sich; đứng sau động từ chia hoặc sau chủ ngữ đảo: Heute fühle ich mich besser.)
- **Từ mới** (trường: thể trạng): sich fühlen · sich ausruhen · sich erholen · sich beeilen · sich bewegen · sich verletzen · sich erkälten · fit · schwach · der Stress (Sg.)
- **Lỗi người Việt:** bỏ sich ("Ich fühle gut"); "Ich fühle mir gut".

#### A2U04L2 · Tôi đánh răng – phản thân Dativ (Ich putze mir die Zähne.)
- **Key** `de:lesson:a2u04-mir-die-zaehne` · file `02-mir-die-zaehne.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Tả việc vệ sinh cá nhân, mặc quần áo buổi sáng.
- **Ngữ pháp mới:** `a2u04-g-reflexiv-dativ` (khi câu đã có tân ngữ Akk, đại từ phản thân thành Dativ: Ich wasche mich ↔ Ich wasche mir die Hände; bộ phận cơ thể dùng mạo từ xác định, không dùng sở hữu)
- **Từ mới** (trường: vệ sinh cá nhân): der Zahn, ¨-e · die Zahnbürste, -n · sich waschen, wäscht, wusch, hat gewaschen · sich kämmen · sich anziehen, zog an, hat angezogen · sich ausziehen · das Haar, -e · die Haut (Sg.) · die Seife, -n · das Handtuch, ¨-er
- **Lỗi người Việt:** "Ich wasche meine Hände" (hiểu được nhưng kém tự nhiên – chấp nhận trong translate, dạy dạng chuẩn); "Ich putze mich die Zähne".

#### A2U04L3 · Bạn nên… – lời khuyên với Konjunktiv II (Du solltest weniger arbeiten.)
- **Key** `de:lesson:a2u04-du-solltest` · file `03-du-solltest.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Cho và xin lời khuyên về lối sống lành mạnh, nhờ lịch sự.
- **Ngữ pháp mới:** `a2u04-g-sollte-koennte` (du solltest, Sie sollten, du könntest – khuyên nhẹ nhàng) · `a2u04-g-wuerde-hoeflich` (Würden Sie …? Könnten Sie …? An deiner Stelle würde ich … – học như mẫu, hệ thống Konjunktiv II ở B1U04)
- **Từ mới** (trường: lối sống): der Rat, Ratschläge · der Tipp, -s · rauchen · aufhören (mit) · ungesund · das Gewicht (Sg.) · abnehmen, nimmt ab, nahm ab, hat abgenommen · zunehmen · die Diät, -en · regelmäßig
- **Lỗi người Việt:** "Du sollst weniger arbeiten" (sollen = mệnh lệnh của người khác, nghe nặng); "Würden Sie mir helfen können?" (thừa).

#### A2U04L4 · Ở hiệu thuốc – wenn điều kiện (Wenn du Fieber hast, …)
- **Key** `de:lesson:a2u04-in-der-apotheke` · file `04-in-der-apotheke.yaml` · level `a2` · skills `listening, speaking, vocabulary`
- **Can-do:** Mua thuốc, hỏi cách dùng, gọi cấp cứu, hiểu khi nào cần đi bác sĩ.
- **Ngữ pháp mới:** `a2u04-g-wenn-konditional` (wenn + câu phụ = nếu (điều kiện thật): Wenn du Fieber hast, geh zum Arzt.)
- **Từ mới** (trường: thuốc, bảo hiểm, cấp cứu): das Medikament, -e · die Salbe, -n · die Allergie, -n · der Schmerz, -en · die Krankenkasse, -n · die Versichertenkarte, -n · der Notfall, ¨-e · der Krankenwagen, - · einnehmen · die Nebenwirkung, -en
- **Lỗi người Việt:** "Wenn du hast Fieber"; nhầm wenn với ob/als.
- **Văn hoá/ngữ dụng:** 112 = cấp cứu/cứu hoả, 110 = cảnh sát (Đức/Áo 112 cũng dùng; Áo cứu thương 144, Thụy Sĩ 144 – ghi "kiểm tra lại khi phát hành"); thuốc kê đơn chỉ bán ở Apotheke.

#### A2U04L5 · Ôn tập: xin nghỉ ốm (Wiederholung)
- **Key** `de:lesson:a2u04-wiederholung` · file `05-wiederholung.yaml` · level `a2` · skills `reading, writing, listening`
- **Can-do:** Đọc hướng dẫn dùng thuốc đơn giản hoá; **viết** tin nhắn/e-mail xin nghỉ ốm cho sếp hoặc giáo viên (~40 từ); nghe lời nhắn của phòng khám.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A2U05 · Du lịch và kỳ nghỉ (Reisen und Urlaub) · `de:unit:a2u05-reisen-urlaub` · thư mục `05-reisen-urlaub`

#### A2U05L1 · Một chuyến đi – Präteritum (Wir fuhren ans Meer.)
- **Key** `de:lesson:a2u05-eine-reise` · file `01-eine-reise.yaml` · level `a2` · skills `grammar, vocabulary, reading`
- **Can-do:** Hiểu đoạn kể chuyện viết ở Präteritum; kể chuyến đi bằng câu đơn giản.
- **Ngữ pháp mới:** `a2u05-g-praeteritum-regelmaessig` (gốc + -te: machte, wohnte, arbeitete) · `a2u05-g-praeteritum-haeufig` (15 động từ mạnh hay gặp khi đọc: ging, kam, fuhr, sah, gab, nahm, fand, blieb, schrieb, las, aß, trank, rief, lief, flog – nhận biết)
- **Từ mới** (trường: kỳ nghỉ): der Urlaub, -e · die Reise, -n · der Koffer, - · packen · buchen · das Reisebüro, -s · der Strand, ¨-e · das Meer, -e · die Insel, -n · der Berg, -e
- **Lỗi người Việt:** "er fahrte"; trộn Präteritum và Perfekt trong cùng câu một cách vô lý.

#### A2U05L2 · Khi tôi ở Viên – als, wenn (Als ich in Wien war, …)
- **Key** `de:lesson:a2u05-als-wenn` · file `02-als-wenn.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Kể kỷ niệm một lần trong quá khứ và thói quen lặp lại.
- **Ngữ pháp mới:** `a2u05-g-als-temporal` (als = một lần/một giai đoạn trong quá khứ) · `a2u05-g-wenn-temporal` (wenn = mỗi khi (lặp lại) hoặc khi (hiện tại/tương lai); immer wenn, jedes Mal wenn)
- **Từ mới** (trường: tham quan): die Sehenswürdigkeit, -en · die Altstadt, ¨-e · das Schloss, ¨-er · die Brücke, -n · der Turm, ¨-e · die Führung, -en · der Tourist, -en · das Souvenir, -s · berühmt
- **Lỗi người Việt:** "Wenn ich ein Kind war"; "Als ich in Wien bin".

#### A2U05L3 · Chuyến đi đẹp nhất – so sánh nhất, đuôi tính từ sau der (Die schönste Reise)
- **Key** `de:lesson:a2u05-die-schoenste-reise` · file `03-die-schoenste-reise.yaml` · level `a2` · skills `grammar, vocabulary, reading`
- **Can-do:** So sánh nơi chốn, nói cái gì đẹp/cao/xa nhất.
- **Ngữ pháp mới:** `a2u05-g-adj-bestimmt` (bảng 2, sau der/die/das: -e ở Nom số ít và Akk giống cái/trung, còn lại -en: der schöne Strand, den schönen Strand, dem schönen Strand, die schönen Strände) · `a2u05-g-superlativ` (am …-sten; der/die/das …-ste; -esten sau -t/-d/-s/-z: am ältesten; bất quy tắc am besten, am meisten, am liebsten, am höchsten, am nächsten)
- **Từ mới** (trường: thiên nhiên, cảnh quan): die Landschaft, -en · die Natur (Sg.) · der Wald, ¨-er · der Fluss, ¨-e · das Tal, ¨-er · hoch (höher, am höchsten) · tief · breit · wunderbar · spannend
- **Lỗi người Việt:** "der schönste Strand" ok nhưng "den schönste Strand"; "am höchste"; "der hohe Berg" (hoch mất c khi có đuôi – lưu ý).

#### A2U05L4 · Ở khách sạn – giới từ du lịch, phàn nàn (Im Hotel)
- **Key** `de:lesson:a2u05-im-hotel` · file `04-im-hotel.yaml` · level `a2` · skills `listening, speaking, vocabulary`
- **Can-do:** Đặt phòng, nhận phòng, phàn nàn lịch sự về sự cố.
- **Ngữ pháp mới:** `a2u05-g-reise-praepositionen` (Wohin?/Wo?: ans Meer/am Meer, in die Berge/in den Bergen, auf eine Insel/auf einer Insel, nach Spanien, in die Schweiz/in der Schweiz, zu Freunden/bei Freunden)
- **Từ mới** (trường: khách sạn): das Einzelzimmer, - · das Doppelzimmer, - · die Rezeption, -en · die Übernachtung, -en · die Halbpension (Sg.) · reservieren · die Beschwerde, -n · sich beschweren · kaputt · funktionieren
- **Lỗi người Việt:** "nach den Bergen"; "Ich fahre zu Meer"; phàn nàn quá thẳng ("Das ist schlecht!") – dạy "Leider funktioniert … nicht."

#### A2U05L5 · Ôn tập: bưu thiếp/blog kỳ nghỉ (Wiederholung)
- **Key** `de:lesson:a2u05-wiederholung` · file `05-wiederholung.yaml` · level `a2` · skills `reading, writing, speaking`
- **Can-do:** Đọc blog du lịch (Präteritum); **viết** tin nhắn SMS 20–30 từ cho bạn từ nơi nghỉ (kiểu Goethe A2 Schreiben Teil 1); kể "chuyến đi đẹp nhất".
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A2U06 · Thành phố và dịch vụ (Stadt und Dienstleistungen) · `de:unit:a2u06-stadt-dienste` · thư mục `06-stadt-dienste`

#### A2U06L1 · Bạn có biết… không? – câu hỏi gián tiếp (Wissen Sie, wo …?)
- **Key** `de:lesson:a2u06-wissen-sie-wo` · file `01-wissen-sie-wo.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Hỏi thông tin lịch sự ở quầy, cơ quan.
- **Ngữ pháp mới:** `a2u06-g-indirekte-w-frage` (Können Sie mir sagen, wann das Amt öffnet? – từ để hỏi + động từ cuối) · `a2u06-g-ob` (câu hỏi có/không gián tiếp: Ich weiß nicht, ob …)
- **Từ mới** (trường: dịch vụ công): wissen, weiß, wusste, hat gewusst · die Auskunft, ¨-e · das Rathaus, ¨-er · die Bibliothek, -en · das Fundbüro, -s · die Polizei (Sg.) · der Schalter, - · die Wartenummer, -n · zuständig
- **Lỗi người Việt:** "Können Sie mir sagen, wo ist die Bibliothek?"; dùng wenn thay cho ob.

#### A2U06L2 · Cần phải… – zu + nguyên thể (Es ist wichtig, ein Konto zu eröffnen.)
- **Key** `de:lesson:a2u06-zu-infinitiv` · file `02-zu-infinitiv.yaml` · level `a2` · skills `grammar, vocabulary, reading`
- **Can-do:** Làm việc với ngân hàng; nói điều quên/cố gắng/cần làm.
- **Ngữ pháp mới:** `a2u06-g-zu-infinitiv` (Es ist wichtig/schwer…, … zu …; Ich habe vergessen/versuche/habe keine Zeit/Lust, … zu …; động từ tách: anzurufen; không dùng zu sau modal)
- **Từ mới** (trường: ngân hàng): das Konto, Konten · eröffnen · die Kreditkarte, -n · die Geheimzahl, -en · überweisen, überwies, hat überwiesen · abheben, hob ab, hat abgehoben · der Geldautomat, -en · das Bargeld (Sg.) · versuchen · die Gebühr, -en
- **Lỗi người Việt:** "Ich muss zu gehen"; "zu anrufen".
- **Văn hoá/ngữ dụng:** Người Đức vẫn hay dùng tiền mặt; IBAN cho chuyển khoản.

#### A2U06L3 · Để… – um … zu, deshalb (Ich gehe zur Post, um ein Paket abzuholen.)
- **Key** `de:lesson:a2u06-um-zu` · file `03-um-zu.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói mục đích và hệ quả khi gửi/nhận bưu phẩm.
- **Ngữ pháp mới:** `a2u06-g-um-zu` (mục đích, cùng chủ ngữ; zu trước nguyên thể ở cuối) · `a2u06-g-deshalb` (deshalb/deswegen/darum ở vị trí 1 → đảo động từ; so với weil)
- **Từ mới** (trường: bưu điện): das Paket, -e · das Päckchen, - · die Briefmarke, -n · abholen · der Absender, - · der Empfänger, - · ausfüllen · einwerfen, wirft ein, warf ein, hat eingeworfen · der Briefkasten, ¨- · die Lieferung, -en
- **Lỗi người Việt:** "um abholen ein Paket"; "Deshalb ich gehe …".

#### A2U06L4 · Nhờ sửa – lassen; không cần ≠ không được (Ich lasse mein Fahrrad reparieren.)
- **Key** `de:lesson:a2u06-lassen` · file `04-lassen.yaml` · level `a2` · skills `listening, speaking, grammar`
- **Can-do:** Thuê dịch vụ (sửa xe, cắt tóc, giặt là); hiểu điều cấm và điều không bắt buộc.
- **Ngữ pháp mới:** `a2u06-g-lassen` (lassen + nguyên thể = nhờ/để người khác làm) · `a2u06-g-muss-nicht-darf-nicht` (nicht müssen = không cần; nicht dürfen = không được phép – người Việt hay nhầm vì "không phải" và "không được")
- **Từ mới** (trường: dịch vụ): lassen, lässt, ließ, hat gelassen · reparieren · die Werkstatt, ¨-en · der Friseur, -e · schneiden, schnitt, hat geschnitten · die Reinigung, -en · der Handwerker, - · erlaubt · verboten
- **Lỗi người Việt:** "Du musst nicht rauchen" để nói cấm; "Ich lasse reparieren mein Fahrrad".

#### A2U06L5 · Ôn tập: e-mail gửi cơ quan/ngân hàng (Wiederholung)
- **Key** `de:lesson:a2u06-wiederholung` · file `05-wiederholung.yaml` · level `a2` · skills `reading, writing, listening`
- **Can-do:** Đọc thông báo của cơ quan; **viết** e-mail trang trọng hỏi thông tin (giờ mở cửa, giấy tờ cần mang) ~50 từ.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A2U07 · Lễ hội, truyền thông và tiêu dùng (Feste, Medien und Konsum) · `de:unit:a2u07-feste-medien-konsum` · thư mục `07-feste-medien-konsum`

#### A2U07L1 · Bạn thích lễ nào? – dieser, jeder, sondern (Welches Fest feiert ihr?)
- **Key** `de:lesson:a2u07-feste` · file `01-feste.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Kể về lễ Tết, chúc mừng, so sánh phong tục.
- **Ngữ pháp mới:** `a2u07-g-dieser-jeder` (dieser, jeder, welcher, alle: đuôi như mạo từ xác định; tính từ sau chúng theo bảng 2) · `a2u07-g-sondern` (nicht …, sondern … = không phải… mà là…; khác aber)
- **Từ mới** (trường: lễ hội): das Fest, -e · feiern · Weihnachten · Ostern · Silvester · das Neujahr (Sg.) · das Geschenk, -e · die Kerze, -n · der Gast, ¨-e · die Hochzeit, -en
- **Lỗi người Việt:** "nicht am 24., aber am 25." (đúng: sondern); "diese Fest".
- **Văn hoá/ngữ dụng:** Đức tặng quà tối 24/12 (Heiligabend); Tết Nguyên Đán = das vietnamesische Neujahrsfest (Tết).

#### A2U07L2 · Mua sắm trực tuyến – tính từ không mạo từ (Frischer Kaffee, günstige Preise)
- **Key** `de:lesson:a2u07-online-einkaufen` · file `02-online-einkaufen.yaml` · level `a2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc quảng cáo/đánh giá sản phẩm, đổi trả hàng.
- **Ngữ pháp mới:** `a2u07-g-adj-nullartikel` (bảng 3, không mạo từ: tính từ mang đuôi của mạo từ – frischer Kaffee, frische Milch, frisches Brot; Dativ: mit frischem Obst; Mit freundlichen Grüßen)
- **Từ mới** (trường: mua online): der Online-Shop, -s · der Warenkorb, ¨-e · liefern · zurückschicken · umtauschen · die Qualität, -en · die Marke, -n · das Produkt, -e · der Kunde, -n · gebraucht
- **Lỗi người Việt:** "Mit freundliche Grüße"; dùng bảng 2 khi không có mạo từ.

#### A2U07L3 · Báo, TV, quảng cáo – was für ein, es geht um (Was für eine Sendung ist das?)
- **Key** `de:lesson:a2u07-medien` · file `03-medien.yaml` · level `a2` · skills `grammar, vocabulary, listening`
- **Can-do:** Nói mình xem/đọc gì, hỏi loại chương trình, tóm nội dung một câu.
- **Ngữ pháp mới:** `a2u07-g-was-fuer-ein` (Was für ein Film? – hỏi loại; ein biến cách theo vai trò) · `a2u07-g-es-geht-um` (In dem Artikel geht es um + Akk)
- **Từ mới** (trường: truyền thông): die Zeitung, -en · die Zeitschrift, -en · der Artikel, - · das Fernsehen (Sg.) · die Sendung, -en · die Serie, -n · die Werbung (Sg.) · das Internet (Sg.) · die App, -s · berichten
- **Lỗi người Việt:** "Was für Film?"; "Es geht über …" (đúng: um).

#### A2U07L4 · Blog của Anna – sở hữu cách tên riêng, đại từ bất định (Annas Blog – Hast du einen?)
- **Key** `de:lesson:a2u07-annas-blog` · file `04-annas-blog.yaml` · level `a2` · skills `listening, reading, speaking`
- **Can-do:** Nói đồ vật của ai, trả lời ngắn không lặp danh từ; nghe podcast/video ngắn.
- **Ngữ pháp mới:** `a2u07-g-genitiv-namen` (Annas Handy – không có dấu nháy; văn nói: das Handy von Anna) · `a2u07-g-indefinitpronomen-einer` (einer/eine/eins, keiner/keine/keins, meiner… thay danh từ: Hast du einen Laptop? – Ja, ich habe einen.)
- **Từ mới** (trường: mạng xã hội): der Blog, -s · posten · teilen · der Kommentar, -e · das Video, -s · herunterladen, lädt herunter, lud herunter, hat heruntergeladen · das Passwort, ¨-er · online · der Bildschirm, -e
- **Lỗi người Việt:** "Anna's Blog" (dấu nháy kiểu Anh); "Ja, ich habe ein" (thiếu đuôi giống đực).

#### A2U07L5 · Ôn tập: thư mời, bài đăng diễn đàn ngắn (Wiederholung)
- **Key** `de:lesson:a2u07-wiederholung` · file `05-wiederholung.yaml` · level `a2` · skills `reading, writing, listening`
- **Can-do:** Đọc bài bình luận/đánh giá; **viết** thư mời dự tiệc (thời gian, địa điểm, mang gì) ~50 từ; nghe quảng cáo radio.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit A2U08 · Tương lai, môi trường và thi A2 (Zukunft, Umwelt, Goethe-Zertifikat A2) · `de:unit:a2u08-pruefung-a2` · thư mục `08-pruefung-a2`

Mỗi bài 1–4 gắn với một phần thi (Sprechen/Lesen/Hören/Schreiben) nhưng vẫn có chủ đề và học liệu mới.

#### A2U08L1 · Kế hoạch và mong muốn – động từ đi với giới từ (Ich freue mich auf …) · *kỹ năng thi: Sprechen Teil 2*
- **Key** `de:lesson:a2u08-plaene-wuensche` · file `01-plaene-wuensche.yaml` · level `a2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói kế hoạch, mong muốn, điều mình mong đợi/lo lắng (kiểu Sprechen Teil 2: kể về cuộc sống của mình).
- **Ngữ pháp mới:** `a2u08-g-verben-praeposition` (động từ cố định giới từ, học cả cụm: sich freuen auf + Akk (sắp tới) / über + Akk (đã có), warten auf, denken an, sich interessieren für, Angst haben vor + Dat, träumen von) · `a2u08-g-praesens-zukunft` (hiện tại + mốc thời gian để nói tương lai: Nächstes Jahr mache ich …)
- **Từ mới** (trường: dự định): sich freuen auf/über · warten auf · denken an · sich interessieren für · Angst haben vor · träumen von · der Plan, ¨-e · der Wunsch, ¨-e · die Zukunft (Sg.) · vorhaben, hat vor, hatte vor, hat vorgehabt
- **Lỗi người Việt:** "Ich warte für dich" (theo tiếng Anh "wait for"); "Ich interessiere für Musik" (thiếu mich).

#### A2U08L2 · Phân loại rác – biển báo nguyên thể (Müll trennen) · *kỹ năng thi: Lesen*
- **Key** `de:lesson:a2u08-muell-trennen` · file `02-muell-trennen.yaml` · level `a2` · skills `reading, vocabulary, grammar`
- **Can-do:** Đọc nội quy, biển báo, hướng dẫn phân loại rác; tìm thông tin cụ thể trong văn bản ngắn (kiểu Lesen Teil 1–4).
- **Ngữ pháp mới:** `a2u08-g-infinitiv-aufforderung` (biển báo/hướng dẫn dùng nguyên thể: Bitte nicht rauchen! Flaschen hier einwerfen.)
- **Từ mới** (trường: rác, môi trường): der Müll (Sg.) · trennen · die Umwelt (Sg.) · das Pfand (Sg.) · die Mülltonne, -n · das Papier (Sg.) · das Plastik (Sg.) · der Biomüll (Sg.) · sparen · wegwerfen, wirft weg, warf weg, hat weggeworfen
- **Văn hoá/ngữ dụng:** Hệ thống thùng rác màu (Gelbe Tonne/Biotonne/Papier) và Pfand chai – khác nhau theo địa phương.

#### A2U08L3 · Thông báo ở nhà ga – giới từ thời gian (Ab Montag, in zwei Wochen) · *kỹ năng thi: Hören*
- **Key** `de:lesson:a2u08-durchsagen` · file `03-durchsagen.yaml` · level `a2` · skills `listening, vocabulary, grammar`
- **Can-do:** Hiểu thông báo ở ga, siêu thị, radio, tin nhắn thoại (kiểu Hören Teil 1–4).
- **Ngữ pháp mới:** `a2u08-g-zeit-praepositionen` (ab Montag, bis Freitag, in zwei Tagen (tương lai + Dat), für zwei Wochen (khoảng thời gian + Akk), über/zwischen – so với seit/vor)
- **Từ mới** (trường: thông báo giao thông): die Durchsage, -n · der Bahnsteig, -e · ausfallen, fällt aus, fiel aus, ist ausgefallen · die Baustelle, -n · die Umleitung, -en · der Hinweis, -e · einsteigen · aussteigen · wiederholen · der Ersatzverkehr (Sg.)
- **Lỗi người Việt:** "seit zwei Tagen" để nói tương lai; "für Montag" thay "ab Montag".

#### A2U08L4 · Cùng lên kế hoạch – đề nghị (Wollen wir …? Lass uns …!) · *kỹ năng thi: Sprechen Teil 3, Schreiben*
- **Key** `de:lesson:a2u08-gemeinsam-planen` · file `04-gemeinsam-planen.yaml` · level `a2` · skills `speaking, writing, listening`
- **Can-do:** Thương lượng thời gian, đề nghị, đồng ý/từ chối (kiểu Sprechen Teil 3); viết e-mail sắp xếp cuộc hẹn.
- **Ngữ pháp mới:** `a2u08-g-vorschlag-wir` (mệnh lệnh ngôi wir: Gehen wir!; Lass uns … gehen!; Wollen wir …?; Wie wäre es mit + Dat? – học như mẫu)
- **Từ mới** (trường: sắp xếp): planen · vorschlagen, schlägt vor, schlug vor, hat vorgeschlagen · organisieren · die Idee, -n · einverstanden · absagen · zusagen · verschieben, verschob, hat verschoben · der Treffpunkt, -e · Wie wäre es mit …? (`phrase`)
- **Lỗi người Việt:** "Lass uns gehen ins Kino" (nguyên thể cuối: Lass uns ins Kino gehen).

#### A2U08L5 · Đề mô phỏng Goethe-Zertifikat A2 (Modelltest A2)
- **Key** `de:lesson:a2u08-modelltest-a2` · file `05-modelltest-a2.yaml` · level `a2` · skills `listening, reading, writing, speaking`
- **Can-do:** Làm đủ dạng bài 4 phần Goethe A2: Lesen (4 Teile), Hören (4 Teile), Schreiben (Teil 1 SMS ~20–30 từ; Teil 2 e-mail ~30–40 từ thân mật hoặc trang trọng), Sprechen (thẻ câu hỏi; kể về bản thân; cùng lên kế hoạch).
- **Ngữ pháp mới:** — · **Từ mới:** — (reuse A1–A2)

### Chương trình B1 · `de:program:b1` (b1)

Từ B1, phần giải thích vẫn bằng tiếng Việt nhưng ví dụ dài hơn (2 mệnh đề), mỗi unit có một nhiệm vụ viết theo định dạng Goethe B1 (e-mail thân mật ~80 từ, bài diễn đàn ~80 từ, tin nhắn trang trọng ~40 từ) và một nhiệm vụ nói (lên kế hoạch / trình bày / phản hồi).

---

#### Unit B1U01 · Câu chuyện cuộc đời (Lebensgeschichten) · `de:unit:b1u01-lebensgeschichten` · thư mục `01-lebensgeschichten`

#### B1U01L1 · Hồi nhỏ – Präteritum đầy đủ (Als Kind wohnte ich auf dem Land.)
- **Key** `de:lesson:b1u01-kindheit` · file `01-kindheit.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc và viết đoạn hồi ký ngắn ở Präteritum.
- **Ngữ pháp mới:** `b1u01-g-praeteritum-system` (mọi nhóm: yếu -te, mạnh đổi nguyên âm (Ablaut: schreiben–schrieb, finden–fand, fahren–fuhr), hỗn hợp: brachte, dachte, kannte, nannte, rannte, wusste; ich/er không đuôi) · `b1u01-g-praeteritum-perfekt-gebrauch` (văn viết/kể chuyện: Präteritum; văn nói: Perfekt; sein/haben/modal: Präteritum cả khi nói; miền Nam gần như chỉ dùng Perfekt khi nói)
- **Từ mới** (trường: tuổi thơ): die Kindheit (Sg.) · die Erinnerung, -en · sich erinnern an · aufwachsen, wächst auf, wuchs auf, ist aufgewachsen · das Dorf, ¨-er · die Jugend (Sg.) · streng · vermissen
- **Lỗi người Việt:** "er denkte", "sie wisste"; kể bằng hiện tại vì tiếng Việt không chia thì.

#### B1U01L2 · Sau khi tôi đã… – Plusquamperfekt (Nachdem ich das Abitur gemacht hatte, …)
- **Key** `de:lesson:b1u01-nachdem` · file `02-nachdem.yaml` · level `b1` · skills `grammar, vocabulary, writing`
- **Can-do:** Kể hai sự việc quá khứ theo đúng trước–sau (di cư, rời quê).
- **Ngữ pháp mới:** `b1u01-g-plusquamperfekt` (hatte/war + Partizip II: việc xảy ra trước một việc quá khứ khác) · `b1u01-g-nachdem` (nachdem + Plusquamperfekt → câu chính Präteritum/Perfekt; nachdem + Perfekt → câu chính Präsens)
- **Từ mới** (trường: rời quê hương): auswandern · die Heimat (Sg.) · verlassen, verlässt, verließ, hat verlassen · sich verabschieden · die Entscheidung, -en · mutig · das Ausland (Sg.) · fremd
- **Lỗi người Việt:** dùng nachdem với cùng thì cả hai vế; "Nachdem ich gegessen, …" (thiếu trợ động từ).

#### B1U01L3 · Trước khi, kể từ khi, cho đến khi (Bevor, seitdem, bis)
- **Key** `de:lesson:b1u01-bevor-seitdem-bis` · file `03-bevor-seitdem-bis.yaml` · level `b1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Kể các mốc quan trọng của đời người.
- **Ngữ pháp mới:** `b1u01-g-bevor` (bevor = trước khi; giới từ vor + Dat) · `b1u01-g-seitdem` (seit/seitdem + câu phụ, thì hiện tại nếu còn tiếp diễn) · `b1u01-g-bis` (bis = cho đến khi; giới từ bis/bis zu)
- **Từ mới** (trường: các mốc đời người): der Abschluss, ¨-e · das Studium, Studien · die Karriere, -n · die Rente, -n · der Ruhestand (Sg.) · die Geburt, -en · sterben, stirbt, starb, ist gestorben · der Tod (Sg.)
- **Lỗi người Việt:** "bevor zu essen" (theo tiếng Anh before eating); nhầm seit (từ khi, còn tiếp) với vor (cách đây).

#### B1U01L4 · Kể đi! – Perfekt của động từ khiếm khuyết (Ich habe arbeiten müssen.)
- **Key** `de:lesson:b1u01-erzaehl-mal` · file `04-erzaehl-mal.yaml` · level `b1` · skills `listening, speaking, grammar`
- **Can-do:** Nghe một phỏng vấn tiểu sử/podcast và kể lại; kể sự việc bất ngờ, ngượng ngùng.
- **Ngữ pháp mới:** `b1u01-g-modal-perfekt` (hat + nguyên thể + modal nguyên thể (Ersatzinfinitiv): Ich habe gestern lange arbeiten müssen; trong văn nói thường thay bằng Präteritum musste)
- **Từ mới** (trường: sự kiện, cảm xúc khi kể): das Ereignis, -se · der Zufall, ¨-e · zufällig · überrascht · die Überraschung, -en · peinlich · lachen · anschließend · inzwischen · mittlerweile
- **Lỗi người Việt:** "Ich habe arbeiten gemusst".

#### B1U01L5 · Ôn tập: tiểu sử, e-mail kể trải nghiệm (Wiederholung)
- **Key** `de:lesson:b1u01-wiederholung` · file `05-wiederholung.yaml` · level `b1` · skills `reading, writing, listening`
- **Can-do:** Đọc tiểu sử một người nổi tiếng (kiểu Lesen Teil 1: blog/văn bản kể); **viết** e-mail thân mật ~80 từ kể một sự kiện đáng nhớ (Goethe B1 Schreiben Teil 1: 3 ý).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B1U02 · Quan hệ và cảm xúc (Beziehungen und Gefühle) · `de:unit:b1u02-beziehungen` · thư mục `02-beziehungen`

#### B1U02L1 · Người bạn mà tôi… – mệnh đề quan hệ Nom/Akk (Ein Freund, der immer hilft)
- **Key** `de:lesson:b1u02-relativsatz` · file `01-relativsatz.yaml` · level `b1` · skills `grammar, vocabulary, writing`
- **Can-do:** Tả người/vật bằng mệnh đề quan hệ; nói về tình bạn.
- **Ngữ pháp mới:** `b1u02-g-relativsatz-nom-akk` (der/die/das/die (Nom), den/die/das/die (Akk); động từ cuối; dấu phẩy hai bên) · `b1u02-g-relativpronomen-wahl` (giống và số theo danh từ được bổ nghĩa, cách theo vai trò **trong** mệnh đề quan hệ)
- **Từ mới** (trường: tình bạn, tính cách): die Freundschaft, -en · vertrauen · ehrlich · hilfsbereit · der Charakter, -e · die Eigenschaft, -en · kennenlernen · der Partner, - · die Beziehung, -en
- **Lỗi người Việt:** dùng "was"/"wo" cho người (theo "mà"); chọn cách theo câu chính ("Der Mann, den hilft" sai).

#### B1U02L2 · Người mà tôi tin tưởng – quan hệ Dativ và có giới từ (Die Frau, mit der ich …)
- **Key** `de:lesson:b1u02-mit-dem-ich` · file `02-mit-dem-ich.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Kể về tình yêu, hôn nhân, chia tay với câu phức.
- **Ngữ pháp mới:** `b1u02-g-relativsatz-dativ` (dem, der, dem, **denen**) · `b1u02-g-relativsatz-praeposition` (giới từ đứng trước đại từ: die Frau, mit der ich …; der Film, über den wir …)
- **Từ mới** (trường: tình yêu, hôn nhân): die Liebe (Sg.) · sich verlieben in · sich trennen · die Trennung, -en · die Ehe, -n · der Ehemann, ¨-er · die Ehefrau, -en · zusammenziehen
- **Lỗi người Việt:** để giới từ cuối câu như tiếng Anh ("die Frau, der ich mit …"); "denen" thành "den".

#### B1U02L3 · Bạn mong điều gì? – darauf/worauf (Worauf freust du dich?)
- **Key** `de:lesson:b1u02-worauf` · file `03-worauf.yaml` · level `b1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói mình quan tâm, bực, quen, lo cho điều gì/ai; hỏi lại đúng.
- **Ngữ pháp mới:** `b1u02-g-pronominaladverbien` (vật/sự việc: da(r)- + giới từ: darauf, damit, darüber; câu hỏi wo(r)-: worauf, womit; **người**: giới từ + đại từ: auf ihn, mit wem) · `b1u02-g-verben-praeposition-b1` (danh sách B1, học cả cụm + cách)
- **Từ mới** (trường: quan hệ hằng ngày): sich ärgern über · sich verlassen auf · sich kümmern um · sich streiten, stritt, hat gestritten (mit/über) · sich gewöhnen an · sich entschuldigen (bei/für) · sich bedanken (bei/für) · sich unterhalten, unterhält, unterhielt, hat unterhalten (über)
- **Lỗi người Việt:** "Ich freue mich auf es"; "Worauf wartest du? – Auf meine Freundin" ok nhưng "Darauf warte ich" cho người là sai; nhầm sich verlassen auf (tin cậy) với verlassen (rời bỏ, B1U01L2).

#### B1U02L4 · Mặc dù… – obwohl, trotzdem, tính từ với giới từ (Obwohl ich müde bin, …)
- **Key** `de:lesson:b1u02-obwohl` · file `04-obwohl.yaml` · level `b1` · skills `listening, speaking, grammar`
- **Can-do:** Diễn tả cảm xúc mâu thuẫn; nghe cuộc trò chuyện về xung đột và nêu cảm nhận.
- **Ngữ pháp mới:** `b1u02-g-obwohl-trotzdem` (obwohl + câu phụ (động từ cuối) ↔ trotzdem ở vị trí 1/sau động từ trong câu chính) · `b1u02-g-adjektive-praeposition` (stolz auf, zufrieden mit, eifersüchtig auf, enttäuscht von, verliebt in, traurig über, wütend auf)
- **Từ mới** (trường: cảm xúc): das Gefühl, -e · eifersüchtig · enttäuscht · stolz · zufrieden · wütend · traurig · einsam · glücklich
- **Lỗi người Việt:** "Obwohl ich müde bin, aber ich arbeite" (tiếng Việt "mặc dù… nhưng" → tiếng Đức **không** có aber); "trotzdem" đặt sau dấu phẩy mà không đảo.

#### B1U02L5 · Ôn tập: bài đăng diễn đàn về tình bạn (Wiederholung)
- **Key** `de:lesson:b1u02-wiederholung` · file `05-wiederholung.yaml` · level `b1` · skills `reading, writing, speaking`
- **Can-do:** Đọc nhiều ý kiến ngắn trên diễn đàn (kiểu Lesen Teil 4: ai đồng ý/không); **viết** bài diễn đàn ~80 từ nêu ý kiến (Goethe B1 Schreiben Teil 2).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B1U03 · Thế giới việc làm (Arbeitswelt) · `de:unit:b1u03-arbeitswelt` · thư mục `03-arbeitswelt`

#### B1U03L1 · Tin tuyển dụng – bị động hiện tại, Genitiv (Gesucht wird …)
- **Key** `de:lesson:b1u03-stellenanzeigen` · file `01-stellenanzeigen.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc tin tuyển dụng, hiểu yêu cầu và quyền lợi; nói một việc "được làm" mà không cần nói ai làm.
- **Ngữ pháp mới:** `b1u03-g-passiv-praesens` (werden + Partizip II; tác nhân von + Dat (người), durch + Akk (phương tiện)) · `b1u03-g-genitiv` (des/der/des/der; danh từ giống đực/trung thêm -(e)s: des Mitarbeiters, des Projekts; câu hỏi wessen; thay bằng von + Dat trong văn nói)
- **Từ mới** (trường: tuyển dụng): die Stellenanzeige, -n · der Arbeitgeber, - · der Arbeitnehmer, - · die Voraussetzung, -en · einstellen · sich bewerben um, bewirbt, bewarb, hat beworben · die Berufserfahrung (Sg.) · der Lohn, ¨-e · befristet
- **Lỗi người Việt:** "Das Haus wird gebaut von die Firma"; nhầm werden-Passiv với werden (trở thành).

#### B1U03L2 · Lịch sử công ty – bị động quá khứ (Die Firma wurde 1950 gegründet.)
- **Key** `de:lesson:b1u03-firmengeschichte` · file `02-firmengeschichte.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc/viết giới thiệu lịch sử một doanh nghiệp, quy trình sản xuất.
- **Ngữ pháp mới:** `b1u03-g-passiv-praeteritum` (wurde + Partizip II) · `b1u03-g-passiv-perfekt` (ist + Partizip II + **worden** – không phải geworden)
- **Từ mới** (trường: doanh nghiệp, sản xuất): gründen · das Unternehmen, - · der Betrieb, -e · herstellen · die Produktion (Sg.) · die Fabrik, -en · der Mitarbeiter, - · entwickeln · exportieren
- **Lỗi người Việt:** "ist gegründet geworden"; "hat gegründet worden".

#### B1U03L3 · Để mọi việc suôn sẻ – damit/um…zu, n-Deklination (Damit alles klappt)
- **Key** `de:lesson:b1u03-damit` · file `03-damit.yaml` · level `b1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói mục đích trong công việc với hai chủ ngữ khác nhau; nói đúng danh từ n-Deklination.
- **Ngữ pháp mới:** `b1u03-g-damit` (damit khi hai chủ ngữ khác nhau; um…zu khi cùng chủ ngữ) · `b1u03-g-n-deklination` (danh từ giống đực -e/-ent/-ant/-ist/-oge và Herr, Mensch, Nachbar, Name: thêm -(e)n ở mọi cách trừ Nom số ít: den Kollegen, dem Kunden, Herrn Weber)
- **Từ mới** (trường: dự án, nhóm): der Praktikant, -en · der Experte, -n · der Assistent, -en · klappen · die Besprechung, -en · das Ziel, -e · erreichen · die Frist, -en
- **Lỗi người Việt:** "Ich frage den Kollege"; "um mein Chef zufrieden ist".

#### B1U03L4 · Ở văn phòng – đại từ bất định (Hat jemand den Drucker repariert?)
- **Key** `de:lesson:b1u03-im-buero` · file `04-im-buero.yaml` · level `b1` · skills `listening, speaking, vocabulary`
- **Can-do:** Trao đổi công việc hằng ngày, xin nghỉ phép, báo ốm; nghe cuộc họp ngắn.
- **Ngữ pháp mới:** `b1u03-g-indefinitpronomen` (jemand, niemand, etwas, nichts, alle, einige, manche, mehrere, beide; jemand/niemand có thể -en/-em ở Akk/Dat trong văn viết)
- **Từ mới** (trường: văn phòng): der Drucker, - · die Datei, -en · speichern · ausdrucken · die Abteilung, -en · das Protokoll, -e · die Überstunde, -n · sich krankmelden · der Urlaubsantrag, ¨-e
- **Lỗi người Việt:** "Niemand hat nicht …" (phủ định kép như tiếng Việt "không ai không…").
- **Văn hoá/ngữ dụng:** Báo ốm từ ngày đầu, giấy bác sĩ (Krankschreibung) thường từ ngày thứ 4 (tuỳ hợp đồng – "cần kiểm tra").

#### B1U03L5 · Ôn tập: tin nhắn trang trọng, hồ sơ xin việc (Wiederholung)
- **Key** `de:lesson:b1u03-wiederholung` · file `05-wiederholung.yaml` · level `b1` · skills `reading, writing, listening`
- **Can-do:** **Viết** tin nhắn trang trọng ~40 từ xin dời lịch/xin lỗi vắng mặt (Goethe B1 Schreiben Teil 3); đọc tin tuyển dụng và ghép người – việc (kiểu Lesen Teil 3).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B1U04 · Giáo dục và học tập (Bildung und Lernen) · `de:unit:b1u04-bildung` · thư mục `04-bildung`

#### B1U04L1 · Ước gì… – Konjunktiv II hiện tại (Wenn ich doch mehr Zeit hätte!)
- **Key** `de:lesson:b1u04-schule` · file `01-schule.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Nói về hệ thống trường học và ước muốn không có thật.
- **Ngữ pháp mới:** `b1u04-g-konjunktiv-ii-formen` (wäre, hätte, würde + nguyên thể cho đa số động từ; dạng riêng hay dùng: käme, ginge, wüsste, gäbe, bräuchte – nhận biết) · `b1u04-g-irrealer-wunsch` (Wenn ich doch/nur … hätte! Ich wünschte, …)
- **Từ mới** (trường: trường phổ thông): das Schulsystem, -e · das Fach, ¨-er · die Note, -n · das Zeugnis, -se · die Klasse, -n · der Unterricht (Sg.) · sitzenbleiben · die Schulpflicht (Sg.) · die Realschule, -n
- **Lỗi người Việt:** "Wenn ich würde Zeit haben"; dùng Präteritum làm ước muốn ("Wenn ich Zeit hatte!").
- **Văn hoá/ngữ dụng:** Thang điểm Đức 1 (tốt nhất) – 6; Áo 1–5; Thụy Sĩ 6 là tốt nhất – dễ gây nhầm.

#### B1U04L2 · Nếu tôi được học lại – câu điều kiện không thật (Wenn ich noch einmal studieren könnte, …)
- **Key** `de:lesson:b1u04-wenn-ich-noch-mal` · file `02-wenn-ich-noch-mal.yaml` · level `b1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Bàn về lựa chọn học đại học, giả định khác thực tế.
- **Ngữ pháp mới:** `b1u04-g-irreale-bedingung` (Wenn …, würde …; câu điều kiện không wenn: Hätte ich Zeit, würde ich …) · `b1u04-g-konjunktiv-ii-modal` (könnte, müsste, dürfte, sollte, wollte – giả định/lịch sự)
- **Từ mới** (trường: đại học): die Hochschule, -n · das Semester, - · die Vorlesung, -en · das Seminar, -e · der Studiengang, ¨-e · das Stipendium, Stipendien · sich einschreiben · der Hörsaal, Hörsäle
- **Lỗi người Việt:** dùng würde ở cả hai vế với sein/haben ("Wenn ich reich sein würde" – hiểu được nhưng không chuẩn viết, dạy wäre).

#### B1U04L3 · Vừa… vừa…, càng… càng… (Sowohl … als auch; je … desto)
- **Key** `de:lesson:b1u04-sowohl-als-auch` · file `03-sowohl-als-auch.yaml` · level `b1` · skills `grammar, vocabulary, writing`
- **Can-do:** Nói về phương pháp học, so sánh và liên kết ý rõ ràng.
- **Ngữ pháp mới:** `b1u04-g-zweiteilige-konnektoren` (sowohl … als auch, weder … noch, nicht nur … sondern auch, entweder … oder, zwar … aber) · `b1u04-g-je-desto` (je + so sánh hơn … (động từ cuối), desto/umso + so sánh hơn + động từ: Je mehr ich übe, desto besser spreche ich.)
- **Từ mới** (trường: học ngoại ngữ): die Methode, -n · die Motivation (Sg.) · sich konzentrieren · das Gedächtnis (Sg.) · auswendig · der Fortschritt, -e · die Grammatik (Sg.) · der Wortschatz (Sg.) · die Fremdsprache, -n
- **Lỗi người Việt:** "weder … noch … nicht" (phủ định kép); "Je mehr ich übe, desto ich spreche besser".

#### B1U04L4 · Học tiếp – quan hệ với wo/was, brauchen … zu (Alles, was ich brauche)
- **Key** `de:lesson:b1u04-weiterbildung` · file `04-weiterbildung.yaml` · level `b1` · skills `listening, speaking, grammar`
- **Can-do:** Nghe tư vấn chọn khoá học; hỏi điều kiện tham gia.
- **Ngữ pháp mới:** `b1u04-g-relativ-wo-was` (was sau alles, etwas, nichts, das Beste…; wo sau địa danh/nơi chốn) · `b1u04-g-brauchen-zu` (nicht/nur brauchen + zu + nguyên thể = không cần/chỉ cần)
- **Từ mới** (trường: đào tạo nghề, khoá học): die Weiterbildung, -en · die Volkshochschule, -n · teilnehmen an · die Teilnahme (Sg.) · das Zertifikat, -e · berufsbegleitend · der Lehrgang, ¨-e
- **Lỗi người Việt:** "alles, das ich weiß"; "Du brauchst nicht kommen" (văn nói – chấp nhận nhận biết, dạy dạng có zu).

#### B1U04L5 · Ôn tập + trình bày: hệ thống giáo dục Việt Nam – Đức (Wiederholung)
- **Key** `de:lesson:b1u04-wiederholung` · file `05-wiederholung.yaml` · level `b1` · skills `reading, speaking, writing`
- **Can-do:** Chuẩn bị bài nói kiểu Goethe B1 Sprechen Teil 2 (giới thiệu chủ đề – kinh nghiệm bản thân – tình hình ở Việt Nam – ưu nhược – kết luận) về học nghề hay học đại học; đọc văn bản dài có cấu trúc (Lesen Teil 2).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B1U05 · Sức khoẻ và dinh dưỡng (Gesundheit und Ernährung) · `de:unit:b1u05-gesundheit-ernaehrung` · thư mục `05-gesundheit-ernaehrung`

#### B1U05L1 · Sống khoẻ – bị động với modal, falls (Es muss mehr getan werden.)
- **Key** `de:lesson:b1u05-gesund-leben` · file `01-gesund-leben.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc lời khuyên dinh dưỡng; nói điều cần/không được làm theo kiểu khách quan.
- **Ngữ pháp mới:** `b1u05-g-passiv-modal` (modal + Partizip II + werden ở cuối: Das Obst sollte gewaschen werden; câu phụ: …, dass es gewaschen werden muss) · `b1u05-g-falls` (falls = trong trường hợp; gần nghĩa wenn, nhấn tính có thể)
- **Từ mới** (trường: dinh dưỡng): die Ernährung (Sg.) · sich ernähren · die Bewegung (Sg.) · vegetarisch · vegan · die Kalorie, -n · das Vitamin, -e · ausgewogen · verzichten auf
- **Lỗi người Việt:** "Das muss werden gemacht"; thứ tự 3 động từ ở câu phụ.

#### B1U05L2 · Ở bác sĩ chuyên khoa – tính từ hoàn chỉnh, tính từ danh từ hoá (Der Kranke, etwas Neues)
- **Key** `de:lesson:b1u05-facharzt` · file `02-facharzt.yaml` · level `b1` · skills `grammar, vocabulary, listening`
- **Can-do:** Mô tả triệu chứng chi tiết, hiểu chỉ định khám, đọc thông tin phòng khám.
- **Ngữ pháp mới:** `b1u05-g-adj-dekl-vollstaendig` (ba bảng ở cả **Genitiv**; so sánh hơn/nhất đứng trước danh từ vẫn thêm đuôi: ein gesünderes Leben, die beste Lösung, wegen des starken Fiebers) · `b1u05-g-nominalisierte-adjektive` (der/die Kranke, ein Kranker, die Deutschen; etwas/nichts/viel + tính từ viết hoa -es: etwas Neues, nichts Besonderes)
- **Từ mới** (trường: chuyên khoa): der Facharzt, ¨-e · die Untersuchung, -en · untersuchen · die Diagnose, -n · die Behandlung, -en · behandeln · der Patient, -en · die Spritze, -n · die Operation, -en · chronisch
- **Lỗi người Việt:** "ein Deutsche"; "etwas neu"; đuôi Genitiv sai.
- **Ghi chú:** "die Überweisung" (A2U06L2: chuyển khoản) có nghĩa thứ hai "giấy chuyển viện/chuyển khám chuyên khoa" – dùng `reuse` + ghi chú nghĩa, không tạo item mới.

#### B1U05L3 · Thực phẩm – hậu tố danh từ quyết định giống (Die Gesundheit, die Zutat)
- **Key** `de:lesson:b1u05-lebensmittel` · file `03-lebensmittel.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc nhãn thực phẩm, công thức; đoán giống danh từ từ hậu tố.
- **Ngữ pháp mới:** `b1u05-g-wortbildung-nomen` (die: -ung, -heit, -keit, -schaft, -ion, -tät, -ei, -ik; das: -chen, -lein, -ment, -um, nguyên thể danh từ hoá; der: -er (người làm), -ling, -ismus, -or; đi kèm số nhiều -en/-e)
- **Từ mới** (trường: thực phẩm, nhãn mác): das Lebensmittel, - · die Zutat, -en · die Mahlzeit, -en · die Gesundheit (Sg.) · frisch · haltbar · regional · die Verpackung, -en · der Inhaltsstoff, -e
- **Lỗi người Việt:** đoán giống theo nghĩa; "das Gesundheit".
- **Ghi chú:** "das Rezept" (A1U08L2: đơn thuốc) có nghĩa "công thức nấu ăn" – reuse + ghi chú.

#### B1U05L4 · Không còn nữa – phủ định mở rộng (Ich rauche nicht mehr.)
- **Key** `de:lesson:b1u05-nicht-mehr` · file `04-nicht-mehr.yaml` · level `b1` · skills `listening, speaking, grammar`
- **Can-do:** Nghe chương trình tư vấn sức khoẻ; nói về thay đổi thói quen.
- **Ngữ pháp mới:** `b1u05-g-negation-erweitert` (nicht mehr / kein … mehr = không còn; noch nicht / noch kein = chưa; gar nicht, überhaupt nicht, nie wieder; vị trí nicht phủ định cả câu vs phủ định một thành phần)
- **Từ mới** (trường: thói quen, căng thẳng): die Sucht, ¨-e · süchtig · der Alkohol (Sg.) · die Zigarette, -n · der Schlaf (Sg.) · die Entspannung (Sg.) · meditieren · der Druck (Sg.)
- **Lỗi người Việt:** "Ich rauche nicht noch" (dịch "không… nữa"); "nicht mehr Zigaretten".

#### B1U05L5 · Ôn tập: diễn đàn về ăn uống (Wiederholung)
- **Key** `de:lesson:b1u05-wiederholung` · file `05-wiederholung.yaml` · level `b1` · skills `reading, writing, listening`
- **Can-do:** Đọc 7 ý kiến và xác định ai ủng hộ/phản đối (Lesen Teil 4); **viết** bài diễn đàn ~80 từ về ăn chay; nghe radio tư vấn (Hören Teil 4: ai nói gì).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B1U06 · Môi trường và tương lai (Umwelt und Zukunft) · `de:unit:b1u06-umwelt` · thư mục `06-umwelt`

#### B1U06L1 · Trong tương lai – Futur I (Es wird wärmer werden.)
- **Key** `de:lesson:b1u06-zukunft` · file `01-zukunft.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Dự báo, hứa hẹn, phỏng đoán về hiện tại.
- **Ngữ pháp mới:** `b1u06-g-futur-i` (werden + nguyên thể cuối: dự báo, quyết tâm, lời hứa; kế hoạch chắc chắn vẫn hay dùng Präsens) · `b1u06-g-vermutung-wohl` (Er wird wohl krank sein = chắc là… (phỏng đoán hiện tại))
- **Từ mới** (trường: khí hậu): das Klima (Sg.) · der Klimawandel (Sg.) · die Temperatur, -en · steigen, stieg, ist gestiegen · die Erde (Sg.) · die Prognose, -n · die Dürre, -n · die Überschwemmung, -en · extrem
- **Lỗi người Việt:** "Ich werde morgen gehen ins Kino"; nhầm wird (tương lai) với wird (trở thành)/wird (bị động).

#### B1U06L2 · Vì giao thông – giới từ Genitiv, da, nämlich (Wegen des Verkehrs)
- **Key** `de:lesson:b1u06-wegen` · file `02-wegen.yaml` · level `b1` · skills `grammar, vocabulary, writing`
- **Can-do:** Nêu nguyên nhân – hậu quả của ô nhiễm bằng nhiều cấu trúc.
- **Ngữ pháp mới:** `b1u06-g-genitiv-praepositionen` (wegen, trotz, während, statt, innerhalb, außerhalb + Gen; văn nói hay dùng wegen + Dat – nhận biết) · `b1u06-g-da-naemlich` (da + câu phụ (lý do đã biết, trang trọng, thường đứng đầu); nämlich – trạng từ, không đứng đầu câu)
- **Từ mới** (trường: ô nhiễm): die Luft (Sg.) · die Verschmutzung (Sg.) · der Verkehr (Sg.) · das Abgas, -e · schädlich · die Ursache, -n · die Folge, -n · verursachen
- **Lỗi người Việt:** "wegen dem Verkehr" trong văn viết; "Nämlich ist …".

#### B1U06L3 · Tiết kiệm năng lượng – sodass, từ ghép (So teuer, dass …)
- **Key** `de:lesson:b1u06-energie` · file `03-energie.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc bài về năng lượng; nói hệ quả.
- **Ngữ pháp mới:** `b1u06-g-sodass` (…, sodass … / so + tính từ …, dass … = đến nỗi, nên) · `b1u06-g-komposita-fugen` (âm nối -s-/-n-/-es- trong từ ghép: Umweltschutz, Arbeitsplatz, Sonnenenergie; giống theo từ cuối)
- **Từ mới** (trường: năng lượng): die Energie, -n · der Strom (Sg.) · erneuerbar · die Solaranlage, -n · die Windkraft (Sg.) · verbrauchen · der Verbrauch (Sg.) · der Umweltschutz (Sg.) · nachhaltig
- **Lỗi người Việt:** "Arbeitplatz" (thiếu -s-); "so dass" + V2.

#### B1U06L4 · Thảo luận về môi trường – nêu ý kiến (Meiner Meinung nach …)
- **Key** `de:lesson:b1u06-diskussion` · file `04-diskussion.yaml` · level `b1` · skills `listening, speaking`
- **Can-do:** Nêu, bảo vệ, đồng ý/phản bác ý kiến trong thảo luận (Goethe B1 Sprechen Teil 3, Hören Teil 4).
- **Ngữ pháp mới:** `b1u06-g-meinung-redemittel` (Meiner Meinung nach + V2 đảo; Ich bin der Meinung/Ansicht, dass …; Da stimme ich dir zu. / Das sehe ich anders. / Einerseits …, andererseits … chỉ nhận biết)
- **Từ mới** (trường: tranh luận): die Meinung, -en · die Ansicht, -en · der Standpunkt, -e · zustimmen · widersprechen, widerspricht, widersprach, hat widersprochen · das Argument, -e · überzeugen · der Vorteil, -e · der Nachteil, -e
- **Lỗi người Việt:** "Meiner Meinung nach ich denke …"; "Ich bin einverstanden mit dir" (đúng nhưng nặng; dạy "Da hast du recht").

#### B1U06L5 · Ôn tập: quảng cáo ghép đôi, bài diễn đàn môi trường (Wiederholung)
- **Key** `de:lesson:b1u06-wiederholung` · file `05-wiederholung.yaml` · level `b1` · skills `reading, writing, listening`
- **Can-do:** Ghép người cần với quảng cáo (Lesen Teil 3); **viết** bài diễn đàn ~80 từ về phân loại rác/xe hơi trong thành phố.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B1U07 · Truyền thông và công nghệ (Medien und Technik) · `de:unit:b1u07-medien-technik` · thư mục `07-medien-technik`

#### B1U07L1 · Đời sống số – phân từ làm tính từ (Das klingelnde Handy, die gespeicherten Daten)
- **Key** `de:lesson:b1u07-digitaler-alltag` · file `01-digitaler-alltag.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc hướng dẫn/bài báo về thiết bị số; mô tả gọn bằng phân từ.
- **Ngữ pháp mới:** `b1u07-g-partizip-i-attribut` (nguyên thể + d + đuôi tính từ: das klingelnde Handy – đang diễn ra, chủ động) · `b1u07-g-partizip-ii-attribut` (Partizip II + đuôi: die gespeicherten Daten – đã xong/bị động)
- **Từ mới** (trường: thiết bị số): das Gerät, -e · der Akku, -s · aufladen, lädt auf, lud auf, hat aufgeladen · installieren · die Software (Sg.) · digital · die Daten (Pl.) · der Nutzer, - · das WLAN (Sg.)
- **Lỗi người Việt:** "das klingeln Handy"; nhầm nghĩa chủ động/bị động.

#### B1U07L2 · Trong khi, ngay khi, chừng nào (Während, sobald, solange)
- **Key** `de:lesson:b1u07-waehrend` · file `02-waehrend.yaml` · level `b1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói về thói quen dùng điện thoại, mạng xã hội; diễn tả đồng thời/tương phản.
- **Ngữ pháp mới:** `b1u07-g-waehrend-konjunktion` (während + câu phụ: đồng thời; tương phản "trong khi đó") · `b1u07-g-sobald-solange` (sobald = ngay khi; solange = chừng nào còn)
- **Từ mới** (trường: thói quen số): die Gewohnheit, -en · das soziale Netzwerk (`phrase`) · abhängig · die Bildschirmzeit (Sg.) · ablenken · ständig · erreichbar · die Benachrichtigung, -en
- **Lỗi người Việt:** dùng während với danh từ không Genitiv; "solange" hiểu thành "lâu như thế".

#### B1U07L3 · Hướng dẫn sử dụng – bị động trạng thái, nguyên thể danh từ hoá (Das Gerät ist eingeschaltet. Beim Laden …)
- **Key** `de:lesson:b1u07-gebrauchsanweisung` · file `03-gebrauchsanweisung.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc và làm theo hướng dẫn sử dụng; báo hỏng hóc.
- **Ngữ pháp mới:** `b1u07-g-zustandspassiv` (sein + Partizip II = trạng thái kết quả: Die Tür ist geschlossen ↔ wird geschlossen (quá trình)) · `b1u07-g-nominalisierter-infinitiv` (das + nguyên thể viết hoa: das Laden, beim Laden = khi đang sạc, zum Laden = để sạc)
- **Từ mới** (trường: thiết bị, sửa chữa): die Gebrauchsanweisung, -en · einschalten · ausschalten · anschließen, schloss an, hat angeschlossen · der Knopf, ¨-e · drücken · der Stecker, - · die Steckdose, -n · die Garantie, -n · die Reparatur, -en
- **Lỗi người Việt:** nhầm "ist geöffnet" với Perfekt; "beim laden" (không viết hoa).

#### B1U07L4 · Nghe tin tức – mốc thời gian chính xác (Gegen acht Uhr, Mitte Mai)
- **Key** `de:lesson:b1u07-nachrichten` · file `04-nachrichten.yaml` · level `b1` · skills `listening, speaking, vocabulary`
- **Can-do:** Hiểu tin vắn radio/TV, ghi lại ai – cái gì – khi nào – ở đâu.
- **Ngữ pháp mới:** `b1u07-g-zeitangaben-praezise` (gegen + giờ = khoảng; um … herum; Anfang/Mitte/Ende + tháng không giới từ; ab sofort; innerhalb von + Dat)
- **Từ mới** (trường: tin tức): die Meldung, -en · der Bericht, -e · die Schlagzeile, -n · aktuell · die Quelle, -n · der Journalist, -en · das Interview, -s · veröffentlichen
- **Lỗi người Việt:** "in Mitte Mai"; nghe nhầm Uhrzeit chính thức trong tin.

#### B1U07L5 · Ôn tập: bình luận một bài báo (Wiederholung)
- **Key** `de:lesson:b1u07-wiederholung` · file `05-wiederholung.yaml` · level `b1` · skills `reading, writing, listening`
- **Can-do:** Đọc bài báo (Lesen Teil 2) và **viết** bình luận ~80 từ về mạng xã hội; nghe 5 tin vắn (Hören Teil 1).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B1U08 · Du lịch và khác biệt văn hoá (Reisen und Kulturen) · `de:unit:b1u08-reisen-kultur` · thư mục `08-reisen-kultur`

#### B1U08L1 · Nước khác, phong tục khác – thay vì, mà không (Statt zu …, ohne zu …)
- **Key** `de:lesson:b1u08-andere-laender` · file `01-andere-laender.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** So sánh phong tục; nói việc làm thay thế hoặc làm mà không có điều kèm theo.
- **Ngữ pháp mới:** `b1u08-g-statt-ohne-zu` ((an)statt … zu / ohne … zu + nguyên thể, cùng chủ ngữ) · `b1u08-g-hin-her` (hin = ra xa người nói, her = về phía người nói: hinein/herein, hinauf/herunter; draußen/drinnen, oben/unten)
- **Từ mới** (trường: văn hoá, phong tục): die Kultur, -en · die Sitte, -n · der Brauch, ¨-e · die Tradition, -en · typisch · das Vorurteil, -e · das Klischee, -s · der Unterschied, -e · respektieren
- **Lỗi người Việt:** "ohne fragen" (thiếu zu); "Komm hin!" (đúng: Komm her!).

#### B1U08L2 · Lịch sự kiểu Đức – tiểu từ tình thái 1 (Komm doch mal vorbei!)
- **Key** `de:lesson:b1u08-hoeflichkeit` · file `02-hoeflichkeit.yaml` · level `b1` · skills `grammar, speaking, listening`
- **Can-do:** Hiểu và dùng các tiểu từ làm câu mềm/tự nhiên; xưng hô du/Sie đúng tình huống.
- **Ngữ pháp mới:** `b1u08-g-modalpartikeln-1` (doch (thuyết phục/nhắc), mal (làm nhẹ yêu cầu), ja (điều đã biết/ngạc nhiên), denn (câu hỏi thân mật), eben/halt (chấp nhận) – vị trí giữa câu, không dịch từng chữ)
- **Từ mới** (trường: phép lịch sự): höflich · unhöflich · die Begrüßung, -en · begrüßen · sich die Hand geben (`phrase`) · duzen · siezen · das Missverständnis, -se
- **Lỗi người Việt:** dịch doch = "nhưng" trong mọi câu; đặt mal đầu câu.
- **Văn hoá/ngữ dụng:** Ai đề nghị chuyển sang du (người lớn tuổi/cấp trên); bắt tay khi gặp ở bối cảnh trang trọng; thẳng thắn không có nghĩa là bất lịch sự.

#### B1U08L3 · Lễ hội và truyền thống – tiền tố hai kiểu, trật tự Mittelfeld (Wir übersetzen den Text / Wir setzen über)
- **Key** `de:lesson:b1u08-traditionen` · file `03-traditionen.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Tả lễ hội vùng miền; sắp xếp thời gian–lý do–cách thức–nơi chốn tự nhiên trong câu dài.
- **Ngữ pháp mới:** `b1u08-g-verbpraefixe-wechsel` (durch-, über-, um-, unter-, wieder-: tách khi nghĩa đen, nhấn tiền tố (Er setzt mit der Fähre über); không tách khi nghĩa bóng, nhấn gốc (Er übersetzt den Text)) · `b1u08-g-mittelfeld` (trật tự thường gặp Te-Ka-Mo-Lo: thời gian – lý do – cách thức – nơi chốn; Dativ trước Akk nếu là danh từ)
- **Từ mới** (trường: lễ hội Đức): der Karneval (Sg.) · das Volksfest, -e · das Feuerwerk, -e · die Tracht, -en · der Feiertag, -e · der Adventskalender, - · übersetzen
- **Lỗi người Việt:** đặt nơi chốn trước thời gian theo trật tự tiếng Việt (chấp nhận khi đúng ngữ pháp, nhưng dạy trật tự trung tính); "Ich habe den Text übergesetzt".
- **Văn hoá/ngữ dụng:** Karneval (Rheinland) = Fasching (Bayern, Áo) = Fasnacht (Tây Nam, Thụy Sĩ); ngày lễ khác nhau theo bang.

#### B1U08L4 · Lên kế hoạch chuyến đi – đề nghị lịch sự (Wir könnten doch …)
- **Key** `de:lesson:b1u08-reiseplanung` · file `04-reiseplanung.yaml` · level `b1` · skills `listening, speaking`
- **Can-do:** Cùng lên kế hoạch một chuyến đi/sự kiện, thương lượng, nhượng bộ (Goethe B1 Sprechen Teil 1).
- **Ngữ pháp mới:** `b1u08-g-vorschlag-konjunktiv` (Wir könnten …; Wie wäre es, wenn …?; Hättest du Lust, …?; Ich würde vorschlagen, dass …; Es wäre besser, wenn …)
- **Từ mới** (trường: lưu trú, đi lại): die Unterkunft, ¨-e · die Jugendherberge, -n · die Pension, -en · der Campingplatz, ¨-e · die Rundreise, -n · die Verbindung, -en · die Ermäßigung, -en · stornieren
- **Lỗi người Việt:** đề nghị bằng mệnh lệnh trực tiếp; không đáp lại đề nghị của bạn (thi trừ điểm tương tác).

#### B1U08L5 · Ôn tập: e-mail khiếu nại sau chuyến đi (Wiederholung)
- **Key** `de:lesson:b1u08-wiederholung` · file `05-wiederholung.yaml` · level `b1` · skills `reading, writing, speaking`
- **Can-do:** **Viết** thư khiếu nại/hỏi thông tin trang trọng ~80–100 từ; đọc tờ thông tin du lịch (Lesen Teil 5: quy định, hướng dẫn).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B1U09 · Xã hội và cuộc sống chung (Gesellschaft und Zusammenleben) · `de:unit:b1u09-gesellschaft` · thư mục `09-gesellschaft`

#### B1U09L1 · Làm tình nguyện – zu-Infinitiv hay dass? (Es ist schön, anderen zu helfen.)
- **Key** `de:lesson:b1u09-ehrenamt` · file `01-ehrenamt.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Kể về hoạt động tình nguyện, hội nhóm; chọn đúng cấu trúc zu hay dass.
- **Ngữ pháp mới:** `b1u09-g-zu-infinitiv-dass` (cùng chủ ngữ/chủ thể chung → zu-Infinitiv; khác chủ ngữ → dass; động từ chỉ cho phép dass: sagen, glauben – so sánh)
- **Từ mới** (trường: xã hội dân sự): das Ehrenamt, ¨-er · ehrenamtlich · der Verein, -e · das Mitglied, -er · sich engagieren · spenden · die Spende, -n · unterstützen · die Gemeinschaft, -en
- **Lỗi người Việt:** "Ich hoffe, dass ich bald komme" (đúng nhưng nặng – dạy "Ich hoffe, bald zu kommen"); "Er sagt, zu kommen" (sai).

#### B1U09L2 · Hàng xóm – tính từ phái sinh (Rücksichtsvoll, unmöglich, machbar)
- **Key** `de:lesson:b1u09-nachbarschaft` · file `02-nachbarschaft.yaml` · level `b1` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói về quy định chung cư, giải quyết mâu thuẫn hàng xóm.
- **Ngữ pháp mới:** `b1u09-g-wortbildung-adjektiv` (-bar (có thể được: machbar), -los (không có: arbeitslos), -voll (đầy), -lich, -ig, -isch; un- phủ định; nhận ra nghĩa từ cấu tạo)
- **Từ mới** (trường: sống chung cư): die Hausordnung, -en · die Ruhezeit, -en · der Lärm (Sg.) · stören · die Rücksicht (Sg.) · rücksichtsvoll · der Konflikt, -e · sich einigen · der Kompromiss, -e
- **Lỗi người Việt:** "unmachbar" (không tồn tại – dạy nhận biết, không tự tạo từ); dùng giọng mệnh lệnh khi nhắc hàng xóm.
- **Văn hoá/ngữ dụng:** Ruhezeiten (thường 22–6 giờ và Chủ nhật) – quy định theo nội quy/địa phương.

#### B1U09L3 · Chính trị dễ hiểu – câu so sánh (Die Wahl war knapper, als man dachte.)
- **Key** `de:lesson:b1u09-politik-wahl` · file `03-politik-wahl.yaml` · level `b1` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc bản tin bầu cử đơn giản; so sánh kỳ vọng và thực tế.
- **Ngữ pháp mới:** `b1u09-g-vergleichssatz` (Komparativ + als + câu phụ: besser, als ich dachte; so + tính từ + wie + câu phụ: so schnell, wie es geht; wie erwartet)
- **Từ mới** (trường: nhà nước, bầu cử): die Politik (Sg.) · die Wahl, -en · wählen · die Partei, -en · die Regierung, -en · der Bürger, - · die Demokratie, -n · das Recht, -e · die Pflicht, -en
- **Lỗi người Việt:** "besser wie ich dachte" (văn nói vùng miền – không chuẩn); "als ich habe gedacht".
- **Văn hoá/ngữ dụng:** Đức: liên bang 16 bang, Bundestag; Áo 9 bang; Thụy Sĩ 26 bang (Kantone) và dân chủ trực tiếp – chỉ nêu khung.

#### B1U09L4 · Trình bày một chủ đề (Ich möchte euch heute … vorstellen.)
- **Key** `de:lesson:b1u09-praesentieren` · file `04-praesentieren.yaml` · level `b1` · skills `speaking, listening`
- **Can-do:** Trình bày 3–4 phút có cấu trúc 5 phần và trả lời câu hỏi của người nghe (Goethe B1 Sprechen Teil 2–3).
- **Ngữ pháp mới:** `b1u09-g-praesentation-redemittel` (mở đầu: Ich spreche heute über …; chuyển ý: Ich komme jetzt zu …; kinh nghiệm: Ich habe selbst erlebt, dass …; so sánh: In Vietnam ist das anders …; kết: Zum Schluss möchte ich …; cảm ơn và mời hỏi)
- **Từ mới** (trường: thuyết trình): die Präsentation, -en · der Vortrag, ¨-e · die Folie, -n · die Gliederung, -en · das Thema, Themen · zusammenfassen · das Publikum (Sg.)
- **Lỗi người Việt:** đọc thuộc lòng; thiếu chuyển ý; không hỏi lại khi không hiểu câu hỏi.

#### B1U09L5 · Ôn tập: bài nói + phản hồi (Wiederholung)
- **Key** `de:lesson:b1u09-wiederholung` · file `05-wiederholung.yaml` · level `b1` · skills `speaking, reading, writing`
- **Can-do:** Chuẩn bị đầy đủ bài trình bày về "tình nguyện"/"hàng xóm" theo cấu trúc thi; **viết** phản hồi ~40 từ (Schreiben Teil 3) cho ban quản lý toà nhà.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B1U10 · Ôn B1 và thi Goethe-Zertifikat B1 (Prüfungstraining B1) · `de:unit:b1u10-pruefung-b1` · thư mục `10-pruefung-b1`

#### B1U10L1 · Đọc hiểu: liên kết văn bản (Textverweise: dies, dabei, deshalb) · *Lesen*
- **Key** `de:lesson:b1u10-lesen` · file `01-lesen.yaml` · level `b1` · skills `reading, grammar, vocabulary`
- **Can-do:** Làm 5 dạng Lesen B1 (blog đúng/sai; báo chí chọn ý; ghép quảng cáo; ý kiến ủng hộ/phản đối; quy định–hướng dẫn) với chiến lược tìm từ khoá và từ quy chiếu.
- **Ngữ pháp mới:** `b1u10-g-textverweise` (từ quy chiếu trong văn bản: dies/das, dieser, dabei, dafür, dadurch, deshalb, solche – trỏ về câu trước)
- **Từ mới** (trường: ngôn ngữ đề thi): die Aussage, -n · zutreffen, trifft zu, traf zu, hat zugetroffen · der Abschnitt, -e · die Überschrift, -en · der Zusammenhang, ¨-e · behaupten
- **Lỗi người Việt:** chọn đáp án vì trùng chữ thay vì trùng nghĩa.

#### B1U10L2 · Nghe hiểu: tiếng Đức nói thực tế (Gesprochene Sprache) · *Hören*
- **Key** `de:lesson:b1u10-hoeren` · file `02-hoeren.yaml` · level `b1` · skills `listening, vocabulary`
- **Can-do:** Làm 4 dạng Hören B1 (5 đoạn ngắn; hướng dẫn tham quan/thuyết minh; cuộc trò chuyện đúng/sai; thảo luận radio ai nói gì); hiểu dạng rút gọn khi nói.
- **Ngữ pháp mới:** `b1u10-g-gesprochene-sprache` (nhận biết: hab/hast's, 'n Kaffee, nee/nö, ne? (đúng không?), weil + V2 trong văn nói, gell/gelle (miền Nam), ach so, na ja)
- **Từ mới** (trường: radio, điện thoại): der Wetterbericht, -e · der Anrufbeantworter, - · die Radiosendung, -en · der Moderator, -en · der Hörer, - · die Umfrage, -n
- **Lỗi người Việt:** cố nghe từng từ; không ghi chú khi nghe lần đầu.

#### B1U10L3 · Viết: thư trang trọng chuẩn (Der formelle Brief) · *Schreiben*
- **Key** `de:lesson:b1u10-schreiben` · file `03-schreiben.yaml` · level `b1` · skills `writing, reading`
- **Can-do:** Viết 3 dạng Schreiben B1 (e-mail thân mật ~80 từ; bài diễn đàn ~80 từ; tin nhắn trang trọng ~40 từ) có đủ ý, nối câu, chào – kết đúng.
- **Ngữ pháp mới:** `b1u10-g-formeller-brief` (Betreff; mở đầu nêu lý do: Ich schreibe Ihnen, weil …; yêu cầu: Ich wäre Ihnen dankbar, wenn …; xin lỗi: Leider kann ich …; kết: Für Rückfragen stehe ich gern zur Verfügung (cụm cố định))
- **Từ mới** (trường: thư từ công việc): der Betreff, -e · die Anfrage, -n · die Absage, -n · die Zusage, -n · mitteilen · in Bezug auf (`phrase`) · das Anliegen, - · die Bitte, -n
- **Lỗi người Việt:** viết hoa "Sie/Ihnen" sai (thư trang trọng phải viết hoa); quên 1 trong 3 ý đề yêu cầu.

#### B1U10L4 · Nói: giữ cuộc trò chuyện (Nachfragen, ergänzen, unterbrechen) · *Sprechen*
- **Key** `de:lesson:b1u10-sprechen` · file `04-sprechen.yaml` · level `b1` · skills `speaking, listening`
- **Can-do:** Làm 3 phần Sprechen B1 (lên kế hoạch cùng nhau; trình bày; phản hồi + trả lời câu hỏi), dùng chiến lược hỏi lại, câu giờ, bổ sung, ngắt lời lịch sự.
- **Ngữ pháp mới:** `b1u10-g-gespraechsstrategien` (Habe ich Sie richtig verstanden, dass …? / Moment, lass mich kurz überlegen. / Darf ich kurz etwas ergänzen? / Entschuldigung, wenn ich unterbreche …)
- **Từ mới** (trường: hội thoại): nachfragen · ergänzen · unterbrechen, unterbricht, unterbrach, hat unterbrochen · die Rückfrage, -n · das Gespräch, -e · der Gesprächspartner, -
- **Lỗi người Việt:** im lặng khi không hiểu; nói độc thoại ở Teil 1.

#### B1U10L5 · Đề mô phỏng Goethe-Zertifikat B1 (Modelltest B1)
- **Key** `de:lesson:b1u10-modelltest-b1` · file `05-modelltest-b1.yaml` · level `b1` · skills `reading, listening, writing, speaking`
- **Can-do:** Làm đủ một lượt dạng bài 4 module B1 (Lesen 5 Teile, Hören 4 Teile, Schreiben 3 Teile, Sprechen 3 Teile) trong khuôn khổ bài tập của ứng dụng (phần viết/nói dài: mẫu + tự chấm theo tiêu chí).
- **Ngữ pháp mới:** — · **Từ mới:** — (reuse A1–B1)

### Chương trình B2 · `de:program:b2` (b2)

B2 chuyển trọng tâm sang văn viết trang trọng (Nominalstil), lập luận và hiểu văn bản/bài nói dài. Mỗi unit có một nhiệm vụ viết B2 (bài diễn đàn/ý kiến ~150 từ hoặc thư trang trọng ~100 từ) và một nhiệm vụ nói (thuyết trình ~4 phút hoặc thảo luận).

---

#### Unit B2U01 · Giáo dục và sự nghiệp (Bildung und Karriere) · `de:unit:b2u01-bildung-karriere` · thư mục `01-bildung-karriere`

#### B2U01L1 · Cơ hội học vấn – danh từ hoá (Nach Abschluss des Studiums …)
- **Key** `de:lesson:b2u01-nominalisierung` · file `01-nominalisierung.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc và viết câu theo văn phong danh từ; chuyển qua lại giữa câu phụ và cụm giới từ.
- **Ngữ pháp mới:** `b2u01-g-nominalisierung` (Verbalstil ↔ Nominalstil: weil → wegen/aufgrund, obwohl → trotz, nachdem → nach, bevor → vor, während → während, wenn → bei, um…zu → zum/zur; động từ → danh từ -ung/nguyên thể; chủ ngữ → Genitiv hoặc von + Dat) · `b2u01-g-genitivattribut` (chuỗi Genitiv và Genitiv đứng trước tên riêng: die Anerkennung ausländischer Abschlüsse)
- **Từ mới** (trường: học vấn, trình độ): die Bildung (Sg.) · die Chancengleichheit (Sg.) · der Bildungsweg, -e · die Qualifikation, -en · qualifiziert · der Fachkräftemangel (Sg.) · die Fachkraft, ¨-e · die Anerkennung (Sg.) · anerkennen, erkannte an, hat anerkannt
- **Lỗi người Việt:** danh từ hoá nhưng quên đổi trạng từ thành tính từ (schnell arbeiten → **schnelles** Arbeiten); chọn sai giới từ đi với danh từ.
- **Văn hoá/ngữ dụng:** Công nhận bằng cấp nước ngoài (Anerkennung) – thực tế quan trọng cho người Việt ở Đức.

#### B2U01L2 · Một mặt… mặt khác – nối ý đối lập, nhượng bộ (Einerseits …, andererseits …)
- **Key** `de:lesson:b2u01-einerseits-andererseits` · file `02-einerseits-andererseits.yaml` · level `b2` · skills `grammar, vocabulary, writing`
- **Can-do:** Cân nhắc ưu nhược của thăng tiến nghề nghiệp, viết đoạn lập luận hai chiều.
- **Ngữ pháp mới:** `b2u01-g-adversativ-konzessiv` (einerseits … andererseits, dennoch, allerdings, jedoch, hingegen/dagegen, wohingegen + câu phụ) · `b2u01-g-auch-wenn` (auch wenn / selbst wenn = dù cho, kể cả khi; dạng chuẩn để dạy: câu phụ đứng đầu → đảo: Auch wenn es schwer ist, gebe ich nicht auf)
- **Từ mới** (trường: thăng tiến): der Aufstieg, -e · die Beförderung, -en · befördern · die Führungskraft, ¨-e · der Ehrgeiz (Sg.) · ehrgeizig · die Leistung, -en · leistungsorientiert
- **Lỗi người Việt:** "jedoch" luôn đặt đầu câu kèm dấu phẩy như "however,"; nhầm wohingegen với obwohl.
- **Ghi chú ngữ pháp:** câu phụ nhượng bộ – điều kiện (auch wenn, selbst wenn, và dạng wie/was … auch) **được phép** đứng "ngoài" câu chính mà không đảo (Auch wenn es regnet, wir gehen trotzdem spazieren) – đây là cấu trúc chuẩn, không phải lỗi. Vì vậy **không** đưa dạng không đảo vào `known_wrong`/phương án nhiễu; bài tập `word_bank` phải liệt kê cả hai thứ tự trong `orders` nếu cả hai đúng.

#### B2U01L3 · Bằng cách… – indem, dadurch dass; folglich (Indem man lernt, …)
- **Key** `de:lesson:b2u01-indem` · file `03-indem.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Diễn đạt phương tiện/cách thức và hệ quả trang trọng khi nói về phát triển năng lực.
- **Ngữ pháp mới:** `b2u01-g-indem` (indem / dadurch, dass = bằng cách; durch + Akk; câu hỏi: Wie? Wodurch?) · `b2u01-g-konsekutiv-formal` (folglich, infolgedessen, somit, demnach – trạng từ nối, đảo động từ; so với sodass (B1))
- **Từ mới** (trường: năng lực): die Kompetenz, -en · erwerben, erwirbt, erwarb, hat erworben · sich aneignen · die Fähigkeit, -en · fördern · die Förderung (Sg.) · vermitteln · lebenslanges Lernen (`phrase`)
- **Lỗi người Việt:** dùng "durch" + câu; "indem" với chủ ngữ khác (indem thường cùng chủ ngữ).

#### B2U01L4 · Phỏng vấn tuyển dụng – es làm từ giữ chỗ (Es freut mich, dass …)
- **Key** `de:lesson:b2u01-vorstellungsgespraech` · file `04-vorstellungsgespraech.yaml` · level `b2` · skills `listening, speaking, grammar`
- **Can-do:** Tham gia phỏng vấn: nói về điểm mạnh, mức lương mong muốn, điều kiện hợp đồng; nghe phỏng vấn mẫu.
- **Ngữ pháp mới:** `b2u01-g-es-korrelat` (es đứng trước báo hiệu câu phụ/zu-Infinitiv: Ich finde es wichtig, dass …; es ở vị trí 1 giữ chỗ: Es meldeten sich viele Bewerber; es biến mất khi câu phụ đứng đầu)
- **Từ mới** (trường: hợp đồng lao động): die Gehaltsvorstellung, -en · die Probezeit, -en · die Kündigung, -en · kündigen · der Arbeitsvertrag, ¨-e · die Belastbarkeit (Sg.) · die Teamfähigkeit (Sg.) · verhandeln
- **Lỗi người Việt:** thiếu es ("Ich finde wichtig, dass" – văn nói chấp nhận được, viết nên có es); giữ es khi câu phụ đứng đầu ("Dass …, freut es mich" sai).

#### B2U01L5 · Ôn tập: thư trang trọng gửi cấp trên/cơ sở đào tạo (Wiederholung)
- **Key** `de:lesson:b2u01-wiederholung` · file `05-wiederholung.yaml` · level `b2` · skills `reading, writing, listening`
- **Can-do:** **Viết** thư trang trọng ~100 từ (Goethe B2 Schreiben Teil 2: xin nghỉ học thêm, xin thay đổi lịch) theo 4 ý; đọc văn bản dài về giáo dục (Lesen Teil 1: quan điểm nhiều người).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B2U02 · Kinh tế và thế giới lao động (Wirtschaft und Arbeitswelt) · `de:unit:b2u02-wirtschaft` · thư mục `02-wirtschaft`

#### B2U02L1 · Việc này giải quyết được – thay thế bị động (Das lässt sich lösen. Das ist zu klären.)
- **Key** `de:lesson:b2u02-passiversatz` · file `01-passiversatz.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Diễn đạt khả năng/nghĩa vụ khách quan bằng các cấu trúc thay bị động trong văn bản kinh tế.
- **Ngữ pháp mới:** `b2u02-g-sich-lassen` (sich lassen + nguyên thể = có thể được: Das Problem lässt sich lösen = kann gelöst werden) · `b2u02-g-sein-zu` (sein + zu + nguyên thể = có thể/phải được: Der Antrag ist bis Freitag einzureichen) · `b2u02-g-haben-zu` (haben + zu = phải: Wir haben das bis morgen zu erledigen)
- **Từ mới** (trường: thị trường): die Wirtschaft (Sg.) · wirtschaftlich · der Markt, ¨-e · die Nachfrage (Sg.) · der Wettbewerb, -e · die Konkurrenz (Sg.) · der Umsatz, ¨-e · der Gewinn, -e · der Verlust, -e
- **Lỗi người Việt:** hiểu "ist zu machen" là "đã đóng"; nhầm sein zu (khả năng hay nghĩa vụ – dựa vào ngữ cảnh).
- **Ghi chú:** "das Angebot" (A1U07L4) dùng nghĩa "cung" (Angebot und Nachfrage) – reuse + ghi chú.

#### B2U02L2 · Giá tăng – cụm phân từ mở rộng (Die seit Monaten steigenden Preise)
- **Key** `de:lesson:b2u02-partizipialattribut` · file `02-partizipialattribut.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc và tách cụm phân từ dài trong báo kinh tế; chuyển thành mệnh đề quan hệ và ngược lại.
- **Ngữ pháp mới:** `b2u02-g-partizipialattribut-erweitert` (mạo từ … [bổ ngữ] + Partizip + đuôi + danh từ: die von der Regierung beschlossenen Maßnahmen; đọc từ mạo từ nhảy tới danh từ) · `b2u02-g-relativsatz-partizip-umformung` (die Preise, die seit Monaten steigen ↔ die seit Monaten steigenden Preise)
- **Từ mới** (trường: giá cả, thu nhập): die Inflation (Sg.) · der Preisanstieg, -e · die Kaufkraft (Sg.) · die Lebenshaltungskosten (Pl.) · der Verbraucher, - · der Konsum (Sg.) · das Einkommen, - · die Steuer, -n
- **Lỗi người Việt:** đọc tuần tự từ trái sang phải và lạc chủ thể; quên đuôi tính từ ở Partizip.

#### B2U02L3 · Ra quyết định – cụm động từ chức năng, giới từ Genitiv trang trọng (Eine Entscheidung treffen, aufgrund …)
- **Key** `de:lesson:b2u02-funktionsverbgefuege` · file `03-funktionsverbgefuege.yaml` · level `b2` · skills `grammar, vocabulary, writing`
- **Can-do:** Viết câu văn phong công sở/kinh tế với cụm danh từ – động từ cố định.
- **Ngữ pháp mới:** `b2u02-g-funktionsverbgefuege` (danh từ mang nghĩa + động từ "rỗng": eine Entscheidung treffen, eine Frage stellen, in Frage kommen, zur Verfügung stellen/stehen, Kritik üben, in Anspruch nehmen, Rücksicht nehmen auf, zum Ausdruck bringen, eine Rolle spielen) · `b2u02-g-genitiv-praep-formal` (aufgrund, angesichts, infolge, bezüglich, hinsichtlich, mithilfe, anhand, zugunsten, anlässlich + Gen)
- **Từ mới** (trường: chiến lược doanh nghiệp): die Maßnahme, -n · die Strategie, -n · die Investition, -en · investieren · der Standort, -e · die Globalisierung (Sg.) · der Handel (Sg.) · die Branche, -n
- **Lỗi người Việt:** ghép sai động từ ("eine Entscheidung machen" theo tiếng Anh make a decision); dịch từng chữ cụm cố định.

#### B2U02L4 · Mô tả biểu đồ – số liệu (Der Anteil ist um 5 % gestiegen.)
- **Key** `de:lesson:b2u02-statistik` · file `04-statistik.yaml` · level `b2` · skills `listening, speaking, vocabulary`
- **Can-do:** Mô tả và bình luận biểu đồ/số liệu trong bài nói; nghe bản tin kinh tế.
- **Ngữ pháp mới:** `b2u02-g-grafik-redemittel` (steigen/sinken **um** (mức thay đổi) / **auf** (giá trị mới) / **von … auf**; der Anstieg um …; Die Grafik zeigt …; Im Vergleich zu …; Auffällig ist, dass …; Prozent vs. Prozentpunkt)
- **Từ mới** (trường: thống kê): die Statistik, -en · die Grafik, -en · der Anteil, -e · der Durchschnitt, -e · durchschnittlich · sinken, sank, ist gesunken · der Anstieg, -e · der Rückgang, ¨-e · sich verdoppeln
- **Lỗi người Việt:** nhầm um/auf; "Die Zahl hat gestiegen".
- **Ghi chú:** zunehmen/abnehmen (A2U04L3: tăng/giảm cân) dùng nghĩa "tăng/giảm" – reuse + ghi chú.

#### B2U02L5 · Ôn tập: bài diễn đàn về tiêu dùng (Wiederholung)
- **Key** `de:lesson:b2u02-wiederholung` · file `05-wiederholung.yaml` · level `b2` · skills `reading, writing, listening`
- **Can-do:** **Viết** bài diễn đàn ~150 từ (Goethe B2 Schreiben Teil 1: nêu ý kiến, lý do, ví dụ, ưu nhược, đề xuất) về "Mua sắm online có hại cho cửa hàng nhỏ?"; nghe bản tin kinh tế (Hören Teil 3).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B2U03 · Khoa học và công nghệ (Wissenschaft und Technik) · `de:unit:b2u03-wissenschaft-technik` · thư mục `03-wissenschaft-technik`

#### B2U03L1 · Nghiên cứu – bị động không chủ ngữ, bị động có modal ở quá khứ (Es wird geforscht. Das hätte getestet werden müssen.)
- **Key** `de:lesson:b2u03-forschung` · file `01-forschung.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc báo khoa học phổ thông; mô tả quy trình nghiên cứu.
- **Ngữ pháp mới:** `b2u03-g-unpersoenliches-passiv` (bị động không chủ ngữ với động từ nội động: Hier wird nicht geraucht; Es wird viel geforscht – es biến mất khi có thành phần khác ở vị trí 1) · `b2u03-g-passiv-modal-vergangenheit` (Präteritum: musste getestet werden; Perfekt: hat getestet werden müssen; câu phụ: …, dass es hat getestet werden müssen – nhận biết)
- **Từ mới** (trường: nghiên cứu): die Forschung, -en · forschen · der Wissenschaftler, - · die Studie, -n · das Experiment, -e · das Ergebnis, -se · beweisen, bewies, hat bewiesen · die Erkenntnis, -se · das Labor, -e
- **Lỗi người Việt:** "Es wird hier nicht geraucht" ok nhưng "Hier es wird"; bỏ werden ở bị động modal quá khứ.

#### B2U03L2 · Công nghệ tương lai – Futur II, modal phỏng đoán (Bis 2040 wird man … erfunden haben. Das dürfte stimmen.)
- **Key** `de:lesson:b2u03-zukunftstechnologien` · file `02-zukunftstechnologien.yaml` · level `b2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Phỏng đoán với mức độ chắc chắn khác nhau; dự báo việc sẽ hoàn thành.
- **Ngữ pháp mới:** `b2u03-g-futur-ii` (werden + Partizip II + haben/sein: hoàn thành trước một mốc tương lai; phỏng đoán về quá khứ: Er wird den Zug verpasst haben) · `b2u03-g-modalverben-subjektiv` (mức chắc chắn: muss (gần chắc) > dürfte (khá chắc) > kann/könnte (có thể); kann nicht = không thể nào; quá khứ: muss … gewesen sein)
- **Từ mới** (trường: công nghệ mới): die künstliche Intelligenz (`phrase`, KI) · die Technologie, -n · der Roboter, - · automatisieren · die Digitalisierung (Sg.) · die Innovation, -en · ersetzen · das Risiko, Risiken · die Erfindung, -en · erfinden, erfand, hat erfunden
- **Lỗi người Việt:** hiểu "muss" phỏng đoán là bắt buộc; "dürfte" hiểu thành "được phép".

#### B2U03L3 · Phát hiện mà… – quan hệ Genitiv, tiền tố mang nghĩa (Ein Forscher, dessen Theorie …)
- **Key** `de:lesson:b2u03-dessen-deren` · file `03-dessen-deren.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Viết câu học thuật mô tả nhà khoa học, lý thuyết; đoán nghĩa động từ qua tiền tố.
- **Ngữ pháp mới:** `b2u03-g-relativ-genitiv` (dessen (der/das), deren (die, số nhiều); danh từ sau nó không có mạo từ, tính từ theo bảng không mạo từ: der Forscher, dessen neue Theorie …) · `b2u03-g-verbpraefixe-bedeutung` (ent- (bỏ/khởi đầu), ver- (sai/thay đổi/hết), zer- (vỡ vụn), miss- (sai), er- (đạt được), be- (biến thành ngoại động))
- **Từ mới** (trường: khám phá, lý thuyết): die Entdeckung, -en · entdecken · die Theorie, -n · die These, -n · widerlegen · bestätigen · zerstören · missverstehen, missverstand, hat missverstanden
- **Lỗi người Việt:** "der Forscher, dessen die Theorie"; chọn dessen/deren theo danh từ phía sau (đúng: theo danh từ phía trước).

#### B2U03L4 · Thuyết trình khoa học (Ein Kurzvortrag) · *Goethe B2 Sprechen Teil 1*
- **Key** `de:lesson:b2u03-vortrag` · file `04-vortrag.yaml` · level `b2` · skills `speaking, listening`
- **Can-do:** Thuyết trình ~4 phút: giới thiệu chủ đề, nêu các phương án, ví dụ ở Việt Nam, ưu nhược, ý kiến riêng; nghe bài giảng ngắn và ghi chú.
- **Ngữ pháp mới:** `b2u03-g-vortrag-redemittel` (Einleitung: In meinem Vortrag geht es um …; Strukturierung: Zunächst …, Im Anschluss daran …; Beispiele: Ein Beispiel dafür ist …; Bewertung; Schluss: Abschließend lässt sich sagen …)
- **Từ mới** (trường: thuyết trình học thuật): die Einleitung, -en · der Hauptteil, -e · das Fazit, -s · veranschaulichen · der Zuhörer, - · darstellen · erläutern
- **Lỗi người Việt:** không nói rõ cấu trúc; bỏ phần quan điểm cá nhân.

#### B2U03L5 · Ôn tập: văn bản khoa học phổ thông (Wiederholung)
- **Key** `de:lesson:b2u03-wiederholung` · file `05-wiederholung.yaml` · level `b2` · skills `reading, writing, speaking`
- **Can-do:** Đọc bài báo dài và chọn câu điền vào chỗ trống (kiểu Lesen Teil 3 – cấu trúc văn bản); **viết** tóm tắt ~100 từ; chuẩn bị bài thuyết trình về "AI trong giáo dục".
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B2U04 · Truyền thông và giao tiếp (Medien und Kommunikation) · `de:unit:b2u04-medien` · thư mục `04-medien`

#### B2U04L1 · Ông ấy nói rằng… – Konjunktiv I (Der Minister sagte, er sei zufrieden.)
- **Key** `de:lesson:b2u04-konjunktiv-i` · file `01-konjunktiv-i.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Hiểu và thuật lại lời người khác theo cách báo chí (gián tiếp, giữ khoảng cách).
- **Ngữ pháp mới:** `b2u04-g-konjunktiv-i-formen` (gốc + -e, -est, -e, -en, -et, -en; sein: sei, seist, sei, seien; thực tế hay dùng ngôi 3: er habe, komme, werde, könne) · `b2u04-g-indirekte-rede` (KI ở hiện tại; khi KI trùng hiện tại (sie haben) → thay bằng KII (sie hätten) hoặc würde; đổi đại từ/thời gian theo người thuật)
- **Từ mới** (trường: báo chí): die Presse (Sg.) · die Pressefreiheit (Sg.) · der Sender, - · die Redaktion, -en · zitieren · das Zitat, -e · die Äußerung, -en · äußern
- **Lỗi người Việt:** coi KI là "sai chính tả"; giữ nguyên đại từ của người nói gốc.

#### B2U04L2 · Bà ấy nói đã… – lời gián tiếp quá khứ, câu hỏi, yêu cầu (Sie habe nichts gewusst.)
- **Key** `de:lesson:b2u04-indirekte-rede-vergangenheit` · file `02-indirekte-rede-vergangenheit.yaml` · level `b2` · skills `grammar, vocabulary, writing`
- **Can-do:** Thuật lại tin đồn/phát ngôn về quá khứ, câu hỏi và yêu cầu; nhận diện tin giả.
- **Ngữ pháp mới:** `b2u04-g-indirekte-rede-vergangenheit` (habe/sei + Partizip II: er habe gesagt, sie sei gekommen) · `b2u04-g-indirekte-frage-aufforderung` (câu hỏi: ob/W- + KI; yêu cầu: solle/möge + nguyên thể)
- **Từ mới** (trường: tin giả, kiểm chứng): das Gerücht, -e · die Falschmeldung, -en · verbreiten · manipulieren · die Glaubwürdigkeit (Sg.) · glaubwürdig · der Faktencheck, -s · überprüfen
- **Lỗi người Việt:** "er sagte, er habe gestern gekommen" (aux sai: sei gekommen); dùng würde cho quá khứ.

#### B2U04L3 · Theo nguồn tin… – laut, zufolge, sollen/wollen (Laut Polizei soll der Täter geflohen sein.)
- **Key** `de:lesson:b2u04-quellen` · file `03-quellen.yaml` · level `b2` · skills `grammar, reading, vocabulary`
- **Can-do:** Phân biệt sự thật – tin chưa xác minh – lời tự nhận trong báo chí.
- **Ngữ pháp mới:** `b2u04-g-quellenangabe` (laut + Dat/Gen, Angaben zufolge (zufolge đứng sau, + Dat), nach Angaben + Gen, wie … berichtet) · `b2u04-g-sollen-wollen-fremd` (sollen = nghe nói/được cho là: Er soll reich sein; wollen = tự nhận: Er will nichts gesehen haben)
- **Từ mới** (trường: đưa tin): angeblich · der Augenzeuge, -n · die Behauptung, -en · bestreiten, bestritt, hat bestritten · dementieren · die Angabe, -n · die Stellungnahme, -n
- **Lỗi người Việt:** hiểu "soll" = phải; "Er will es gesehen" (thiếu haben).

#### B2U04L4 · Giao tiếp hằng ngày – tiểu từ tình thái 2 (Das ist eigentlich ganz einfach.)
- **Key** `de:lesson:b2u04-kommunikation` · file `04-kommunikation.yaml` · level `b2` · skills `listening, speaking, grammar`
- **Can-do:** Nghe và hiểu sắc thái (mỉa mai, nhượng bộ, trấn an) trong hội thoại thật; dùng tiểu từ tự nhiên.
- **Ngữ pháp mới:** `b2u04-g-modalpartikeln-2` (eigentlich (thật ra/đổi chủ đề), wohl (phỏng đoán), schon (trấn an/nhượng bộ), ruhig (cứ tự nhiên), bloß/nur (cảnh báo, ước), etwa (nghi ngờ trong câu hỏi))
- **Từ mới** (trường: giao tiếp phi ngôn ngữ): die Körpersprache (Sg.) · der Blickkontakt (Sg.) · die Geste, -n · die Mimik (Sg.) · der Tonfall (Sg.) · ironisch · die Ironie (Sg.) · andeuten
- **Lỗi người Việt:** dùng tiểu từ dày đặc trong văn viết trang trọng; hiểu sai "schon" là "rồi".

#### B2U04L5 · Ôn tập: tóm tắt một bài báo (Wiederholung)
- **Key** `de:lesson:b2u04-wiederholung` · file `05-wiederholung.yaml` · level `b2` · skills `reading, writing, listening`
- **Can-do:** Đọc bài báo, **viết** tóm tắt trung tính ~120 từ có lời gián tiếp; nghe phỏng vấn radio (Hören Teil 2) và chọn đáp án.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B2U05 · Chính trị và xã hội (Politik und Gesellschaft) · `de:unit:b2u05-politik-gesellschaft` · thư mục `05-politik-gesellschaft`

#### B2U05L1 · Nếu như, trừ phi – điều kiện trang trọng (Sofern …, es sei denn …)
- **Key** `de:lesson:b2u05-sofern` · file `01-sofern.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Hiểu văn bản luật/quy chế đơn giản hoá; nêu điều kiện và ngoại lệ.
- **Ngữ pháp mới:** `b2u05-g-sofern-soweit` (sofern/soweit = với điều kiện là/trong chừng mực; es sei denn = trừ phi (+ V2 hoặc dass)) · `b2u05-g-bedingung-nominal` (bei + Nomen: bei Regen; im Falle + Gen/im Fall von; ohne + Nomen = nếu không có)
- **Từ mới** (trường: nhà nước pháp quyền): das Gesetz, -e · die Verfassung, -en · der Staat, -en · der Bundestag (Sg.) · die Wahlbeteiligung (Sg.) · abstimmen · die Abstimmung, -en · das Grundgesetz (Sg.)
- **Lỗi người Việt:** "es sei denn" + động từ cuối (đúng là V2: …, es sei denn, es regnet).

#### B2U05L2 · Hơn nữa – trạng từ nối văn bản, zumal (Darüber hinaus …, zumal …)
- **Key** `de:lesson:b2u05-darueber-hinaus` · file `02-darueber-hinaus.yaml` · level `b2` · skills `grammar, vocabulary, writing`
- **Can-do:** Viết đoạn lập luận liền mạch về bất bình đẳng xã hội.
- **Ngữ pháp mới:** `b2u05-g-textkonnektoren` (bổ sung: zudem, darüber hinaus, ferner, außerdem; thay thế: stattdessen; điều kiện ngược: andernfalls, sonst; tương phản: hingegen – đều chiếm vị trí 1 → đảo) · `b2u05-g-zumal` (zumal = nhất là vì (lý do bổ sung, câu phụ))
- **Từ mới** (trường: xã hội): die Gesellschaft, -en · gesellschaftlich · die Gleichberechtigung (Sg.) · die Armut (Sg.) · der Reichtum, ¨-er · die Ungleichheit, -en · sozial · die Generation, -en
- **Lỗi người Việt:** lặp "und dann/außerdem" liên tục; "zumal" dùng như weil cho lý do chính.

#### B2U05L3 · Đấu tranh cho… – động từ, danh từ đi với giới từ B2 (Sich einsetzen für, der Einfluss auf)
- **Key** `de:lesson:b2u05-verben-nomen-praeposition` · file `03-verben-nomen-praeposition.yaml` · level `b2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Nói về sự tham gia xã hội, ảnh hưởng, trách nhiệm với cụm cố định chính xác.
- **Ngữ pháp mới:** `b2u05-g-verben-praeposition-b2` (sich einsetzen für, beitragen zu, sich auseinandersetzen mit, bestehen auf/aus/in, abhängen von, sich beziehen auf, führen zu, verfügen über) · `b2u05-g-nomen-praeposition` (der Einfluss auf, die Kritik an, das Interesse an, die Verantwortung für, die Teilnahme an, der Zugang zu)
- **Từ mới** (trường: tham gia xã hội): sich einsetzen für · beitragen zu, trägt bei, trug bei, hat beigetragen · sich auseinandersetzen mit · bestehen auf · abhängen von · sich beziehen auf · der Einfluss, ¨-e · die Kritik, -en
- **Lỗi người Việt:** giới từ theo tiếng Việt/Anh ("Einfluss zu"); quên Pronominaladverb khi thay thế (dazu, daran).

#### B2U05L4 · Thảo luận chính trị – phản biện lịch sự (Diskussion) · *Goethe B2 Sprechen Teil 2*
- **Key** `de:lesson:b2u05-diskussion` · file `04-diskussion.yaml` · level `b2` · skills `speaking, listening`
- **Can-do:** Tham gia thảo luận ~5 phút: đưa luận điểm, phản bác lịch sự, tìm điểm chung; nghe thảo luận radio.
- **Ngữ pháp mới:** `b2u05-g-diskussion-redemittel` (Da muss ich Ihnen widersprechen; Das mag sein, aber …; Ich gebe zu bedenken, dass …; Wäre es nicht sinnvoller, …?; Lassen Sie uns einen Kompromiss finden)
- **Từ mới** (trường: tranh luận): der Einwand, ¨-e · einwenden · die Debatte, -n · debattieren · abwägen · der Konsens (Sg.) · kontrovers · die Position, -en
- **Lỗi người Việt:** đồng ý cho xong để tránh va chạm (thi cần tương tác, phản biện có lý do).

#### B2U05L5 · Ôn tập: bài ý kiến về một vấn đề xã hội (Wiederholung)
- **Key** `de:lesson:b2u05-wiederholung` · file `05-wiederholung.yaml` · level `b2` · skills `writing, reading, speaking`
- **Can-do:** **Viết** bài diễn đàn ~150 từ (Goethe B2 Schreiben Teil 1) "Có nên hạ tuổi bầu cử xuống 16?"; đọc bình luận báo (Lesen Teil 2).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B2U06 · Di cư và hội nhập (Migration und Integration) · `de:unit:b2u06-migration` · thư mục `06-migration`

#### B2U06L1 · Giá mà tôi đã biết – Konjunktiv II quá khứ (Hätte ich das gewusst, …)
- **Key** `de:lesson:b2u06-haette-ich-gewusst` · file `01-haette-ich-gewusst.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Nói về quyết định quá khứ, tiếc nuối, giả định ngược quá khứ.
- **Ngữ pháp mới:** `b2u06-g-konjunktiv-ii-vergangenheit` (hätte/wäre + Partizip II) · `b2u06-g-irreale-vergangenheit` (Wenn ich das gewusst hätte, wäre ich früher gekommen; ước quá khứ: Wenn ich doch … hätte!)
- **Từ mới** (trường: di cư): die Migration (Sg.) · die Einwanderung (Sg.) · einwandern · der Migrant, -en · die Integration (Sg.) · sich integrieren · die Herkunft (Sg.) · das Herkunftsland, ¨-er
- **Lỗi người Việt:** "Wenn ich das wusste, würde ich …" (trộn thì); chọn sai hätte/wäre (theo Perfekt: gehen → wäre gegangen).

#### B2U06L2 · Như thể – Konjunktiv II của modal quá khứ, als ob (Ich hätte mich früher anmelden sollen. Als ob …)
- **Key** `de:lesson:b2u06-als-ob` · file `02-als-ob.yaml` · level `b2` · skills `grammar, vocabulary, speaking`
- **Can-do:** Phê bình/nuối tiếc lịch sự về thủ tục; so sánh không thật.
- **Ngữ pháp mới:** `b2u06-g-konj-ii-modal-vergangenheit` (hätte + nguyên thể + modal nguyên thể: Du hättest früher fragen sollen/können; câu phụ: …, dass du hättest fragen sollen – nhận biết) · `b2u06-g-als-ob` (als ob/als wenn + KII (động từ cuối); als + KII (động từ ngay sau als): Er tut, als wäre er hier zu Hause)
- **Từ mới** (trường: giấy tờ cư trú): die Aufenthaltserlaubnis, -se · das Visum, Visa · die Staatsangehörigkeit, -en · die Einbürgerung, -en · der Integrationskurs, -e · die Behörde, -n · beantragen · der Antrag, ¨-e
- **Lỗi người Việt:** "Du hättest früher fragen gesollt"; "als ob er ist reich".
- **Văn hoá/ngữ dụng:** Tên gọi cơ quan/loại giấy phép thay đổi theo luật – nội dung chỉ minh hoạ, ghi "kiểm tra quy định hiện hành".

#### B2U06L3 · Người đến sau – phân từ danh từ hoá, cách nói bao hàm giới (Geflüchtete, Studierende)
- **Key** `de:lesson:b2u06-gefluechtete` · file `03-gefluechtete.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc văn bản xã hội dùng ngôn ngữ trung lập về giới và nguồn gốc; hiểu sắc thái từ ngữ.
- **Ngữ pháp mới:** `b2u06-g-nominalisierte-partizipien` (Partizip I/II danh từ hoá biến cách như tính từ: der/die Geflüchtete, ein Geflüchteter, die Reisenden, der Angestellte, die Auszubildenden) · `b2u06-g-gendergerechte-sprache` (Doppelnennung (Bürgerinnen und Bürger), dạng trung tính (Studierende, Lehrkräfte), ký hiệu Gendersternchen/Doppelpunkt – nhận biết; đang tranh luận, một số cơ quan/bang hạn chế dùng ký hiệu; đề thi không bắt buộc)
- **Từ mới** (trường: tị nạn, đa dạng): der Flüchtling, -e · die Flucht (Sg.) · fliehen, floh, ist geflohen · das Asyl (Sg.) · die Diskriminierung, -en · die Vielfalt (Sg.) · die Toleranz (Sg.)
- **Lỗi người Việt:** "ein Geflüchtete"; coi "Flüchtling" và "Geflüchtete(r)" hoàn toàn trùng sắc thái.
- **Ghi chú:** "der/die Geflüchtete" là item `grammar_point` minh hoạ (thuộc `b2u06-g-nominalisierte-partizipien`), không tạo lemma riêng.

#### B2U06L4 · Mà không… – ohne dass, anstatt dass (Ohne dass jemand geholfen hat)
- **Key** `de:lesson:b2u06-ohne-dass` · file `04-ohne-dass.yaml` · level `b2` · skills `listening, speaking, grammar`
- **Can-do:** Nghe phỏng vấn người di cư; kể trải nghiệm hội nhập, ngôn ngữ, bản sắc.
- **Ngữ pháp mới:** `b2u06-g-ohne-anstatt-dass` (ohne dass / (an)statt dass khi hai chủ ngữ khác nhau; so với ohne/statt … zu (B1))
- **Từ mới** (trường: bản sắc, ngôn ngữ): die Sprachbarriere, -n · das Heimweh (Sg.) · die Identität, -en · zweisprachig · die Muttersprache, -n · die Zugehörigkeit (Sg.) · sich anpassen · die Anpassung (Sg.)
- **Lỗi người Việt:** "ohne dass zu fragen".

#### B2U06L5 · Ôn tập: e-mail trang trọng tới cơ quan, đọc phỏng vấn (Wiederholung)
- **Key** `de:lesson:b2u06-wiederholung` · file `05-wiederholung.yaml` · level `b2` · skills `writing, reading, listening`
- **Can-do:** **Viết** thư trang trọng ~100 từ hỏi về khoá hội nhập/công nhận bằng (Schreiben Teil 2); đọc phỏng vấn dài (Lesen Teil 4: ghép câu hỏi – đoạn).
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B2U07 · Môi trường và phát triển bền vững (Umwelt und Nachhaltigkeit) · `de:unit:b2u07-nachhaltigkeit` · thư mục `07-nachhaltigkeit`

#### B2U07L1 · Đã giảm được… – nguyên thể quá khứ và bị động (Er behauptet, die Emissionen reduziert zu haben.)
- **Key** `de:lesson:b2u07-infinitiv-perfekt` · file `01-infinitiv-perfekt.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc báo cáo môi trường, thuật lại cam kết và kết quả.
- **Ngữ pháp mới:** `b2u07-g-infinitiv-perfekt` (zu + Partizip II + haben/sein: …, das Ziel erreicht zu haben / rechtzeitig angekommen zu sein) · `b2u07-g-infinitiv-passiv` (Partizip II + zu werden / worden zu sein: Er hofft, eingeladen zu werden)
- **Từ mới** (trường: khí thải, khí hậu): der Treibhauseffekt (Sg.) · das Treibhausgas, -e · die Emission, -en · der Ausstoß (Sg.) · reduzieren · die Erderwärmung (Sg.) · das Abkommen, - · klimaneutral
- **Lỗi người Việt:** "zu haben reduziert".

#### B2U07L2 · Vì sợ, nhờ có – giới từ nguyên nhân (Aus Angst, vor Kälte, dank)
- **Key** `de:lesson:b2u07-aus-vor-dank` · file `02-aus-vor-dank.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Diễn đạt nguyên nhân chính xác khi nói về đa dạng sinh học.
- **Ngữ pháp mới:** `b2u07-g-kausale-praepositionen` (aus + danh từ không mạo từ (động cơ có ý thức: aus Angst, aus Liebe); vor + Dat (phản ứng không chủ ý: vor Kälte zittern, vor Freude weinen); dank + Gen/Dat (nguyên nhân tích cực); infolge (B2U02))
- **Từ mới** (trường: đa dạng sinh học): die Artenvielfalt (Sg.) · aussterben, stirbt aus, starb aus, ist ausgestorben · bedroht · der Lebensraum, ¨-e · schützen · das Ökosystem, -e · die Tierart, -en · die Abholzung (Sg.)
- **Lỗi người Việt:** "wegen Angst" (được nhưng khác sắc thái) / "aus Kälte" (sai).

#### B2U07L3 · Điều làm tôi ngạc nhiên là… – mệnh đề quan hệ nối tiếp (…, was mich überrascht hat.)
- **Key** `de:lesson:b2u07-weiterfuehrender-relativsatz` · file `03-weiterfuehrender-relativsatz.yaml` · level `b2` · skills `grammar, vocabulary, writing`
- **Can-do:** Bình luận cả một sự việc ngay trong câu; nói về tiêu dùng bền vững.
- **Ngữ pháp mới:** `b2u07-g-weiterfuehrender-relativsatz` (was / wo(r)+giới từ trỏ về **cả câu** trước: Viele kaufen Plastik, was die Umwelt belastet / wodurch …, worüber …)
- **Từ mới** (trường: tiêu dùng bền vững): der Verzicht (Sg.) · die Wegwerfgesellschaft (Sg.) · recyceln · wiederverwenden · der Kreislauf, ¨-e · die Ressource, -n · die Verschwendung (Sg.)
- **Lỗi người Việt:** "…, das die Umwelt belastet" (đúng là was khi trỏ cả câu).

#### B2U07L4 · Ủng hộ và phản đối – lập luận (Pro und Contra)
- **Key** `de:lesson:b2u07-pro-contra` · file `04-pro-contra.yaml` · level `b2` · skills `speaking, listening, writing`
- **Can-do:** Lập luận có cấu trúc (luận điểm – lý do – ví dụ – phản đề – kết luận) khi nói và viết.
- **Ngữ pháp mới:** `b2u07-g-argumentation-redemittel` (Für … spricht, dass …; Dagegen lässt sich einwenden, dass …; Ein weiteres Argument ist …; Wägt man die Argumente ab, …; Alles in allem …)
- **Từ mới** (trường: lập luận): das Gegenargument, -e · überzeugend · die Begründung, -en · begründen · die Schlussfolgerung, -en · abschließend · gewichten · der Aspekt, -e
- **Lỗi người Việt:** nêu ý kiến mà không lý do/ví dụ; kết luận mâu thuẫn với phần thân.

#### B2U07L5 · Ôn tập: bài lập luận ~150 từ (Wiederholung)
- **Key** `de:lesson:b2u07-wiederholung` · file `05-wiederholung.yaml` · level `b2` · skills `writing, reading, listening`
- **Can-do:** **Viết** bài nêu ý kiến ~150 từ "Có nên cấm xe chạy xăng trong nội đô?"; nghe bài giảng ngắn về môi trường (Hören Teil 4) và ghi ý.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B2U08 · Nghệ thuật, văn hoá và văn học (Kunst, Kultur und Literatur) · `de:unit:b2u08-kunst-kultur` · thư mục `08-kunst-kultur`

#### B2U08L1 · Ai đọc nhiều thì… – quan hệ với wer/was (Wer viel liest, (der) weiß viel.)
- **Key** `de:lesson:b2u08-wer-liest` · file `01-wer-liest.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc đoạn trích văn học/review sách; dùng câu khái quát kiểu tục ngữ.
- **Ngữ pháp mới:** `b2u08-g-relativ-wer-was` (wer/wen/wem … (der/den/dem) … – mệnh đề chung không có danh từ đi trước; Was …, (das) …; đại từ chỉ định bỏ được khi cùng cách)
- **Từ mới** (trường: văn học): die Literatur, -en · der Roman, -e · der Schriftsteller, - · das Gedicht, -e · der Leser, - · die Handlung, -en · die Figur, -en · der Erzähler, -
- **Lỗi người Việt:** "Wer viel liest, er weiß viel"; "Der viel liest …".

#### B2U08L2 · Thành ngữ và ngữ vực (Tomaten auf den Augen haben)
- **Key** `de:lesson:b2u08-redewendungen` · file `02-redewendungen.yaml` · level `b2` · skills `vocabulary, listening, speaking`
- **Can-do:** Hiểu thành ngữ phổ biến và từ khẩu ngữ; chọn ngữ vực phù hợp (bạn bè ↔ công việc).
- **Ngữ pháp mới:** `b2u08-g-register` (khẩu ngữ ↔ chuẩn ↔ trang trọng: kriegen/bekommen/erhalten, kapieren/verstehen/nachvollziehen, Kohle/Geld/finanzielle Mittel; không dùng khẩu ngữ trong bài viết thi)
- **Từ mới** (trường: thành ngữ – `phrase`): Tomaten auf den Augen haben · ins Fettnäpfchen treten · jemandem die Daumen drücken · Schwein haben · auf dem Holzweg sein · den Nagel auf den Kopf treffen · kriegen · kapieren
- **Lỗi người Việt:** dịch từng chữ; dùng thành ngữ sai ngữ cảnh trang trọng.

#### B2U08L3 · Bảo tàng – tính từ đi với một cách (Dem Original ähnlich, sich der Sache bewusst)
- **Key** `de:lesson:b2u08-kunst` · file `03-kunst.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Tả và bình về tác phẩm nghệ thuật, triển lãm.
- **Ngữ pháp mới:** `b2u08-g-adjektive-kasus` (tính từ + Dat: ähnlich, bekannt, dankbar, fremd, nützlich, peinlich, wichtig; + Gen (trang trọng): bewusst, sicher, würdig; + Akk chỉ mức: einen Meter hoch, einen Monat alt)
- **Từ mới** (trường: nghệ thuật thị giác): die Kunst, ¨-e · der Künstler, - · das Gemälde, - · die Skulptur, -en · die Epoche, -n · zeitgenössisch · abstrakt · die Ausstellung, -en
- **Lỗi người Việt:** "ähnlich wie dem Original"; "Ich bin mir das bewusst".

#### B2U08L4 · Phê bình phim, kịch (Eine Rezension)
- **Key** `de:lesson:b2u08-rezension` · file `04-rezension.yaml` · level `b2` · skills `listening, speaking, writing`
- **Can-do:** Nghe/đọc review; đánh giá một bộ phim/vở kịch có lý lẽ.
- **Ngữ pháp mới:** `b2u08-g-bewerten-redemittel` (Besonders gelungen ist …; Was mich (nicht) überzeugt hat, war …; Der Film lebt von …; Ich kann ihn nur empfehlen / eher abraten)
- **Từ mới** (trường: sân khấu, điện ảnh): die Rezension, -en · gelungen · die Inszenierung, -en · der Regisseur, -e · das Theaterstück, -e · die Aufführung, -en · enttäuschend
- **Lỗi người Việt:** chỉ kể nội dung, không đánh giá; khen chê chung chung ("sehr gut").

#### B2U08L5 · Ôn tập: viết review ~150 từ (Wiederholung)
- **Key** `de:lesson:b2u08-wiederholung` · file `05-wiederholung.yaml` · level `b2` · skills `writing, reading, speaking`
- **Can-do:** **Viết** review ~150 từ cho một bộ phim/cuốn sách; đọc văn bản văn hoá có từ khó (Lesen Teil 2) và suy nghĩa từ ngữ cảnh.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B2U09 · Luật pháp và cuộc sống chung (Recht und Zusammenleben) · `de:unit:b2u09-recht` · thư mục `09-recht`

#### B2U09L1 · Được công nhận – cụm động từ chức năng mang nghĩa bị động (Anerkennung finden, in Kraft treten)
- **Key** `de:lesson:b2u09-gericht` · file `01-gericht.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc bản tin pháp luật đơn giản; hiểu cụm cố định của văn bản hành chính.
- **Ngữ pháp mới:** `b2u09-g-funktionsverbgefuege-passiv` (cụm mang nghĩa bị động: Anerkennung finden (= anerkannt werden), zur Sprache kommen, in Kraft treten, zur Anwendung kommen, in Betracht kommen, unter Druck stehen)
- **Từ mới** (trường: toà án): das Gericht, -e · der Richter, - · der Anwalt, ¨-e · die Klage, -n · klagen · das Urteil, -e · verurteilen · die Strafe, -n
- **Lỗi người Việt:** dịch "được công nhận" thành "wird Anerkennung gefunden".

#### B2U09L2 · Nếu quý vị có câu hỏi – điều kiện không có wenn (Sollten Sie Fragen haben, …)
- **Key** `de:lesson:b2u09-konditional-ohne-wenn` · file `02-konditional-ohne-wenn.yaml` · level `b2` · skills `grammar, vocabulary, writing`
- **Can-do:** Hiểu điều khoản hợp đồng/bảo hiểm; viết câu điều kiện trang trọng.
- **Ngữ pháp mới:** `b2u09-g-konditional-verbspitze` (động từ đứng đầu thay wenn: Sollten Sie Fragen haben, …; Liegt kein Einverständnis vor, …; câu chính thường mở bằng so/dann)
- **Từ mới** (trường: hợp đồng, bảo hiểm): der Vertrag, ¨-e · der Widerruf, -e · widerrufen, widerrief, hat widerrufen · die Haftung (Sg.) · haften · die Versicherung, -en · der Schaden, ¨- · kostenpflichtig
- **Lỗi người Việt:** đọc nhầm câu điều kiện đảo thành câu hỏi.

#### B2U09L3 · Theo quy định – giới từ Dativ trang trọng, einander (Gemäß der Vorschrift; miteinander)
- **Key** `de:lesson:b2u09-vorschriften` · file `03-vorschriften.yaml` · level `b2` · skills `grammar, vocabulary, reading`
- **Can-do:** Đọc nội quy, quy định; nói về tôn trọng lẫn nhau.
- **Ngữ pháp mới:** `b2u09-g-dativ-praep-formal` (gemäß, entsprechend, gegenüber, entgegen + Dat; vị trí trước/sau danh từ: der Vorschrift gemäß, dem Bahnhof gegenüber) · `b2u09-g-einander` (đại từ tương hỗ: einander, miteinander, voneinander, aufeinander – thay sich trong nghĩa "lẫn nhau")
- **Từ mới** (trường: quy định): die Vorschrift, -en · die Regel, -n · die Verordnung, -en · zulässig · untersagen · der Verstoß, ¨-e · verstoßen gegen · das Bußgeld, -er
- **Lỗi người Việt:** "mit einander" (viết rời); "gemäß dem Vorschrift" (giống sai).

#### B2U09L4 · Khiếu nại trang trọng (Reklamation und Beschwerde)
- **Key** `de:lesson:b2u09-beschwerde` · file `04-beschwerde.yaml` · level `b2` · skills `listening, speaking, writing`
- **Can-do:** Khiếu nại qua điện thoại/thư, nêu yêu cầu và thời hạn; nghe cuộc gọi chăm sóc khách hàng.
- **Ngữ pháp mới:** `b2u09-g-beschwerde-redemittel` (Hiermit möchte ich mich über … beschweren; Ich fordere Sie auf, …; Ich gehe davon aus, dass …; Andernfalls sehe ich mich gezwungen, …)
- **Từ mới** (trường: quyền người tiêu dùng): die Reklamation, -en · reklamieren · die Erstattung, -en · erstatten · der Mangel, ¨- · die Entschädigung, -en · die Kulanz (Sg.) · fristgerecht
- **Lỗi người Việt:** quá gay gắt hoặc quá rụt rè; thiếu yêu cầu cụ thể + thời hạn.

#### B2U09L5 · Ôn tập: thư khiếu nại ~100 từ (Wiederholung)
- **Key** `de:lesson:b2u09-wiederholung` · file `05-wiederholung.yaml` · level `b2` · skills `writing, reading, listening`
- **Can-do:** **Viết** thư khiếu nại trang trọng ~100 từ (Schreiben Teil 2); đọc điều khoản/quy định (Lesen Teil 5: hướng dẫn, quy chế) và chọn ý đúng.
- **Ngữ pháp mới:** — · **Từ mới:** —

---

#### Unit B2U10 · Ôn B2 và thi Goethe-Zertifikat B2 (Prüfungstraining B2) · `de:unit:b2u10-pruefung-b2` · thư mục `10-pruefung-b2`

#### B2U10L1 · Đọc hiểu: loại văn bản và ý định tác giả · *Lesen*
- **Key** `de:lesson:b2u10-lesen` · file `01-lesen.yaml` · level `b2` · skills `reading, vocabulary`
- **Can-do:** Làm 5 dạng Lesen B2 (quan điểm nhiều người; bài báo chọn đáp án; điền câu vào văn bản; ghép ý kiến/bình luận; quy chế/hướng dẫn); nhận diện loại văn bản và ý định tác giả.
- **Ngữ pháp mới:** `b2u10-g-textsorten-signale` (dấu hiệu loại văn bản: Kommentar (đánh giá, KII, tiểu từ), Bericht (Präteritum, KI), Reportage (hiện tại, miêu tả); dấu hiệu ý định: kritisieren, befürworten, ironisch darstellen)
- **Từ mới** (trường: loại văn bản): der Leitartikel, - · die Reportage, -n · sachlich · die Absicht, -en · der Verfasser, - · die Kernaussage, -n · implizit · explizit

#### B2U10L2 · Nghe hiểu: bài nói dài, thảo luận · *Hören*
- **Key** `de:lesson:b2u10-hoeren` · file `02-hoeren.yaml` · level `b2` · skills `listening, vocabulary`
- **Can-do:** Làm 4 dạng Hören B2 (đoạn ngắn đa chủ đề; phỏng vấn; thảo luận nhiều người – ai nói gì; bài giảng/thuyết trình) với kỹ thuật nghe từ tín hiệu.
- **Ngữ pháp mới:** `b2u10-g-signalwoerter-hoeren` (tín hiệu cấu trúc lời nói: Ich möchte vorausschicken …, Entscheidend ist …, Was ich damit sagen will …, Im Gegensatz dazu …, Zusammenfassend …)
- **Từ mới** (trường: chương trình thảo luận): die Gesprächsrunde, -n · die Podiumsdiskussion, -en · der Beitrag, ¨-e · die Einschätzung, -en · einschätzen · skeptisch

#### B2U10L3 · Viết: bài diễn đàn và thư trang trọng B2 · *Schreiben*
- **Key** `de:lesson:b2u10-schreiben` · file `03-schreiben.yaml` · level `b2` · skills `writing, reading`
- **Can-do:** Viết Teil 1 (bài diễn đàn ~150 từ: ý kiến – lý do – ví dụ – ưu nhược – đề xuất) và Teil 2 (thư trang trọng ~100 từ) đúng ngữ vực; tự kiểm theo tiêu chí.
- **Ngữ pháp mới:** `b2u10-g-textaufbau` (bố cục và nối đoạn: Einleitung – Hauptteil – Schluss; câu chủ đề; tránh lặp từ bằng từ đồng nghĩa và đại từ quy chiếu; đánh giá theo tiêu chí Erfüllung/Kohärenz/Wortschatz/Strukturen)
- **Từ mới** (trường: viết lập luận): die Zusammenfassung, -en · das Forum, Foren · erörtern · die Erörterung, -en · darlegen

#### B2U10L4 · Nói: thuyết trình và thảo luận B2 · *Sprechen*
- **Key** `de:lesson:b2u10-sprechen` · file `04-sprechen.yaml` · level `b2` · skills `speaking, listening`
- **Can-do:** Làm Sprechen B2 Teil 1 (thuyết trình ~4 phút, chọn 1 trong 2 chủ đề, phản hồi + câu hỏi cho bạn thi) và Teil 2 (thảo luận ~5 phút); quản lý thời gian và lượt lời.
- **Ngữ pháp mới:** `b2u10-g-moderation-redemittel` (điều phối lượt lời: Darf ich direkt daran anknüpfen?; Was meinen Sie dazu?; Um noch einmal auf … zurückzukommen …; Ich fasse kurz zusammen …)
- **Từ mới** (trường: điều phối): die Moderation (Sg.) · moderieren · die Redezeit (Sg.) · das Stichwort, ¨-er · die Notiz, -en · spontan · die Rückmeldung, -en

#### B2U10L5 · Đề mô phỏng Goethe-Zertifikat B2 (Modelltest B2)
- **Key** `de:lesson:b2u10-modelltest-b2` · file `05-modelltest-b2.yaml` · level `b2` · skills `reading, listening, writing, speaking`
- **Can-do:** Làm đủ một lượt dạng bài 4 module B2 (Lesen 5 Teile, Hören 4 Teile, Schreiben 2 Teile, Sprechen 2 Teile) trong khuôn khổ bài tập của ứng dụng.
- **Ngữ pháp mới:** — · **Từ mới:** — (reuse A1–B2)

## 3. Ma trận trình tự ngữ pháp

Mỗi dòng là **một** item `grammar_point` (key đầy đủ: `de:item:<mã>`). Cột:
- **Loại**: `G` ngữ pháp, `A` phát âm/chính tả (P0), `R` Redemittel/kỹ năng văn bản – hội thoại (dạy như cấu trúc cố định, có bài tập như ngữ pháp).
- **Giới thiệu**: bài duy nhất được `introduce` item này.
- **Cần trước**: số thứ tự (#) các item phải được dạy trước. Đã kiểm tra bằng script: mọi item tiền quyết nằm ở bài **trước** (hoặc cùng bài nhưng đứng trước trong danh sách "Ngữ pháp mới" của bài đó).
- **Ôn lại ở**: các bài phải `reuse` item này (luôn gồm bài 5 của unit; thêm 1–3 bài sau để ôn xoắn ốc). Agent viết các bài đó phải dùng item trong ít nhất một ví dụ hoặc bài tập.

| # | Mã item | Loại | Nội dung | Giới thiệu | Cần trước | Ôn lại ở |
|---|---|---|---|---|---|---|
| 1 | `p0u1-g-alphabet` | A | Bảng chữ cái, tên chữ (ä ö ü ß) | P0U1L1 | — | P0U1L5, P0U2L2, A1U01L5 |
| 2 | `p0u1-g-buchstabieren` | A | Đánh vần (Wie schreibt man das?) | P0U1L1 | #1 | P0U1L5, P0U3L2, A1U01L4 |
| 3 | `p0u1-g-vokallaenge` | A | Nguyên âm dài/ngắn và chữ viết | P0U1L2 | — | P0U1L5, P0U3L5, A1U01L3 |
| 4 | `p0u1-g-umlaute` | A | ä ö ü (phát âm, gõ ae/oe/ue) | P0U1L3 | #3 | P0U1L5, P0U2L5, A1U02L2 |
| 5 | `p0u1-g-diphthonge` | A | ei/ai, eu/äu, au; ei ≠ ie | P0U1L4 | — | P0U1L5, P0U2L4, A1U01L5 |
| 6 | `p0u1-g-schwa-er` | A | -e và -er cuối từ | P0U1L4 | — | P0U1L5, P0U3L5, A1U02L1 |
| 7 | `p0u2-g-w-v-f-z` | A | w, v, f/ph, z/tz | P0U2L1 | — | P0U2L5, P0U3L5, A1U01L2 |
| 8 | `p0u2-g-ch-laute` | A | ich-Laut / ach-Laut, chs | P0U2L2 | — | P0U2L5, P0U3L5, A1U03L1 |
| 9 | `p0u2-g-ig-endung` | A | -ig cuối từ | P0U2L2 | #8 | P0U2L5, A1U01L4 |
| 10 | `p0u2-g-s-laute` | A | s hữu thanh, sch, sp/st, ss/ß | P0U2L3 | — | P0U2L5, P0U3L5, A1U04L1 |
| 11 | `p0u2-g-r-laut` | A | r lưỡi gà, r nguyên âm hoá | P0U2L4 | — | P0U2L5, P0U3L5, A1U02L1 |
| 12 | `p0u2-g-auslautverhaertung` | A | Phụ âm cuối hoá vô thanh (Tag, und) | P0U2L4 | — | P0U2L5, P0U3L5, A1U04L4 |
| 13 | `p0u3-g-genus-artikel` | G | Ba giống, mạo từ xác định Nom; ký hiệu số nhiều | P0U3L1 | — | P0U3L4, P0U3L5, A1U02L2, A1U03L2 |
| 14 | `p0u3-g-nomen-gross` | A | Danh từ viết hoa | P0U3L1 | — | P0U3L5, A1U01L5 |
| 15 | `p0u3-g-satzmelodie` | A | Ngữ điệu câu kể/câu hỏi | P0U3L2 | — | P0U3L5, A1U01L3 |
| 16 | `p0u3-g-wortakzent` | A | Trọng âm từ (gốc Đức, ngoại lai) | P0U3L3 | — | P0U3L5, A1U04L2, A2U01L1 |
| 17 | `p0u3-g-komposita` | G | Từ ghép: giống theo từ cuối | P0U3L3 | #13 | P0U3L5, A1U05L1, B1U06L3 |
| 18 | `p0u3-g-das-ist` | G | Das ist … / Ist das …? | P0U3L4 | #13 | P0U3L5, A1U01L1 |
| 19 | `p0u3-g-anrede` | G | Herr/Frau + họ | P0U3L4 | — | P0U3L5, A1U01L1, A1U08L4 |
| 20 | `a1u01-g-personalpronomen` | G | Đại từ nhân xưng Nominativ | A1U01L1 | — | A1U01L5, A1U02L1, A1U05L2 |
| 21 | `a1u01-g-sein` | G | sein ở hiện tại | A1U01L1 | #20 | A1U01L5, A1U02L1, A1U06L4 |
| 22 | `a1u01-g-du-sie` | G | du / Sie / ihr – ngữ vực | A1U01L1 | #20 | A1U01L5, A1U05L4, A1U08L4, B1U08L2 |
| 23 | `a1u01-g-praesens` | G | Chia động từ hiện tại (đuôi, -e-, -ß) | A1U01L2 | #20 | A1U01L5, A1U02L4, A1U03L1 |
| 24 | `a1u01-g-laender-artikel` | G | Tên nước có mạo từ (die Schweiz) | A1U01L2 | #13 | A1U01L5, A1U07L1, A2U05L4 |
| 25 | `a1u01-g-w-fragen` | G | Câu hỏi W- (V2) | A1U01L3 | #23 | A1U01L5, A1U02L4, A2U06L1 |
| 26 | `a1u01-g-ja-nein-frage` | G | Câu hỏi có/không (V1) | A1U01L3 | #23 | A1U01L5, A1U02L3, A2U06L1 |
| 27 | `a1u01-g-v2` | G | Động từ vị trí 2 (đảo khi có trạng ngữ đầu câu) | A1U01L3 | #23 | A1U01L5, A1U04L2, A2U01L2, A2U03L2 |
| 28 | `a1u01-g-zahlen-bis-100` | G | Số 21–100 (đơn vị trước chục) | A1U01L4 | — | A1U01L5, A1U03L4, A1U04L1 |
| 29 | `a1u01-g-alter` | G | Nói tuổi (Ich bin … Jahre alt) | A1U01L4 | #21, #28 | A1U01L5, A1U02L5 |
| 30 | `a1u02-g-possessiv-singular` | G | mein, dein, sein, ihr, Ihr (Nom) | A1U02L1 | #20, #13 | A1U02L5, A1U03L2, A1U05L1 |
| 31 | `a1u02-g-adjektiv-praedikativ` | G | Tính từ sau sein không đuôi | A1U02L1 | #21 | A1U02L5, A1U05L1, A2U02L3 |
| 32 | `a1u02-g-haben` | G | haben ở hiện tại | A1U02L2 | #23 | A1U02L5, A1U03L2, A1U06L3 |
| 33 | `a1u02-g-plural` | G | Các kiểu số nhiều | A1U02L2 | #13 | A1U02L5, A1U03L4, A1U05L5 |
| 34 | `a1u02-g-unbestimmter-artikel` | G | ein/eine (Nom) | A1U02L3 | #13 | A1U02L5, A1U03L2, A1U05L1 |
| 35 | `a1u02-g-negation-nicht-kein` | G | nicht và kein | A1U02L3 | #34 | A1U02L5, A1U03L5, A1U04L3, B1U05L4 |
| 36 | `a1u02-g-doch` | G | doch trả lời câu hỏi phủ định | A1U02L3 | #35, #26 | A1U02L5, A1U06L2, B1U08L2 |
| 37 | `a1u02-g-beruf-ohne-artikel` | G | Nghề không mạo từ | A1U02L4 | #21 | A1U02L5, A2U03L4 |
| 38 | `a1u02-g-feminin-in` | G | Danh từ chỉ người giống cái -in | A1U02L4 | #13 | A1U02L5, A2U03L4, B2U06L3 |
| 39 | `a1u03-g-vokalwechsel` | G | Đổi nguyên âm e→i/ie, a→ä | A1U03L1 | #23 | A1U03L5, A1U04L2, A1U05L4, A1U06L4 |
| 40 | `a1u03-g-gern` | G | gern / nicht gern | A1U03L1 | #27 | A1U03L5, A1U06L1 |
| 41 | `a1u03-g-akkusativ` | G | Akkusativ của mạo từ (den/einen/keinen/meinen) | A1U03L2 | #34, #35, #30, #32 | A1U03L5, A1U05L1, A1U05L2, A1U08L3, A2U02L2 |
| 42 | `a1u03-g-moechten` | G | möchten | A1U03L3 | #41 | A1U03L5, A1U04L3, A1U05L5 |
| 43 | `a1u03-g-moegen` | G | mögen (mag) | A1U03L3 | #41 | A1U03L5, A1U06L1, A2U01L2 |
| 44 | `a1u03-g-und-aber-oder` | G | und, aber, oder (vị trí 0) | A1U03L3 | #27 | A1U03L5, A1U06L2, A2U03L1 |
| 45 | `a1u03-g-zahlen-gross` | G | Số lớn, giá tiền, dấu thập phân | A1U03L4 | #28 | A1U03L5, A1U07L2, A2U01L4 |
| 46 | `a1u03-g-mengen` | G | Wie viel/Wie viele, ein Kilo Tomaten | A1U03L4 | #33 | A1U03L5, A2U07L2 |
| 47 | `a1u04-g-uhrzeit` | G | Giờ chính thức/thân mật (halb drei) | A1U04L1 | #28 | A1U04L5, A1U07L2, A2U08L3 |
| 48 | `a1u04-g-um-von-bis` | G | um, von … bis (giờ) | A1U04L1 | #47 | A1U04L4, A1U04L5, A1U08L3 |
| 49 | `a1u04-g-trennbare-verben` | G | Động từ tách | A1U04L2 | #27 | A1U04L5, A1U06L3, A1U07L2, A2U06L2 |
| 50 | `a1u04-g-satzklammer` | G | Khung câu | A1U04L2 | #49 | A1U04L3, A1U04L5, A1U06L3, A2U03L1 |
| 51 | `a1u04-g-modalverben` | G | können, müssen, wollen | A1U04L3 | #23 | A1U04L5, A1U05L4, A1U06L2, A2U01L2 |
| 52 | `a1u04-g-modal-satzklammer` | G | Modal + nguyên thể cuối câu | A1U04L3 | #51, #50 | A1U04L5, A1U06L2, A1U08L1, A2U03L1 |
| 53 | `a1u04-g-am-im-um` | G | am/im/um (thời gian) | A1U04L4 | #47 | A1U04L5, A1U06L2, A2U01L3 |
| 54 | `a1u04-g-ordinalzahlen` | G | Số thứ tự, ngày tháng | A1U04L4 | #28 | A1U04L5, A1U08L2, A2U01L4 |
| 55 | `a1u05-g-es-gibt` | G | es gibt + Akk | A1U05L1 | #41 | A1U05L3, A1U05L5, A2U02L4 |
| 56 | `a1u05-g-possessiv-plural` | G | unser, euer (eure) | A1U05L1 | #30 | A1U05L5, A1U06L5, A2U02L1 |
| 57 | `a1u05-g-personalpronomen-akk` | G | Đại từ Akkusativ | A1U05L2 | #41 | A1U05L5, A1U07L3, A2U02L2 |
| 58 | `a1u05-g-pronomen-genus` | G | Đại từ theo giống ngữ pháp (der Tisch → er) | A1U05L2 | #57 | A1U05L5, A1U07L3, A2U02L2 |
| 59 | `a1u05-g-dativ-artikel` | G | Dativ của mạo từ (dem/der/den+n; im, am) | A1U05L3 | #41 | A1U05L5, A1U07L1, A2U02L1 |
| 60 | `a1u05-g-wo-praep-dativ` | G | Wo? + giới từ nơi chốn + Dativ | A1U05L3 | #59 | A1U05L4, A1U05L5, A2U02L1 |
| 61 | `a1u05-g-imperativ` | G | Câu mệnh lệnh (Sie, du, ihr) | A1U05L4 | #39, #49 | A1U05L5, A1U08L1, A2U04L4 |
| 62 | `a1u05-g-hoefliche-bitte` | G | Nhờ lịch sự: bitte, Können Sie …? | A1U05L4 | #51 | A1U05L5, A1U07L2, A2U04L3 |
| 63 | `a1u06-g-gern-lieber-am-liebsten` | G | gern – lieber – am liebsten | A1U06L1 | #40 | A1U06L5, A1U07L4, A2U05L3 |
| 64 | `a1u06-g-duerfen` | G | dürfen | A1U06L2 | #51 | A1U06L5, A1U08L3, A2U06L4 |
| 65 | `a1u06-g-man` | G | man + động từ ngôi 3 | A1U06L2 | #23 | A1U06L5, A1U08L3, A2U08L2 |
| 66 | `a1u06-g-perfekt-haben` | G | Perfekt với haben | A1U06L3 | #32, #50 | A1U06L4, A1U06L5, A2U01L1 |
| 67 | `a1u06-g-partizip-ii` | G | Partizip II (ge-t, ge-en, tách) | A1U06L3 | #49 | A1U06L4, A1U06L5, A2U01L1 |
| 68 | `a1u06-g-perfekt-sein` | G | Perfekt với sein | A1U06L4 | #66 | A1U06L5, A2U01L1, A2U05L5 |
| 69 | `a1u06-g-praeteritum-sein-haben` | G | war / hatte | A1U06L4 | #21, #32 | A1U06L5, A1U08L2, A2U01L2 |
| 70 | `a1u07-g-dativ-praepositionen` | G | aus, bei, mit, nach, von, zu + Dativ | A1U07L1 | #59 | A1U07L5, A1U08L2, A2U01L3, A2U05L4 |
| 71 | `a1u07-g-nach-zu-hause` | G | nach/zu; nach Hause/zu Hause | A1U07L1 | #70 | A1U07L5, A2U05L4 |
| 72 | `a1u07-g-welcher` | G | welcher/welche/welches | A1U07L2 | #41 | A1U07L4, A1U07L5, A2U07L1 |
| 73 | `a1u07-g-personalpronomen-dativ` | G | Đại từ Dativ (mir, dir …) | A1U07L3 | #59, #57 | A1U07L5, A1U08L1, A2U02L2, A2U03L3 |
| 74 | `a1u07-g-gefallen-passen-stehen` | G | gefallen/passen/stehen + Dativ | A1U07L3 | #73 | A1U07L4, A1U07L5, A2U03L3 |
| 75 | `a1u07-g-komparativ` | G | So sánh hơn, so … wie | A1U07L4 | #31 | A1U07L5, A2U05L3, B1U04L3 |
| 76 | `a1u08-g-sollen` | G | sollen | A1U08L1 | #51 | A1U08L5, A2U04L3, B2U04L3 |
| 77 | `a1u08-g-wehtun` | G | Mir tut … weh | A1U08L1 | #73 | A1U08L2, A1U08L5, A2U04L1 |
| 78 | `a1u08-g-wie-oft-mal` | G | einmal/zweimal am Tag; täglich | A1U08L2 | #53 | A1U08L5, A2U04L4 |
| 79 | `a1u08-g-akk-praepositionen` | G | für, ohne, durch, gegen, um + Akk | A1U08L3 | #41 | A1U08L5, A2U02L1, A2U08L3 |
| 80 | `a1u08-g-anrede-gruss` | R | Chào đầu/cuối thư thân mật–trang trọng | A1U08L4 | #22, #19 | A1U08L5, A2U02L5, A2U06L5, B1U10L3 |
| 81 | `a2u01-g-partizip-praefix-ieren` | G | Partizip II không ge- (be-, ver-, -ieren) | A2U01L1 | #67 | A2U01L4, A2U01L5, A2U05L1 |
| 82 | `a2u01-g-praeteritum-modal` | G | Präteritum của modal | A2U01L2 | #51, #69 | A2U01L5, A2U04L3, B1U01L4 |
| 83 | `a2u01-g-erzaehl-adverbien` | G | zuerst, dann, danach … + đảo | A2U01L2 | #27 | A2U01L5, A2U05L5, B1U01L4 |
| 84 | `a2u01-g-vor-nach-dativ` | G | vor/nach + Dativ (vor zwei Jahren) | A2U01L3 | #70 | A2U01L4, A2U01L5, A2U08L3 |
| 85 | `a2u01-g-zeitangaben-akk` | G | letzte Woche, jeden Tag (Akk) | A2U01L3 | #41 | A2U01L5, A2U08L1, B1U07L4 |
| 86 | `a2u01-g-seit-praesens` | G | seit + Dativ + thì hiện tại | A2U01L4 | #70 | A2U01L5, A2U08L3, B1U01L3 |
| 87 | `a2u01-g-jahreszahlen` | G | Đọc năm; không "in 2010" | A2U01L4 | #45 | A2U01L5, B1U01L1 |
| 88 | `a2u02-g-wechselpraepositionen` | G | Giới từ hai cách (Wo?/Wohin?) | A2U02L1 | #60, #79 | A2U02L5, A2U05L4, B1U08L1 |
| 89 | `a2u02-g-positionsverben` | G | stellen/stehen, legen/liegen, setzen/sitzen, hängen | A2U02L1 | #88 | A2U02L5, A2U04L1, B1U07L3 |
| 90 | `a2u02-g-dat-akk-verben` | G | Động từ + Dat (người) + Akk (vật) | A2U02L2 | #73 | A2U02L5, A2U03L3, A2U07L1 |
| 91 | `a2u02-g-objekt-stellung` | G | Thứ tự Dat/Akk (danh từ/đại từ) | A2U02L2 | #90 | A2U02L5, A2U07L4, B1U08L3 |
| 92 | `a2u02-g-adj-unbestimmt-nom-akk` | G | Bảng tính từ 1: sau ein/kein/mein (Nom, Akk) | A2U02L3 | #41, #31 | A2U02L5, A2U03L4, A2U07L2 |
| 93 | `a2u02-g-adj-unbestimmt-dativ` | G | Bảng 1: Dativ (einem netten …) | A2U02L4 | #92, #59 | A2U02L5, A2U05L4, B1U05L2 |
| 94 | `a2u03-g-nebensatz-verbletzt` | G | Câu phụ: động từ cuối | A2U03L1 | #50, #52, #66 | A2U03L5, A2U04L4, A2U06L1, B1U02L1 |
| 95 | `a2u03-g-weil` | G | weil | A2U03L1 | #94 | A2U03L5, A2U04L5, B1U06L2 |
| 96 | `a2u03-g-denn` | G | denn (vị trí 0) | A2U03L1 | #44 | A2U03L5, A2U04L5, B1U06L2 |
| 97 | `a2u03-g-dass` | G | dass | A2U03L2 | #94 | A2U03L5, A2U06L2, B1U09L1 |
| 98 | `a2u03-g-nebensatz-vorne` | G | Câu phụ đứng đầu → động từ ngay sau | A2U03L2 | #95, #27 | A2U03L5, A2U04L4, A2U05L2, B1U01L2 |
| 99 | `a2u03-g-dativ-verben` | G | Động từ + Dativ (helfen, gehören …) | A2U03L3 | #73 | A2U03L5, A2U04L3, B1U02L1 |
| 100 | `a2u03-g-werden-vollverb` | G | werden = trở thành | A2U03L4 | #39 | A2U03L5, A2U08L1, B1U03L1, B1U06L1 |
| 101 | `a2u04-g-reflexiv-akk` | G | Động từ phản thân (Akk) | A2U04L1 | #57 | A2U04L5, A2U05L4, A2U08L1, B1U02L3 |
| 102 | `a2u04-g-reflexiv-dativ` | G | Phản thân Dativ (mir die Hände) | A2U04L2 | #101, #73 | A2U04L5, B1U08L2 |
| 103 | `a2u04-g-sollte-koennte` | G | sollte/könnte – lời khuyên | A2U04L3 | #76, #82 | A2U04L5, A2U08L4, B1U04L2 |
| 104 | `a2u04-g-wuerde-hoeflich` | G | Würden/Könnten Sie …? An deiner Stelle würde ich … | A2U04L3 | #62 | A2U04L5, A2U05L4, B1U04L1 |
| 105 | `a2u04-g-wenn-konditional` | G | wenn = nếu (điều kiện thật) | A2U04L4 | #94 | A2U04L5, A2U05L2, B1U04L2, B1U05L1 |
| 106 | `a2u05-g-praeteritum-regelmaessig` | G | Präteritum động từ yếu | A2U05L1 | #82 | A2U05L5, B1U01L1 |
| 107 | `a2u05-g-praeteritum-haeufig` | G | 15 động từ mạnh Präteritum (nhận biết) | A2U05L1 | #106 | A2U05L5, A2U07L5, B1U01L1 |
| 108 | `a2u05-g-als-temporal` | G | als (một lần trong quá khứ) | A2U05L2 | #94, #69 | A2U05L5, B1U01L1 |
| 109 | `a2u05-g-wenn-temporal` | G | wenn (mỗi khi / khi tương lai) | A2U05L2 | #105 | A2U05L5, A2U07L1, B1U07L2 |
| 110 | `a2u05-g-adj-bestimmt` | G | Bảng tính từ 2: sau der/die/das | A2U05L3 | #93 | A2U05L5, A2U07L1, B1U05L2 |
| 111 | `a2u05-g-superlativ` | G | So sánh nhất (am -sten, der -ste) | A2U05L3 | #75, #110 | A2U05L5, A2U07L2, B1U05L2 |
| 112 | `a2u05-g-reise-praepositionen` | G | ans Meer/am Meer, in die Berge … | A2U05L4 | #88, #71 | A2U05L5, B1U08L4 |
| 113 | `a2u06-g-indirekte-w-frage` | G | Câu hỏi gián tiếp W- | A2U06L1 | #94, #25 | A2U06L5, A2U08L4, B1U10L4 |
| 114 | `a2u06-g-ob` | G | ob | A2U06L1 | #94, #26 | A2U06L5, B2U04L2 |
| 115 | `a2u06-g-zu-infinitiv` | G | zu + nguyên thể | A2U06L2 | #49 | A2U06L3, A2U06L5, A2U07L3, B1U09L1 |
| 116 | `a2u06-g-um-zu` | G | um … zu (mục đích) | A2U06L3 | #115 | A2U06L5, A2U08L2, B1U03L3 |
| 117 | `a2u06-g-deshalb` | G | deshalb/deswegen/darum | A2U06L3 | #27 | A2U06L5, A2U07L2, B1U06L2 |
| 118 | `a2u06-g-lassen` | G | lassen + nguyên thể | A2U06L4 | #52 | A2U06L5, A2U08L4, B2U02L1 |
| 119 | `a2u06-g-muss-nicht-darf-nicht` | G | nicht müssen ≠ nicht dürfen | A2U06L4 | #64, #51 | A2U06L5, A2U08L2, B1U09L2 |
| 120 | `a2u07-g-dieser-jeder` | G | dieser, jeder, welcher, alle | A2U07L1 | #110, #72 | A2U07L2, A2U07L5, B1U05L2 |
| 121 | `a2u07-g-sondern` | G | nicht …, sondern … | A2U07L1 | #35 | A2U07L5, A2U08L1, B1U04L3 |
| 122 | `a2u07-g-adj-nullartikel` | G | Bảng tính từ 3: không mạo từ | A2U07L2 | #110 | A2U07L5, A2U08L2, B1U05L2 |
| 123 | `a2u07-g-was-fuer-ein` | G | Was für ein …? | A2U07L3 | #92 | A2U07L5, A2U08L1, B1U07L1 |
| 124 | `a2u07-g-es-geht-um` | G | Es geht um + Akk | A2U07L3 | #79 | A2U07L5, A2U08L2, B1U07L4, B2U10L1 |
| 125 | `a2u07-g-genitiv-namen` | G | Annas …; von + Dativ | A2U07L4 | #70 | A2U07L5, A2U08L1, B1U03L1 |
| 126 | `a2u07-g-indefinitpronomen-einer` | G | einer/keiner/meiner (đại từ) | A2U07L4 | #41, #59 | A2U07L5, A2U08L4, B1U03L4 |
| 127 | `a2u08-g-verben-praeposition` | G | Động từ + giới từ (A2: warten auf …) | A2U08L1 | #101, #88 | A2U08L5, B1U01L1, B1U02L3 |
| 128 | `a2u08-g-praesens-zukunft` | G | Hiện tại + mốc thời gian = tương lai | A2U08L1 | #85 | A2U08L5, B1U06L1 |
| 129 | `a2u08-g-infinitiv-aufforderung` | G | Nguyên thể làm mệnh lệnh (biển báo) | A2U08L2 | #61 | A2U08L5, B1U07L3, B2U09L3 |
| 130 | `a2u08-g-zeit-praepositionen` | G | ab, bis, in (+Dat), für (+Akk), über, zwischen | A2U08L3 | #84, #79 | A2U08L5, B1U07L4 |
| 131 | `a2u08-g-vorschlag-wir` | R | Gehen wir! Lass uns …! Wollen wir …? | A2U08L4 | #61, #118 | A2U08L5, B1U08L4 |
| 132 | `b1u01-g-praeteritum-system` | G | Präteritum mọi nhóm động từ | B1U01L1 | #107 | B1U01L5, B1U03L2, B1U07L4, B2U04L1 |
| 133 | `b1u01-g-praeteritum-perfekt-gebrauch` | G | Khi nào Präteritum / Perfekt | B1U01L1 | #132, #81 | B1U01L5, B1U07L4, B2U10L1 |
| 134 | `b1u01-g-plusquamperfekt` | G | Plusquamperfekt | B1U01L2 | #68, #69 | B1U01L3, B1U01L5, B2U06L1 |
| 135 | `b1u01-g-nachdem` | G | nachdem (+ thì lùi) | B1U01L2 | #134, #94 | B1U01L5, B1U03L2, B2U01L1 |
| 136 | `b1u01-g-bevor` | G | bevor | B1U01L3 | #94 | B1U01L5, B1U07L3, B2U01L1 |
| 137 | `b1u01-g-seitdem` | G | seit/seitdem + câu phụ | B1U01L3 | #86, #94 | B1U01L5, B1U02L4, B1U09L1 |
| 138 | `b1u01-g-bis` | G | bis (liên từ) | B1U01L3 | #94 | B1U01L5, B1U03L4, B1U07L2 |
| 139 | `b1u01-g-modal-perfekt` | G | Perfekt của modal (Ersatzinfinitiv) | B1U01L4 | #66, #82 | B1U01L5, B1U03L4, B2U06L2 |
| 140 | `b1u02-g-relativsatz-nom-akk` | G | Mệnh đề quan hệ Nom/Akk | B1U02L1 | #94, #41 | B1U02L5, B1U03L1, B1U04L4, B1U07L1 |
| 141 | `b1u02-g-relativpronomen-wahl` | G | Chọn giống/cách của đại từ quan hệ | B1U02L1 | #140 | B1U02L2, B1U02L5, B2U03L3 |
| 142 | `b1u02-g-relativsatz-dativ` | G | Quan hệ Dativ (dem, der, denen) | B1U02L2 | #140, #99 | B1U02L5, B1U04L4, B2U02L2 |
| 143 | `b1u02-g-relativsatz-praeposition` | G | Quan hệ có giới từ (mit dem …) | B1U02L2 | #142, #88 | B1U02L5, B1U04L4, B2U07L3 |
| 144 | `b1u02-g-pronominaladverbien` | G | darauf/worauf (vật) vs auf ihn/auf wen (người) | B1U02L3 | #127 | B1U02L5, B1U06L4, B1U10L1, B2U05L3 |
| 145 | `b1u02-g-verben-praeposition-b1` | G | Động từ + giới từ (B1) | B1U02L3 | #127 | B1U02L5, B1U06L4, B1U09L1, B2U05L3 |
| 146 | `b1u02-g-obwohl-trotzdem` | G | obwohl / trotzdem | B1U02L4 | #94, #117 | B1U02L5, B1U05L4, B1U06L2, B2U01L2 |
| 147 | `b1u02-g-adjektive-praeposition` | G | Tính từ + giới từ (stolz auf …) | B1U02L4 | #127 | B1U02L5, B1U03L4, B2U05L3 |
| 148 | `b1u03-g-passiv-praesens` | G | Bị động hiện tại (werden + P II) | B1U03L1 | #100, #81 | B1U03L5, B1U05L1, B1U07L3, B2U02L1 |
| 149 | `b1u03-g-genitiv` | G | Genitiv (des/der, -s/-es) | B1U03L1 | #125, #59 | B1U03L5, B1U05L2, B1U06L2, B2U01L1 |
| 150 | `b1u03-g-passiv-praeteritum` | G | Bị động Präteritum (wurde) | B1U03L2 | #148, #132 | B1U03L5, B1U07L4, B2U03L1 |
| 151 | `b1u03-g-passiv-perfekt` | G | Bị động Perfekt (ist … worden) | B1U03L2 | #148, #68 | B1U03L5, B1U07L4, B2U03L1 |
| 152 | `b1u03-g-damit` | G | damit vs um … zu | B1U03L3 | #116, #94 | B1U03L5, B1U05L1, B2U01L1 |
| 153 | `b1u03-g-n-deklination` | G | n-Deklination | B1U03L3 | #149 | B1U03L5, B1U05L2, B2U04L3, B2U06L1 |
| 154 | `b1u03-g-indefinitpronomen` | G | jemand, niemand, etwas, nichts, einige … | B1U03L4 | #126 | B1U03L5, B1U05L2, B1U09L1 |
| 155 | `b1u04-g-konjunktiv-ii-formen` | G | Konjunktiv II hiện tại (wäre, hätte, würde, käme …) | B1U04L1 | #103, #104, #132 | B1U04L5, B1U06L4, B1U08L4, B2U06L1 |
| 156 | `b1u04-g-irrealer-wunsch` | G | Wenn ich doch …! Ich wünschte … | B1U04L1 | #155 | B1U04L5, B1U09L1, B2U06L1 |
| 157 | `b1u04-g-irreale-bedingung` | G | Câu điều kiện không thật (hiện tại) | B1U04L2 | #155, #105 | B1U04L5, B1U05L1, B1U08L4, B2U06L1 |
| 158 | `b1u04-g-konjunktiv-ii-modal` | G | könnte, müsste, dürfte, sollte (KII) | B1U04L2 | #155 | B1U04L5, B1U08L4, B2U03L2 |
| 159 | `b1u04-g-zweiteilige-konnektoren` | G | sowohl … als auch, weder … noch, nicht nur … sondern auch, entweder … oder, zwar … aber | B1U04L3 | #121, #44 | B1U04L5, B1U06L4, B2U01L2, B2U05L2 |
| 160 | `b1u04-g-je-desto` | G | je … desto/umso | B1U04L3 | #75, #94 | B1U04L5, B1U05L4, B2U07L4 |
| 161 | `b1u04-g-relativ-wo-was` | G | Quan hệ với was (alles, was) / wo | B1U04L4 | #140 | B1U04L5, B1U06L3, B2U07L3 |
| 162 | `b1u04-g-brauchen-zu` | G | nicht/nur brauchen + zu | B1U04L4 | #115, #119 | B1U04L5, B1U09L2, B2U02L1 |
| 163 | `b1u05-g-passiv-modal` | G | Bị động với modal | B1U05L1 | #148, #52 | B1U05L5, B1U07L3, B2U02L1, B2U03L1 |
| 164 | `b1u05-g-falls` | G | falls | B1U05L1 | #105 | B1U05L5, B1U08L4, B2U05L1 |
| 165 | `b1u05-g-adj-dekl-vollstaendig` | G | Tính từ đủ 4 cách (cả Genitiv), so sánh đứng trước danh từ | B1U05L2 | #122, #149, #111 | B1U05L5, B1U07L1, B2U02L2 |
| 166 | `b1u05-g-nominalisierte-adjektive` | G | Tính từ danh từ hoá (der Kranke, etwas Neues) | B1U05L2 | #165 | B1U05L5, B1U08L1, B2U06L3 |
| 167 | `b1u05-g-wortbildung-nomen` | G | Hậu tố danh từ → giống | B1U05L3 | #13 | B1U05L5, B1U06L3, B2U01L1 |
| 168 | `b1u05-g-negation-erweitert` | G | nicht mehr, noch nicht, kein … mehr, gar nicht | B1U05L4 | #35 | B1U05L5, B1U09L2, B2U01L2 |
| 169 | `b1u06-g-futur-i` | G | Futur I | B1U06L1 | #100 | B1U06L5, B1U09L3, B2U03L2 |
| 170 | `b1u06-g-vermutung-wohl` | G | werden + wohl (phỏng đoán hiện tại) | B1U06L1 | #169 | B1U06L5, B2U03L2 |
| 171 | `b1u06-g-genitiv-praepositionen` | G | wegen, trotz, während, statt, innerhalb, außerhalb | B1U06L2 | #149 | B1U06L5, B1U07L4, B2U01L1, B2U02L3 |
| 172 | `b1u06-g-da-naemlich` | G | da (câu phụ) / nämlich | B1U06L2 | #95 | B1U06L5, B1U09L1, B2U05L2 |
| 173 | `b1u06-g-sodass` | G | sodass / so … dass | B1U06L3 | #94 | B1U06L5, B1U07L3, B2U01L3 |
| 174 | `b1u06-g-komposita-fugen` | G | Âm nối trong từ ghép (-s-, -n-) | B1U06L3 | #17 | B1U06L5, B1U07L1, B2U07L1 |
| 175 | `b1u06-g-meinung-redemittel` | R | Nêu ý kiến, đồng ý/phản đối | B1U06L4 | #97 | B1U06L5, B1U09L4, B1U10L4, B2U05L4 |
| 176 | `b1u07-g-partizip-i-attribut` | G | Partizip I làm tính từ | B1U07L1 | #165 | B1U07L5, B1U08L3, B2U02L2 |
| 177 | `b1u07-g-partizip-ii-attribut` | G | Partizip II làm tính từ | B1U07L1 | #165, #81 | B1U07L3, B1U07L5, B2U02L2 |
| 178 | `b1u07-g-waehrend-konjunktion` | G | während (liên từ: đồng thời/tương phản) | B1U07L2 | #171 | B1U07L5, B1U08L1, B2U01L2 |
| 179 | `b1u07-g-sobald-solange` | G | sobald, solange | B1U07L2 | #94 | B1U07L5, B1U08L4, B2U09L2 |
| 180 | `b1u07-g-zustandspassiv` | G | Bị động trạng thái (ist geöffnet) | B1U07L3 | #148 | B1U07L5, B1U09L2, B2U03L1 |
| 181 | `b1u07-g-nominalisierter-infinitiv` | G | das Lesen, beim Kochen, zum Laden | B1U07L3 | #70 | B1U07L5, B1U09L4, B2U01L1 |
| 182 | `b1u07-g-zeitangaben-praezise` | G | gegen, um … herum, Anfang/Mitte/Ende, innerhalb von | B1U07L4 | #130 | B1U07L5, B1U10L2 |
| 183 | `b1u08-g-statt-ohne-zu` | G | (an)statt … zu, ohne … zu | B1U08L1 | #115 | B1U08L5, B1U09L1, B2U06L4 |
| 184 | `b1u08-g-hin-her` | G | hin/her, hinauf/herunter … | B1U08L1 | #88 | B1U08L5, B1U10L2 |
| 185 | `b1u08-g-modalpartikeln-1` | G | doch, mal, ja, denn, eben/halt | B1U08L2 | #61 | B1U08L5, B1U10L2, B2U04L4 |
| 186 | `b1u08-g-verbpraefixe-wechsel` | G | Tiền tố tách/không tách (übersetzen …) | B1U08L3 | #49, #81 | B1U08L5, B2U03L3 |
| 187 | `b1u08-g-mittelfeld` | G | Trật tự Mittelfeld (TeKaMoLo, Dat–Akk) | B1U08L3 | #91 | B1U08L5, B1U09L3, B2U01L4 |
| 188 | `b1u08-g-vorschlag-konjunktiv` | R | Đề nghị bằng Konjunktiv II | B1U08L4 | #158 | B1U08L5, B1U10L4, B2U05L4 |
| 189 | `b1u09-g-zu-infinitiv-dass` | G | zu-Infinitiv hay dass | B1U09L1 | #115, #97 | B1U09L5, B1U10L3, B2U01L4 |
| 190 | `b1u09-g-wortbildung-adjektiv` | G | Tính từ phái sinh (-bar, -los, un- …) | B1U09L2 | — | B1U09L5, B1U10L1, B2U02L1 |
| 191 | `b1u09-g-vergleichssatz` | G | als/wie + câu phụ so sánh | B1U09L3 | #75, #94 | B1U09L5, B1U10L1, B2U02L4 |
| 192 | `b1u09-g-praesentation-redemittel` | R | Thuyết trình B1 (5 phần) | B1U09L4 | #175 | B1U09L5, B1U10L4, B2U03L4 |
| 193 | `b1u10-g-textverweise` | G | Từ quy chiếu trong văn bản (dies, dabei …) | B1U10L1 | #144 | B1U10L5, B2U10L1 |
| 194 | `b1u10-g-gesprochene-sprache` | G | Dạng nói rút gọn (nhận biết) | B1U10L2 | — | B1U10L5, B2U04L4 |
| 195 | `b1u10-g-formeller-brief` | R | Thư trang trọng B1 | B1U10L3 | #80, #155 | B1U10L5, B2U01L5 |
| 196 | `b1u10-g-gespraechsstrategien` | R | Hỏi lại, câu giờ, bổ sung, ngắt lời | B1U10L4 | #113 | B1U10L5, B2U05L4 |
| 197 | `b2u01-g-nominalisierung` | G | Nominalstil ↔ Verbalstil | B2U01L1 | #171, #167, #181 | B2U01L5, B2U02L3, B2U05L1, B2U09L1 |
| 198 | `b2u01-g-genitivattribut` | G | Chuỗi Genitiv bổ nghĩa | B2U01L1 | #149, #165 | B2U01L5, B2U03L1, B2U05L2 |
| 199 | `b2u01-g-adversativ-konzessiv` | G | einerseits/andererseits, dennoch, allerdings, jedoch, hingegen, wohingegen | B2U01L2 | #146, #178 | B2U01L5, B2U05L2, B2U07L4 |
| 200 | `b2u01-g-auch-wenn` | G | auch wenn / selbst wenn | B2U01L2 | #105, #146 | B2U01L5, B2U06L1, B2U07L4 |
| 201 | `b2u01-g-indem` | G | indem / dadurch, dass | B2U01L3 | #94 | B2U01L5, B2U03L1, B2U07L3 |
| 202 | `b2u01-g-konsekutiv-formal` | G | folglich, infolgedessen, somit, demnach | B2U01L3 | #173 | B2U01L5, B2U05L2, B2U07L4 |
| 203 | `b2u01-g-es-korrelat` | G | es làm từ giữ chỗ (Korrelat, Vorfeld) | B2U01L4 | #97, #115 | B2U01L5, B2U03L1, B2U08L1 |
| 204 | `b2u02-g-sich-lassen` | G | sich lassen + nguyên thể | B2U02L1 | #118, #101, #163 | B2U02L5, B2U03L3, B2U07L1 |
| 205 | `b2u02-g-sein-zu` | G | sein + zu (Passiversatz) | B2U02L1 | #115, #163 | B2U02L5, B2U09L2, B2U09L3 |
| 206 | `b2u02-g-haben-zu` | G | haben + zu (= müssen) | B2U02L1 | #115 | B2U02L5, B2U09L4 |
| 207 | `b2u02-g-partizipialattribut-erweitert` | G | Cụm phân từ mở rộng | B2U02L2 | #176, #177 | B2U02L5, B2U03L1, B2U07L1, B2U10L1 |
| 208 | `b2u02-g-relativsatz-partizip-umformung` | G | Mệnh đề quan hệ ↔ cụm phân từ | B2U02L2 | #207, #140 | B2U02L5, B2U03L3, B2U10L3 |
| 209 | `b2u02-g-funktionsverbgefuege` | G | Funktionsverbgefüge (Entscheidung treffen …) | B2U02L3 | #197 | B2U02L5, B2U05L3, B2U09L1 |
| 210 | `b2u02-g-genitiv-praep-formal` | G | aufgrund, angesichts, infolge, bezüglich … | B2U02L3 | #171 | B2U02L5, B2U05L1, B2U07L2, B2U09L3 |
| 211 | `b2u02-g-grafik-redemittel` | R | Tả biểu đồ (um/auf, Anteil …) | B2U02L4 | #130 | B2U02L5, B2U03L4, B2U07L1 |
| 212 | `b2u03-g-unpersoenliches-passiv` | G | Bị động không chủ ngữ (es wird …) | B2U03L1 | #148 | B2U03L5, B2U09L3 |
| 213 | `b2u03-g-passiv-modal-vergangenheit` | G | Bị động + modal ở quá khứ | B2U03L1 | #163, #139 | B2U03L5, B2U06L2, B2U09L1 |
| 214 | `b2u03-g-futur-ii` | G | Futur II | B2U03L2 | #169, #68 | B2U03L5, B2U07L1 |
| 215 | `b2u03-g-modalverben-subjektiv` | G | muss/dürfte/könnte – phỏng đoán | B2U03L2 | #158 | B2U03L5, B2U04L3, B2U07L2 |
| 216 | `b2u03-g-relativ-genitiv` | G | dessen / deren | B2U03L3 | #141, #149, #122 | B2U03L5, B2U06L3, B2U08L1 |
| 217 | `b2u03-g-verbpraefixe-bedeutung` | G | Nghĩa tiền tố ent-, ver-, zer-, miss-, er-, be- | B2U03L3 | #186 | B2U03L5, B2U07L2, B2U08L2 |
| 218 | `b2u03-g-vortrag-redemittel` | R | Thuyết trình B2 (Sprechen Teil 1) | B2U03L4 | #192 | B2U03L5, B2U05L4, B2U10L4 |
| 219 | `b2u04-g-konjunktiv-i-formen` | G | Konjunktiv I (sei, habe, komme …) | B2U04L1 | #155 | B2U04L5, B2U05L1, B2U10L1 |
| 220 | `b2u04-g-indirekte-rede` | G | Lời gián tiếp (KI; thay bằng KII) | B2U04L1 | #219 | B2U04L5, B2U05L2, B2U10L2 |
| 221 | `b2u04-g-indirekte-rede-vergangenheit` | G | Lời gián tiếp quá khứ (habe/sei + P II) | B2U04L2 | #220, #68 | B2U04L5, B2U06L3, B2U10L1 |
| 222 | `b2u04-g-indirekte-frage-aufforderung` | G | Câu hỏi/yêu cầu gián tiếp (ob, solle, möge) | B2U04L2 | #220, #114 | B2U04L5, B2U05L4, B2U10L2 |
| 223 | `b2u04-g-quellenangabe` | G | laut, zufolge, nach Angaben | B2U04L3 | #59, #149 | B2U04L5, B2U05L2, B2U07L1 |
| 224 | `b2u04-g-sollen-wollen-fremd` | G | sollen (nghe nói) / wollen (tự nhận) | B2U04L3 | #76, #215 | B2U04L5, B2U09L1, B2U10L1 |
| 225 | `b2u04-g-modalpartikeln-2` | G | eigentlich, wohl, schon, ruhig, bloß/nur, etwa | B2U04L4 | #185 | B2U04L5, B2U08L2, B2U10L2 |
| 226 | `b2u05-g-sofern-soweit` | G | sofern, soweit, es sei denn | B2U05L1 | #164 | B2U05L5, B2U09L2, B2U09L3 |
| 227 | `b2u05-g-bedingung-nominal` | G | bei + Nomen, im Falle + Gen | B2U05L1 | #197 | B2U05L5, B2U09L2 |
| 228 | `b2u05-g-textkonnektoren` | G | zudem, darüber hinaus, ferner, stattdessen, andernfalls | B2U05L2 | #117 | B2U05L5, B2U07L4, B2U10L3 |
| 229 | `b2u05-g-zumal` | G | zumal | B2U05L2 | #172 | B2U05L5, B2U07L4 |
| 230 | `b2u05-g-verben-praeposition-b2` | G | Động từ + giới từ (B2) | B2U05L3 | #145, #144 | B2U05L5, B2U06L4, B2U07L3 |
| 231 | `b2u05-g-nomen-praeposition` | G | Danh từ + giới từ (Einfluss auf …) | B2U05L3 | #230 | B2U05L5, B2U06L1, B2U07L2 |
| 232 | `b2u05-g-diskussion-redemittel` | R | Thảo luận, phản biện (Sprechen Teil 2) | B2U05L4 | #175, #196 | B2U05L5, B2U07L4, B2U10L4 |
| 233 | `b2u06-g-konjunktiv-ii-vergangenheit` | G | Konjunktiv II quá khứ (hätte/wäre + P II) | B2U06L1 | #155, #68 | B2U06L5, B2U07L1, B2U08L4 |
| 234 | `b2u06-g-irreale-vergangenheit` | G | Điều kiện/ước không thật ở quá khứ | B2U06L1 | #233, #157 | B2U06L5, B2U07L3, B2U09L4 |
| 235 | `b2u06-g-konj-ii-modal-vergangenheit` | G | hätte … machen sollen/können | B2U06L2 | #233, #139 | B2U06L5, B2U07L4, B2U09L4 |
| 236 | `b2u06-g-als-ob` | G | als ob / als wenn / als + KII | B2U06L2 | #155 | B2U06L5, B2U08L1, B2U08L4 |
| 237 | `b2u06-g-nominalisierte-partizipien` | G | Partizip danh từ hoá (der Geflüchtete) | B2U06L3 | #166, #177 | B2U06L5, B2U08L1, B2U10L1 |
| 238 | `b2u06-g-gendergerechte-sprache` | G | Ngôn ngữ trung lập về giới (nhận biết) | B2U06L3 | #38 | B2U06L5, B2U10L1 |
| 239 | `b2u06-g-ohne-anstatt-dass` | G | ohne dass / anstatt dass | B2U06L4 | #183, #97 | B2U06L5, B2U09L4 |
| 240 | `b2u07-g-infinitiv-perfekt` | G | Nguyên thể quá khứ (… erreicht zu haben) | B2U07L1 | #115, #68 | B2U07L5, B2U08L4, B2U10L3 |
| 241 | `b2u07-g-infinitiv-passiv` | G | Nguyên thể bị động (… eingeladen zu werden) | B2U07L1 | #240, #148 | B2U07L5, B2U09L4 |
| 242 | `b2u07-g-kausale-praepositionen` | G | aus, vor, dank (nguyên nhân) | B2U07L2 | #171 | B2U07L5, B2U08L3, B2U09L1 |
| 243 | `b2u07-g-weiterfuehrender-relativsatz` | G | …, was/wodurch … (trỏ cả câu) | B2U07L3 | #161, #144 | B2U07L5, B2U08L1, B2U10L3 |
| 244 | `b2u07-g-argumentation-redemittel` | R | Lập luận pro/contra | B2U07L4 | #199, #228 | B2U07L5, B2U08L4, B2U10L3 |
| 245 | `b2u08-g-relativ-wer-was` | G | Wer …, (der) …; Was …, (das) … | B2U08L1 | #161 | B2U08L5, B2U09L3, B2U10L2 |
| 246 | `b2u08-g-register` | G | Khẩu ngữ – chuẩn – trang trọng | B2U08L2 | #194 | B2U08L5, B2U09L4, B2U10L3 |
| 247 | `b2u08-g-adjektive-kasus` | G | Tính từ + Dat/Gen/Akk (ähnlich, bewusst …) | B2U08L3 | #99, #149 | B2U08L5, B2U09L3 |
| 248 | `b2u08-g-bewerten-redemittel` | R | Đánh giá, review | B2U08L4 | #175 | B2U08L5, B2U10L3 |
| 249 | `b2u09-g-funktionsverbgefuege-passiv` | G | FVG nghĩa bị động (Anerkennung finden …) | B2U09L1 | #209, #148 | B2U09L5, B2U10L1 |
| 250 | `b2u09-g-konditional-verbspitze` | G | Điều kiện không wenn (Sollten Sie …) | B2U09L2 | #157, #158 | B2U09L5, B2U10L3 |
| 251 | `b2u09-g-dativ-praep-formal` | G | gemäß, entsprechend, gegenüber, entgegen + Dat | B2U09L3 | #59 | B2U09L5, B2U10L1 |
| 252 | `b2u09-g-einander` | G | einander, miteinander … | B2U09L3 | #101 | B2U09L5, B2U10L4 |
| 253 | `b2u09-g-beschwerde-redemittel` | R | Khiếu nại trang trọng | B2U09L4 | #195, #235 | B2U09L5, B2U10L3 |
| 254 | `b2u10-g-textsorten-signale` | R | Dấu hiệu loại văn bản, ý định tác giả | B2U10L1 | #220 | B2U10L5 |
| 255 | `b2u10-g-signalwoerter-hoeren` | R | Tín hiệu cấu trúc bài nói | B2U10L2 | #218 | B2U10L5 |
| 256 | `b2u10-g-textaufbau` | R | Bố cục bài viết B2, tiêu chí chấm | B2U10L3 | #244 | B2U10L5 |
| 257 | `b2u10-g-moderation-redemittel` | R | Điều phối lượt lời | B2U10L4 | #232 | B2U10L5 |

### 3.1 Kiểm tra thứ tự tiền quyết — vấn đề đã phát hiện và cách sửa

Kiểm tra hai lớp: (1) script đối chiếu cột "Cần trước"/"Ôn lại ở" với vị trí bài (kết quả cuối: **0 lỗi** trên 257 item); (2) rà tay các chỗ một bài *dùng* cấu trúc trước khi nó được dạy (bảng dưới). Các sửa đổi so với phụ lục mục 7 của kế hoạch:

| # | Vấn đề | Cách xử lý trong ma trận |
|---|---|---|
| 1 | Kế hoạch đặt Dativ nhập môn ở A1U07, nhưng A1U05 (nhà ở – vị trí, giới từ in/an/auf) đã cần Dativ. | Dạy **mạo từ Dativ + giới từ chỉ vị trí (Wo?)** ở A1U05L3; A1U07L1 chỉ thêm nhóm giới từ luôn đi Dativ (aus, bei, mit, nach, von, zu). |
| 2 | A1U02 (haben, gia đình) cần Akkusativ ("Ich habe einen Bruder") trước khi Akk được dạy ở A1U03L2. | Ràng buộc ghi trong A1U02L2–L3: chỉ dùng tân ngữ giống cái/giống trung/số nhiều (hình thái Akk = Nom); không có tân ngữ giống đực số ít cho tới A1U03L2. |
| 3 | So sánh nhất dạng đứng trước danh từ (A2U05: "der schönste Strand") cần đuôi tính từ sau mạo từ xác định, mà kế hoạch để ở A2U07. | Chuyển **bảng đuôi tính từ 2 (sau der/die/das)** về A2U05L3, dạy cùng so sánh nhất; A2U07 giữ bảng 3 (không mạo từ) và dieser/jeder. |
| 4 | Kế hoạch dạy um…zu (A2U06) trước zu-Infinitiv (A2U07). | Đặt **zu-Infinitiv ở A2U06L2**, **um…zu ở A2U06L3**. |
| 5 | Perfekt ở A1U06 sẽ gặp Partizip của động từ không tách/-ieren (besucht, telefoniert) trước khi có quy tắc. | A1U06L3 dạy ge-…-t/ge-…-en và động từ tách (eingekauft); quy tắc **không ge-** (be-, ver-, -ieren …) chuyển sang A2U01L1; ràng buộc ghi trong A1U06L3. |
| 6 | "ins Kino gehen" (in + Akk chỉ hướng) xuất hiện ở A1U06, trước giới từ hai cách (A2U02L1). | Học như **cụm cố định** (`phrase`) ở A1U06L2; hệ thống Wo?/Wohin? ở A2U02L1. |
| 7 | "Wie geht es Ihnen?", "Können Sie mir helfen?", "zum Bahnhof" dùng Dativ trước khi học Dativ. | Ghi rõ là cụm cố định trong A1U01L1 và A1U05L4. |
| 8 | "Ich hätte gern …" (Konjunktiv II) ở A1U03L3. | Cụm cố định; Konjunktiv II nhập môn ở A2U04L3, hệ thống ở B1U04L1. |
| 9 | Kế hoạch để Präteritum sein/haben ở A2U01, trong khi A1 cần "Wie war …?" (và Start Deutsch 1 dùng war/hatte). | Dạy **war/hatte ở A1U06L4** cùng Perfekt với sein; A2U01L2 chỉ còn Präteritum của modal. |
| 10 | "seit" nằm trong nhóm giới từ Dativ A1 nhưng cần thì hiện tại cho việc còn tiếp diễn (khác tiếng Việt "đã… được"). | Tách thành điểm riêng `a2u01-g-seit-praesens` (A2U01L4). |
| 11 | Danh từ n-Deklination (der Student, der Kollege, der Herr, der Name, der Nachbar, der Kunde) xuất hiện từ P0/A1, quy tắc ở B1U03L3. | Trước B1U03L3, mỗi thẻ danh từ này ghi dạng Akk/Dat trong ghi chú (den Kollegen, Herrn Weber) và ví dụ phải đúng; không ra bài tập sản sinh về đuôi -n trước B1U03L3. |
| 12 | Động từ phản thân và động từ + giới từ có thể lọt vào từ vựng sớm (sich bewerben, sich beschweren, sich freuen auf). | Script kiểm tra: không lemma "sich …" nào trước A2U04L1, không lemma "động từ + giới từ" nào trước A2U08L1 (sich bewerben → B1U03L1; sich beschweren → A2U05L4). |
| 13 | Tính từ danh từ hoá (der Bekannte, der Deutsche) dễ dùng sớm. | Tránh trong ví dụ trước B1U05L2 (dùng "Ich komme aus Deutschland", "ein Freund von mir"). |
| 14 | Mệnh đề quan hệ Genitiv (dessen/deren) cần Genitiv và đuôi tính từ không mạo từ. | Đặt ở B2U03L3 (sau Genitiv B1U03L1 và bảng 3 A2U07L2). |
| 15 | B2U01L2: "Auch wenn …, ich gebe nicht auf" là cấu trúc chuẩn (câu phụ nhượng bộ – điều kiện có thể không lồng vào câu chính), không phải lỗi. | Ghi rõ trong khối bài: dạy dạng đảo là mặc định nhưng **không** dùng dạng không đảo làm phương án sai. |


## 4. Kế hoạch từ vựng

### 4.1 Con số thật của ma trận so với mục tiêu

Mục tiêu trong kế hoạch: vốn từ chủ động A1 ≈ 650, A2 ≈ +700, B1 ≈ +1.100, B2 ≈ +1.800 (cộng dồn ≈ 4.250). Với khuôn **≈ 12 item/bài** và chỉ bài 1–4 được giới thiệu item, con số này **không đạt được** — nói thẳng ở đây để orchestrator quyết định (mục 7).

| Cấp | Mục tiêu | Lemma/cụm có tên trong ma trận (đếm bằng script) | Từ "ẩn" trong item gộp và item ngữ pháp (ước tính) | Vốn từ chủ động hiệu quả (ước tính) | Tỉ lệ so với mục tiêu |
|---|---|---|---|---|---|
| P0 + A1 | 650 | 100 + 323 = 423 | ≈ +100 (số 0–100, thứ, tháng, mùa, màu trong 7 item gộp ≈ 53; đại từ, mạo từ sở hữu, giới từ, liên từ trong item ngữ pháp ≈ 45) | ≈ 525 | ≈ 80 % |
| A2 | +700 | 313 | ≈ +25 (liên từ, giới từ, dieser/jeder …) | ≈ 340 | ≈ 48 % |
| B1 | +1.100 | 334 | ≈ +30 (liên từ, giới từ Genitiv, đại từ bất định) | ≈ 365 | ≈ 33 % |
| B2 | +1.800 | 315 | ≈ +30 (liên từ, giới từ trang trọng, thành ngữ trong item ngữ pháp) | ≈ 345 | ≈ 19 % |
| **Cộng dồn** | **4.250** | **1.385** | ≈ +185 | **≈ 1.570** | **≈ 37 %** |

Độ phủ so với danh sách từ theo chủ đề kiểu Goethe/Profile deutsch (ước lượng định tính, chưa đối chiếu từng mục — *to be verified* khi có danh sách tham chiếu): A1 phủ gần đủ các trường bắt buộc của Start Deutsch 1 (thông tin cá nhân, gia đình, ăn uống, mua sắm, nhà ở, thời gian, giao thông, sức khoẻ, cơ quan); A2 phủ khoảng một nửa danh sách bổ sung, thiếu nhiều tính từ/động từ thông dụng và từ về thời tiết – thiên nhiên chi tiết; B1/B2 phủ trục chủ đề nhưng mật độ từ trong mỗi chủ đề thấp.

**Quy tắc "từ bổ sung" (Zusatzwortschatz) để tăng vốn từ mà không trùng giữa agent:**
1. Mỗi bài dạy mới (L1–L4) được thêm tối đa **3 lemma** (A1–A2) hoặc **5 lemma** (B1–B2) ngoài danh sách, với điều kiện: thuộc đúng trường từ vựng của bài; **không** xuất hiện ở bất kỳ dòng "Từ mới" nào của tài liệu này (tìm bằng `grep` trên file này); **không** có trong `content/de/items/` tại thời điểm viết; tổng item của bài ≤ 16.
2. Hai agent chạy song song có thể vô tình thêm cùng một lemma bổ sung. Bước `content:check` (từ điển giống/số nhiều `content/de/lexicon.json`) phải báo trùng; unit **commit sau** đổi item của mình thành `reuse` (hoặc chọn lemma khác). Lemma có tên trong ma trận luôn thắng lemma bổ sung.
3. Với tối đa lemma bổ sung ở mọi bài, vốn từ đạt khoảng 1.570 + 32×3 + 32×3 + 40×5 + 40×5 ≈ **2.160** (≈ 51 % mục tiêu). Muốn đạt 4.250 cần khoảng 27 lemma/bài dạy mới, vượt khuôn bài hiện tại (xem câu hỏi mở 1).
4. Script kiểm trùng của tài liệu này chỉ còn báo 4 cặp **khác từ loại/khác nghĩa, được phép là hai item**: der Morgen (A1U04L1) / morgen (A1U04L3); fernsehen (A1U04L2) / das Fernsehen (A2U07L3); trennen – phân loại rác (A2U08L2) / sich trennen – chia tay (B1U02L2); bitte (P0U3L2) / die Bitte (B1U10L3). Các nghĩa thứ hai của một lemma đã có (die Überweisung, das Rezept, das Angebot, zunehmen/abnehmen, der Umzug) **không** tạo item mới — dùng `reuse` + ghi chú nghĩa như ghi trong khối bài.
5. Từ chỉ xuất hiện trong bài đọc/nghe (thụ động) **không** tính vào vốn từ chủ động và không cần làm item; chú thích nghĩa ngay trong `note` của ví dụ.

### 4.2 Danh mục chủ đề (Themenbereiche) theo cấp

Ô ghi mã unit/bài phủ chủ đề; "—" là chưa có ở cấp đó (cố ý hoặc được ghi là lỗ hổng).

| Chủ đề (Profile deutsch / Goethe) | A1 (gồm P0) | A2 | B1 | B2 |
|---|---|---|---|---|
| Thông tin cá nhân (Person) | P0U2L4, A1U01 | A2U01L4 | B1U01 | B2U06L4 |
| Gia đình, quan hệ (Familie, Beziehungen) | A1U02 | A2U02L2 | B1U02 | B2U06 |
| Nhà ở (Wohnen) | A1U05 | A2U02 | B1U09L2 | B2U09L3 |
| Ăn uống (Essen und Trinken) | A1U03 | A2U04L3 | B1U05 | — (lỗ hổng nhỏ, bù qua B2U07L3 tiêu dùng) |
| Mua sắm, tiêu dùng (Einkaufen, Konsum) | A1U03L4, A1U07L4 | A2U07L2 | B1U07L3 | B2U02, B2U07L3 |
| Công việc (Arbeit und Beruf) | A1U02L4 | A2U03 | B1U03 | B2U01, B2U02 |
| Giáo dục (Schule, Ausbildung, Studium) | P0U3 | A2U01L4 | B1U04 | B2U01 |
| Ngoại ngữ (Sprachen lernen) | A1U01L3 | — | B1U04L3 | B2U06L4 |
| Thời gian rảnh, giải trí (Freizeit) | A1U06 | A2U07L3 | B1U07L2 | B2U08 |
| Du lịch, giao thông (Reisen, Verkehr) | A1U07 | A2U05, A2U08L3 | B1U08 | B2U07L1 (giao thông – khí thải) |
| Sức khoẻ, cơ thể (Gesundheit) | A1U08L1–L2 | A2U04 | B1U05 | — (**lỗ hổng**: chưa có unit sức khoẻ B2; xem câu hỏi mở 4) |
| Dịch vụ, cơ quan (Dienstleistungen, Behörden) | A1U08L3 | A2U06 | B1U03L4, B1U09 | B2U06L2, B2U09 |
| Truyền thông, liên lạc (Medien, Kommunikation) | A1U08L4 | A2U07L3–L4 | B1U07 | B2U04 |
| Thời tiết, thiên nhiên, môi trường (Wetter, Natur, Umwelt) | A1U06L4 | A2U05L3, A2U08L2 | B1U06 | B2U07 |
| Lễ hội, văn hoá (Feste, Kultur) | A1U04L4 | A2U07L1 | B1U08 | B2U08 |
| Xã hội, chính trị (Gesellschaft, Politik) | — | — | B1U09 | B2U05, B2U06 |
| Kinh tế, tiền bạc (Wirtschaft, Geld) | A1U03L4 | A2U06L2 | B1U03 | B2U02 |
| Khoa học, công nghệ (Wissenschaft, Technik) | — | A2U07L4 | B1U07 | B2U03 |
| Pháp luật, quy định (Recht) | — | A2U06L4 | B1U09L3 | B2U09 |
| Nghệ thuật, văn học (Kunst, Literatur) | — | — | B1U01L1 | B2U08 |

## 5. Quy ước cho agent viết nội dung

### 5.1 File và key

| Thứ | Quy ước | Ví dụ |
|---|---|---|
| Program | `content/de/programs/<slug>/program.yaml`, key `de:program:<slug>`, `kind: core`, `goal_types: []` | `content/de/programs/a1/program.yaml` |
| Unit | `content/de/programs/<slug>/units/<nn>-<unit-slug>/unit.yaml`, key `de:unit:<mã-unit>-<unit-slug>`, `order_index` = số unit trong chương trình (1…8/10; P0: 1…3) | `units/03-essen-einkaufen/unit.yaml`, `de:unit:a1u03-essen-einkaufen` |
| Bài | `units/<nn>-<unit-slug>/lessons/<n>-<slug>.yaml` với `<n>` = `01`…`05`; key `de:lesson:<mã-unit>-<slug>` (đúng như mục 2); `order_index` 1…5 | `lessons/02-ich-nehme-den-salat.yaml` |
| File item | **một file / unit**: `content/de/items/<mã-unit>-<unit-slug>.yaml` | `content/de/items/a1u03-essen-einkaufen.yaml` |
| Item | `de:item:<mã-unit>-<slug-lemma>`; ngữ pháp `de:item:<mã-unit>-g-<slug>` **đúng như mục 2/3**. Slug lemma: chữ thường, bỏ mạo từ, ä→ae, ö→oe, ü→ue, ß→ss, khoảng trắng → `-` | `de:item:a1u03-salat`, `de:item:a1u03-g-akkusativ`, `de:item:a2u08-sich-freuen-auf` |
| Bài tập | `de:exercise:<mã-unit>l<k>-<loại>-<slug>`; `<loại>` ∈ `mcq`, `fill`, `wb` (word_bank), `tr` (translate), `listen`; slug 1–4 từ gợi nội dung | `de:exercise:a1u03l2-fill-den-einen`, `de:exercise:p0u1l3-listen-schoen-schon` |
| Độ dài key | ≤ 64 ký tự sau `de:<loại>:`; chỉ `a–z`, `0–9`, `-` | |

- `prerequisites` của bài: bài liền trước trong cùng chương trình (L1 của unit n ← L5 của unit n−1); bài đầu tiên của mỗi chương trình: `[]` (như ja).
- `level` của bài = cấp của chương trình (`pre_a1`, `a1`, `a2`, `b1`, `b2`) — mỗi chương trình chỉ có một cấp. `level` của item = cấp của unit chứa nó.
- `estimated_minutes`: P0 10–12; A1 12–15; A2 15–18; B1 18–20; B2 20–22; bài 5 cộng thêm 5.
- `skills` của bài: lấy đúng giá trị ghi trong khối bài (từ vựng: `pronunciation, listening, speaking, reading, writing, grammar, vocabulary`). `skill_tags` của item: `[vocabulary]`, `[grammar]`, P0 dùng `[pronunciation]`.
- Header file: theo quyết định của orchestrator và mục "Tiếng Đức" của `content/README.md` (do agent khác viết) về `demo`/`status`/`reviewed_by`; không tự đặt `reviewed_by` nếu chưa được giao.

### 5.2 Item

- `type`: `vocab` (một từ), `phrase` (cụm/câu mẫu, các item gộp như "die Wochentage"), `grammar_point` (mọi item trong cột "Ngữ pháp mới", kể cả quy tắc phát âm P0 và Redemittel).
- `front.text` theo quy tắc chung của agent (danh từ: `"der Tisch, -e"`; động từ bất quy tắc từ A2: `"fahren, fährt, fuhr, ist gefahren"`, A1: `"fahren (du fährst)"`; không số nhiều: `(Sg.)`). `front.pos` bằng tiếng Việt (danh từ, động từ, tính từ, trạng từ, giới từ, cụm từ). `front.ipa` bắt buộc ở P0 và với từ khó ở A1 (ví dụ `/ˈʃtʊl/`), tuỳ chọn sau đó.
- `back.pronunciation_note.vi` dùng so sánh với âm tiếng Việt như ở mục 2 (ach-Laut ≈ "kh", r ≈ "g" đọc nhẹ ra sau, z = "ts", w = "v", s đầu âm tiết ≈ "d" giọng Bắc, ü = "i" tròn môi). `back.confusion.vi` cho cặp dễ nhầm (mieten/vermieten, Stunde/Uhr, sein/ihr).
- Item ngữ pháp: `front.text` là tên điểm ngữ pháp bằng tiếng Đức + mẫu (ví dụ `"Akkusativ: den / einen / keinen"`), `back.meaning.vi` là quy tắc ≤ 3 câu, ≥ 2 `examples`.
- Danh từ n-Deklination trước B1U03L3: ghi dạng Akk/Dat trong `back.confusion.vi` (xem 3.1 #11).

### 5.3 Thân bài

Khối bắt buộc theo `content/README.md`: `objective`, `explain` (mỗi ý ≤ 3 câu, xưng "bạn", so với tiếng Việt), ≥ 2 `example` (câu Đức đúng giống, danh từ viết hoa; trước B1 ghi rõ du/Sie trong `note` khi có xưng hô), `common_mistake` (lấy từ dòng "Lỗi người Việt"), `summary` (≤ 8 ý), nên có `deep_explain`. `objectives` (1–5) lấy từ "Can-do".

### 5.4 Bài tập: số lượng, loại, độ khó

Số lượng: L1–L4 **8–10** bài tập; L5 **10–12**. Thứ tự recognition → recall → application; gợi ý (`hint_levels`) chỉ ở recognition.

| Giai đoạn | Số lượng (L1–L4) | Loại ưu tiên cho tiếng Đức |
|---|---|---|
| recognition | 3 | `mcq` chọn dạng đúng (mạo từ, đuôi, động từ chia); `listen` (P0: cặp tối thiểu; từ A1: câu → nghĩa); `fill_blank` có gợi ý cho mạo từ/đuôi |
| recall | 3 | `fill_blank` không gợi ý cho **mạo từ, đuôi cách, đuôi tính từ, dạng động từ, Partizip II, trợ động từ haben/sein**; `translate` `vi_to_target` câu ngắn |
| application | 2–3 | `word_bank` cho **trật tự từ** (V2, khung câu, động từ tách, câu phụ động từ cuối, Mittelfeld); `translate` hai chiều; `mcq` tình huống (du/Sie, ngữ vực, chọn liên từ) |

- L4: ≥ 3 bài `listen`. L5: 3–4 bài đọc (đoạn văn trong `stem` + `mcq` richtig/falsch hoặc chọn ý), 2 `listen`, 2 `word_bank`, 2 `translate`, 1–2 `fill_blank` cụm viết thư; ghi phần thi tương ứng trong `explanation` ở unit thi.
- P0: chủ yếu `listen` (cặp tối thiểu: Bett/Beet, schon/schön, Mann/Name), `mcq` chọn chữ/âm, `word_bank` ghép chữ cái/âm tiết thành từ (như Hangul), `fill_blank` có gợi ý cho ä/ö/ü/ß.
- **Viết hoa danh từ** không chấm được bằng gõ tự do (máy chấm hạ chữ thường): dạy bằng `mcq` (chọn câu viết đúng) và `word_bank` (token đã viết hoa sẵn).
- **`word_bank` tiếng Đức:** liệt kê **mọi** thứ tự đúng trong `orders` — vị trí 1 trong câu V2 thường có nhiều lựa chọn (`Heute lerne ich Deutsch.` / `Ich lerne heute Deutsch.`); giữ ≤ 8–9 token và tránh trạng ngữ "trôi" để số thứ tự đúng không bùng nổ; token trùng chữ (hai chữ "die") phải liệt kê cả hai hoán vị (quy tắc README).
- **`translate`:** ≥ 3 biến thể `accepted`, gồm biến thể vị trí 1 khác nhau, du/Sie nếu đề không chỉ rõ (nên chỉ rõ: "(nói với bạn thân)" / "(nói với khách hàng)"), dạng rút gọn chuẩn (`im`, `zum`, `ins`), số viết bằng chữ và chữ số khi liên quan. Không liệt kê dạng `ae/oe/ue/ss` (máy chấm tự gấp). `rubric.typo_tolerance: 1` cho câu dài; đáp án tiếng Việt `rubric.diacritics: lenient`.
- **`known_wrong`** (tag theo quy tắc chung): `article`, `gender`, `case_dat_akk`, `verb_position`, `word_order`, `adj_ending`, `plural_form`, `aux_verb`, `capitalization` (chỉ trong mcq), `separable_prefix`, `reflexive_missing`, `konjunktiv_form`, `preposition`, `register_du_sie`. Không đưa vào `known_wrong` câu chuẩn có trật tự khác (xem 3.1 #15) hay dạng chỉ khác nhau ở umlaut gõ tắt.
- **`difficulty`** (thang 1–5; bám phân bố thực tế của en/ja cùng cấp CEFR):

| Cấp | recognition | recall | application | item |
|---|---|---|---|---|
| pre_a1 | 1 | 1–2 | 2 | 1–2 |
| a1 | 1 | 2 | 2–3 | 1–2 |
| a2 | 1–2 | 2–3 | 3 | 2–3 |
| b1 | 2 | 3 | 3–4 | 3 |
| b2 | 2–3 | 3–4 | 4 (5 cho dạng đề Goethe khó nhất) | 3–4 |

### 5.5 Audio

`listen` khi chưa có audio: `audio_asset_id: null`, `fallback_text` là câu tiếng Đức được đọc bằng giọng máy `de-DE`. Viết `fallback_text` như văn bản thường, tránh viết tắt (`z. B.`, `usw.`, `Nr.`) và ký hiệu (`€` nên viết "Euro" khi giá là trọng tâm bài nghe) để TTS đọc đúng; P0 cặp tối thiểu dùng một từ. Audio thật (nếu có) sinh sau bằng `scripts/generate-audio.mjs`, không chặn việc viết bài.

### 5.6 Dạng bài thi Goethe (dùng cho bài cuối mỗi cấp và các L5)

Cấu trúc theo hiểu biết của người soạn tại thời điểm viết; **thời lượng, số câu và thang điểm cần đối chiếu Prüfungsordnung/Durchführungsbestimmungen hiện hành của Goethe-Institut trước khi viết đề thi** (to be verified). Chỉ mô phỏng dạng, tự soạn nội dung.

| Đề | Lesen | Hören | Schreiben | Sprechen |
|---|---|---|---|---|
| Start Deutsch 1 (A1) | 3 Teile (tin nhắn/e-mail, quảng cáo – chọn nguồn, biển báo/thông báo), ≈ 25 phút | 3 Teile (hội thoại ngắn, thông báo nơi công cộng, tin nhắn thoại), ≈ 20 phút | Teil 1 điền form; Teil 2 tin nhắn ≈ 30 từ theo 3 ý; ≈ 20 phút | Thi nhóm, 3 Teile: giới thiệu bản thân; hỏi–đáp theo thẻ chủ đề; đề nghị/đáp lời theo thẻ hình; ≈ 15 phút |
| Goethe-Zertifikat A2 | 4 Teile, ≈ 30 phút | 4 Teile, ≈ 30 phút | Teil 1 SMS ≈ 20–30 từ; Teil 2 e-mail ≈ 30–40 từ (thân mật hoặc trang trọng); ≈ 30 phút | Thi cặp, 3 Teile: hỏi–đáp theo thẻ; kể về cuộc sống của mình; cùng lên kế hoạch; ≈ 15 phút |
| Goethe-Zertifikat B1 | 5 Teile, ≈ 65 phút | 4 Teile, ≈ 40 phút | Teil 1 e-mail thân mật ≈ 80 từ; Teil 2 bài diễn đàn ≈ 80 từ; Teil 3 tin nhắn trang trọng ≈ 40 từ; ≈ 60 phút | Thi cặp, 3 Teile: cùng lên kế hoạch; trình bày một chủ đề; phản hồi và trả lời câu hỏi; ≈ 15 phút |
| Goethe-Zertifikat B2 | 5 Teile, ≈ 65 phút | 4 Teile, ≈ 40 phút | Teil 1 bài diễn đàn/ý kiến ≈ 150 từ; Teil 2 thư trang trọng ≈ 100 từ; ≈ 75 phút | Thi cặp, 2 Teile: thuyết trình ≈ 4 phút (+ phản hồi); thảo luận ≈ 5 phút; ≈ 15 phút |

## 6. Checklist duyệt tiếng Đức (cho agent rà soát độc lập)

Dùng cùng checklist chung trong `content/README.md`. Phần riêng tiếng Đức:

**Khớp ma trận**
- [ ] Bài chỉ `introduce` đúng item ngữ pháp và lemma ghi ở mục 2 (+ tối đa số lemma bổ sung cho phép, đã kiểm không trùng); mọi item "Ôn lại ở" bài này có `role: reuse` và được dùng thật.
- [ ] Không bài tập sản sinh nào dùng cấu trúc chưa được giới thiệu (đối chiếu mục 3); cụm cố định chỉ dùng như cụm.
- [ ] Key, tên file, `order_index`, `level`, `prerequisites` đúng mục 5.1.

**Danh từ**
- [ ] Mỗi danh từ có mạo từ đúng giống và số nhiều đúng (đối chiếu từ điển, ví dụ Duden/Wiktionary); ký hiệu số nhiều hợp lệ (`-e`, `¨-e`, `-er`, `¨-er`, `-(e)n`, `-nen`, `-s`, `-`, `¨-`, dạng đầy đủ như `Museen`, `(Sg.)`, `(Pl.)`).
- [ ] Danh từ (kể cả danh từ hoá: das Laden, etwas Neues) viết hoa trong mọi câu Đức; tính từ chỉ ngôn ngữ/quốc tịch viết thường.
- [ ] Từ ghép lấy giống của từ cuối; âm nối đúng (Arbeitsplatz).
- [ ] n-Deklination đúng ở mọi ví dụ (den Kollegen, dem Kunden, Herrn …).

**Cách và mạo từ**
- [ ] Giới từ đúng cách (Akk: für/ohne/durch/gegen/um; Dat: aus/bei/mit/nach/seit/von/zu; hai cách theo Wo?/Wohin?; Genitiv: wegen/trotz/während …); rút gọn đúng (im, am, ins, zum, zur, beim, vom).
- [ ] Động từ đúng cách tân ngữ (helfen + Dat, fragen + Akk, gefallen: vật là chủ ngữ); thứ tự Dat/Akk đúng.
- [ ] Đuôi tính từ đúng bảng (sau der-từ / ein-từ / không mạo từ; Genitiv; so sánh hơn/nhất đứng trước danh từ; Partizip làm tính từ).
- [ ] Đại từ quan hệ: giống/số theo danh từ đứng trước, cách theo vai trò trong mệnh đề (denen, dessen/deren đúng).

**Động từ và trật tự từ**
- [ ] Động từ chia đúng ngôi, đúng đổi nguyên âm (du fährst, er nimmt), modal ngôi 1/3 không đuôi.
- [ ] V2 trong câu chính (kể cả khi trạng ngữ/câu phụ đứng đầu); động từ cuối trong câu phụ; khung câu đúng; tiền tố tách đứng cuối; zu đúng chỗ (anzurufen).
- [ ] Perfekt đúng trợ động từ (sein cho chuyển động/đổi trạng thái, bleiben, sein, passieren) và Partizip II đúng (không ge- với be-/ver-/-ieren); Ersatzinfinitiv đúng (hat … machen müssen).
- [ ] Bị động: werden + Partizip II; Perfekt bị động dùng **worden**; Zustandspassiv không nhầm với Perfekt.
- [ ] Konjunktiv II/I đúng dạng (wäre, hätte, würde; sei, habe; thay KI bằng KII khi trùng hiện tại).
- [ ] Động từ phản thân có đại từ đúng cách (mich/mir).

**Chính tả**
- [ ] Chính tả theo quy tắc chính tả hiện hành (sau cải cách): ss/ß đúng (dass, muss, Straße, Fuß), không dùng chính tả cũ (daß, muß); trạng từ/cụm viết đúng (zu Hause/zuhause đều được — thống nhất `zu Hause`; kennenlernen; Rad fahren).
- [ ] Dấu phẩy bắt buộc trước câu phụ và quanh mệnh đề quan hệ; dấu ngoặc kép kiểu Đức „…“ chỉ dùng nếu mọi file đều dùng (mặc định ngoặc thẳng "…" của YAML).
- [ ] `content:check` (nspell + `dictionary-de`) sạch, hoặc từ bị báo đã được thêm vào danh sách cho phép với lý do.

**Ngữ nghĩa, ngữ dụng**
- [ ] Câu tự nhiên với người bản ngữ (không dịch từng chữ từ tiếng Việt/Anh); ngữ vực đúng (du/Sie nhất quán trong một hội thoại; thư trang trọng viết hoa Sie/Ihnen/Ihr).
- [ ] Thông tin văn hoá – thủ tục (số khẩn cấp, Anmeldung, Kaution, Pfand, vé) đúng tại thời điểm viết hoặc được ghi "cần kiểm tra"; biến thể Áo/Thụy Sĩ chỉ ghi chú, không làm đáp án duy nhất.
- [ ] Bản dịch tiếng Việt tự nhiên, đúng nghĩa (đặc biệt: halb drei = 2 giờ 30, vor zwei Jahren = cách đây hai năm, nicht müssen = không cần).
- [ ] Phương án nhiễu chắc chắn sai trong **chuẩn** Hochdeutsch (không chọn dạng địa phương/khẩu ngữ hợp lệ làm phương án sai, ví dụ "wegen dem", "weil + V2" chỉ được coi là sai trong bài văn viết và phải giải thích như vậy).
- [ ] `accepted` có đủ biến thể trật tự từ và rút gọn hợp lệ; không có dạng ae/oe/ue/ss.

## 7. Câu hỏi mở cho orchestrator

1. **Vốn từ (quan trọng):** khuôn 195 bài × ≈ 12 item chỉ cho ≈ 1.570 từ chủ động hiệu quả (≈ 2.160 nếu dùng hết lemma bổ sung), so với mục tiêu 4.250 của kế hoạch. Chọn: (a) chấp nhận và sửa mục tiêu trong kế hoạch; (b) nâng trần item/bài ở B1–B2 lên ≈ 20 (thêm ≈ 800 lemma); (c) thêm sau này một loại nội dung "gói từ vựng theo chủ đề" chỉ dành cho flashcard (không cần bài học) để phủ danh sách Goethe.
2. **Số item ngữ pháp:** 257 (225 điểm ngữ pháp + 15 quy tắc phát âm + 17 Redemittel), nhiều hơn khoảng 150–200 dự kiến vì tách nhỏ để mỗi bài có trọng tâm rõ. Có muốn gộp (ví dụ gộp `b1u01-g-bevor/seitdem/bis` thành một) không? Gộp không đổi thứ tự dạy.
3. **`goal_types`:** DB chỉ cho `goal_types` ở chương trình `kind: goal`, nên 5 chương trình core để `[]`. Nếu muốn lộ trình `goethe`/`skill_focus` có chương trình riêng, cần thiết kế thêm chương trình `kind: goal` (ngoài phạm vi 195 bài này).
4. **Lỗ hổng chủ đề B2:** chưa có unit Sức khoẻ và Ăn uống ở B2 (đề Goethe B2 có thể ra). Có thể đổi chủ đề B2U09 (Recht) thành "Gesundheit und Recht" hoặc chấp nhận bù bằng bài đọc ở L5.
5. **Thang điểm và thời lượng đề Goethe** (mục 5.6) cần đối chiếu tài liệu chính thức trước khi viết `content/exams/de/*`; ghi `scoring.verified: false` cho tới lúc đó.
6. **Thông tin thực tế dễ đổi** (Deutschlandticket, quy định Kaution, thời hạn Anmeldung, số khẩn cấp Áo/Thụy Sĩ, tên giấy phép cư trú) đã đánh dấu "cần kiểm tra" trong từng bài; nên có một lượt kiểm tra trước khi phát hành.
7. **Header `demo`/`status`/`reviewed_by`** cho file de chưa được chốt trong tài liệu này — cần quyết định chung (mục "Tiếng Đức" của `content/README.md`).
8. **Kiểm tra trùng lemma bằng máy:** quy tắc lemma bổ sung (4.1) dựa vào lint `content/de/lexicon.json` báo trùng `front.text` giữa các file item. Cần xác nhận agent viết `german-lint.mjs` có báo trùng lemma (chưa thấy trong mô tả giai đoạn 2).
