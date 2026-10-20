# Hướng dẫn: cấp quyền giáo viên đầu tiên và dùng công cụ lớp học

Tài liệu cho chủ dự án (admin). Làm theo thứ tự: A (cấp quyền) → B (giáo viên tạo lớp, giao bài) → C (học viên vào lớp) → D (kiểm tra và xử lý sự cố). Chi tiết kỹ thuật: [DEPLOY.md](DEPLOY.md) mục *Giáo viên*, [FEATURES.md](FEATURES.md) mục 20.

Địa chỉ site: `https://nguyenngoctuyen11032003.github.io/Linguo/`

## Quyền giáo viên là gì

- Giáo viên là một quyền riêng, **tách khỏi** vai trò quản trị (`editor`/`reviewer`/`admin`). Một người có thể chỉ là giáo viên, chỉ là admin, hoặc cả hai.
- Giáo viên vào được khu `/giao-vien`: tạo lớp, tạo mã mời, giao bài, xem bảng tổng hợp lớp.
- Giáo viên **chỉ thấy số liệu tổng hợp** của học viên đang ở trong lớp (chuỗi ngày, phút hoạt động, số bài xong, thẻ đến hạn, tỉ lệ đúng khi ôn, mức hoàn thành bài giao). Không thấy đáp án, hội thoại AI, từ vựng cá nhân hay email.

## A. Cấp quyền giáo viên đầu tiên

### Chuẩn bị (kiểm tra một lần)

1. **Người sẽ làm giáo viên đã đăng nhập Linguo ít nhất một lần** (nếu chưa, bảo họ đăng ký/đăng nhập, rồi mới cấp). Ghi lại email họ dùng để đăng nhập.
2. **Bạn có vai trò `admin`.** Mở `https://nguyenngoctuyen11032003.github.io/Linguo/quan-tri/nhan-su` sau khi đăng nhập:
   - Thấy trang **Nhân sự** → bạn đã là admin, sang bước "Cách 1".
   - Thấy trang 404 → bạn chưa có vai trò admin: làm mục "Bootstrap admin" ngay dưới đây.
3. Database production đã áp các migration `20261017000400_teacher_tools.sql` và `20261018150000_admin_teachers.sql` (cả hai đã được ghi trong `supabase/migrations-applied.json`, tức đã áp lên production).

### Bootstrap admin (chỉ khi chưa có admin nào)

Supabase Dashboard → project Linguo → **SQL Editor**, đổi email rồi chạy:

```sql
insert into public.staff_roles (user_id, role)
select id, 'admin' from auth.users where email = 'email-cua-ban@example.com'
on conflict (user_id) do update set role = excluded.role, granted_at = now();
```

Đăng xuất rồi đăng nhập lại, mở `/quan-tri` để kiểm tra.

### Cách 1 (nên dùng): trên giao diện, có ghi nhật ký

1. Đăng nhập bằng tài khoản admin, vào `/quan-tri` → menu **Nhân sự** (`/quan-tri/nhan-su`).
2. Ở ô **Email hoặc mã người dùng**, nhập email chính xác của giáo viên (khớp hoàn toàn) rồi tìm.
3. Thẻ kết quả ghi **Quyền giáo viên: Chưa có** → bấm **Cấp quyền giáo viên**.
4. Kéo xuống phần **Giáo viên**: người vừa cấp xuất hiện kèm email, người cấp, ngày cấp, số lớp đang mở (0).
5. Mục **Nhật ký** (`/quan-tri/nhat-ky`) có dòng `grant_teacher` ghi lại thao tác.
6. Bảo giáo viên **tải lại trang** (hoặc đăng xuất rồi đăng nhập lại): thanh điều hướng có thêm mục **Lớp học (giáo viên)**, trỏ tới `/giao-vien`.

Thu hồi: phần **Giáo viên** → nút **Thu hồi** → xác nhận. Lớp cũ vẫn còn và học viên vẫn thấy lớp, bài giao; giáo viên chỉ không mở được `/giao-vien` cho tới khi được cấp lại.

### Cách 2 (dự phòng): bằng SQL

Dùng khi chưa có admin hoặc trang Nhân sự không dùng được. Không ghi nhật ký. Supabase → SQL Editor:

```sql
insert into public.teacher_profiles (user_id)
select id from auth.users where email = 'giaovien@example.com'
on conflict (user_id) do nothing;

-- kiểm tra
select t.granted_at, u.email from public.teacher_profiles t join auth.users u on u.id = t.user_id;
```

### Ghi nhận đã cấp

Sau khi cấp xong, ghi vào [HANDOFF.md](superpowers/HANDOFF.md) mục 4 (đổi dòng "cấp quyền giáo viên đầu tiên" thành đã làm, kèm ngày). Việc cấp quyền là thao tác trên dữ liệu production nên không nằm trong git; bằng chứng là dòng `grant_teacher` ở **Nhật ký** hoặc câu SQL kiểm tra ở trên.

## B. Giáo viên dùng công cụ lớp học

Vào `/giao-vien` (mục **Lớp học (giáo viên)**).

### 1. Tạo lớp

1. Bấm **Tạo lớp đầu tiên** (hoặc **Tạo lớp**). Điền **Tên lớp** và chọn **ngôn ngữ** của lớp (en, ko, ja, de).
2. Ngôn ngữ **không đổi được sau khi tạo** (bài giao và tiến độ đều theo ngôn ngữ). Tên lớp thì đổi được bằng **Đổi tên lớp**.
3. Bấm vào thẻ lớp để mở trang lớp. Trang có ba phần: **Mã mời**, **Bài giao**, **Bảng tổng hợp**.

### 2. Mời học viên

1. Phần **Mã mời** → **Tạo mã mời**.
2. Chọn **Hiệu lực trong** (1–720 giờ, mặc định 7 ngày) và, tuỳ chọn, **Giới hạn số học viên dùng mã**.
3. Gửi mã 8 ký tự (hoặc liên kết `…/app/lop-hoc/tham-gia?ma=<mã>`) cho học viên qua Zalo/email. Mỗi lớp có tối đa 10 mã còn hiệu lực. Mã lộ ra ngoài thì bấm **Thu hồi**.
4. Liên kết mời chỉ điền sẵn mã; học viên vẫn phải tự bấm **Tham gia lớp**.

### 3. Giao bài

1. Phần **Bài giao** → **Giao bài cho lớp**.
2. Chọn một trong ba loại:
   - **Bài học**: học viên hoàn thành một bài trong lộ trình (chỉ liệt kê bài đã xuất bản của ngôn ngữ lớp).
   - **Đề luyện thi**: học viên nộp một lượt làm đề (mở đúng đề trong trang Luyện thi; học viên vẫn tự chọn chế độ thi).
   - **Lượt ôn**: học viên chấm đủ số thẻ ôn tập đã đặt (**Số lượt ôn cần chấm**).
3. Tuỳ chọn: **Hạn hoàn thành**, **Lời nhắn cho học viên**.
4. Mức hoàn thành được tính **tự động** từ việc học của học viên, và chỉ tính việc làm **từ lúc giao bài trở đi**. Xoá bài giao thì nó biến khỏi danh sách của học viên nhưng kết quả học vẫn được giữ.

### 4. Theo dõi lớp

Phần **Bảng tổng hợp** liệt kê từng học viên: chuỗi ngày, phút hoạt động, số bài xong, thẻ đến hạn, tỉ lệ đúng khi ôn, và hoàn thành bài giao ("Chưa học" nếu chưa có hoạt động). Nút **Xoá học viên khỏi lớp** có hỏi xác nhận.

### Giới hạn

30 lớp đang hoạt động mỗi giáo viên · 200 học viên mỗi lớp · 10 mã mời còn hiệu lực mỗi lớp · 300 bài giao mỗi lớp · học viên vào tối đa 20 lớp và nhập mã tối đa 10 lần mỗi giờ (nhập sai cũng tính).

**Lưu trữ lớp** (nút trên trang lớp) đưa lớp xuống nhóm riêng; muốn tạo mã mời hoặc giao bài lại thì bấm **Khôi phục lớp** trước.

## C. Học viên vào lớp

1. Đăng nhập Linguo → **Lớp học** (`/app/lop-hoc`) → ô **Mã lớp** → **Tham gia lớp** (cần có mạng).
2. Danh sách lớp hiện bài giao kèm trạng thái hoàn thành; thẻ **Lớp học** ở trang chủ dẫn tới danh sách này.
3. Bài giao dạng đề thi có nút **Làm đề**. Nếu lộ trình đang mở khác ngôn ngữ của lớp, học viên phải đổi lộ trình trước (trang Luyện thi sẽ báo không mở được đề).
4. Rời lớp bất cứ lúc nào bằng **Rời lớp**: giáo viên hết thấy dữ liệu của họ ngay. Trang có ghi chú nói rõ giáo viên thấy những gì.

## D. Kiểm tra nhanh và sự cố

Thử trọn vòng bằng hai tài khoản (giáo viên và một học viên thử): tạo lớp → tạo mã → học viên tham gia → giao một bài học → học viên làm xong bài → giáo viên thấy mức hoàn thành tăng ở **Bảng tổng hợp**.

| Hiện tượng | Nguyên nhân thường gặp |
|---|---|
| `/quan-tri/nhan-su` ra 404 | Tài khoản chưa có vai trò admin (xem Bootstrap admin) |
| Tìm email không ra | Email phải khớp chính xác; người đó chưa đăng nhập Linguo lần nào |
| Phần **Giáo viên** báo không tải được | Migration `20261018150000_admin_teachers.sql` chưa áp lên production |
| Giáo viên không thấy mục **Lớp học (giáo viên)** | Chưa tải lại trang/đăng nhập lại sau khi được cấp; hoặc quyền đã bị thu hồi |
| Mã mời báo không hợp lệ | Mã hết hạn, đã thu hồi, hết lượt dùng, hoặc người nhập đã nhập quá 10 lần trong một giờ |
| Học viên không thấy đề được giao | Đề không còn xuất bản, hoặc khác ngôn ngữ lộ trình đang mở |
