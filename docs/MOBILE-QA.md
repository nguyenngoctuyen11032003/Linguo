# Kiểm thử tay trên thiết bị thật

Chạy trước mỗi bản phát hành có thay đổi giao diện. Ghi kết quả vào PR.

## Thiết bị tối thiểu
- iPhone có Dynamic Island (iOS 17/18, Safari) và một iPhone nhỏ (SE/mini) nếu có
- Android Chrome (Android 13+) và Samsung Internet
- Một máy Android cấu hình thấp (~3 GB RAM) để kiểm tra hiệu năng blur/animation

## Checklist
- [ ] Landing: tiêu đề không bị cắt dấu (Ữ, Ặ); không cuộn ngang; CTA bấm được bằng ngón cái
- [ ] Tai thỏ / Dynamic Island không che logo; thanh home không che bottom nav
- [ ] Xoay ngang: nội dung không chui vào vùng tai thỏ hai bên
- [ ] Đăng ký → email → mở link trên cùng trình duyệt → vào app
- [ ] Bàn phím mở: ô đang nhập không bị che; iOS không tự zoom khi chạm ô nhập
- [ ] Bottom nav: 5 tab, "Thêm" mở sheet, vuốt/Escape/đóng hoạt động
- [ ] Cài đặt: đổi Sáng/Tối/Hệ thống áp dụng ngay; tải lại vẫn giữ
- [ ] Bật "Giảm chuyển động" (trong app và trong hệ điều hành): không còn trượt/mờ
- [ ] Tắt mạng: hiện banner ngoại tuyến; lưu hồ sơ báo lỗi, không báo thành công giả
- [ ] VoiceOver (iOS) / TalkBack (Android): đọc đúng nhãn nút, tab, ô nhập
- [ ] Phóng chữ 200%: không vỡ bố cục, chữ xuống dòng thay vì tràn
- [ ] "Thêm vào màn hình chính": icon đúng (không có ô ca-rô), mở vào trang chủ (đăng nhập rồi sẽ vào app)

## Offline toàn phần (PWA đã cài)
Làm trên thiết bị thật đã "Thêm vào màn hình chính", đăng nhập và đã mở app online ít nhất một lần (thấy toast "Sẵn sàng dùng ngoại tuyến" ở lần cài đầu).
- [ ] Bật chế độ máy bay, mở app từ icon màn hình chính: vào thẳng trang chủ (không về màn đăng nhập, không chờ quá vài giây), banner ngoại tuyến hiện, tên và lộ trình vẫn đúng, có dòng "Đang dùng dữ liệu đã lưu trên thiết bị"
- [ ] Để máy qua đêm (hoặc >1 giờ) rồi mở lại khi vẫn đang máy bay: vẫn đăng nhập (access token đã hết hạn nhưng phiên còn); bật mạng lại thì không bị đăng xuất và dữ liệu tự làm mới
- [ ] Wi-Fi bật nhưng không ra Internet (cổng đăng nhập Wi-Fi/modem hỏng): mở app vẫn vào được sau tối đa vài giây; không có màn hình quay vô hạn
- [ ] Mở lần đầu sau khi cài trong lúc offline và chưa từng online: hiện "Chưa có dữ liệu để học ngoại tuyến" kèm nút thử lại (không lỗi chung chung)
- [ ] Đăng xuất rồi đăng nhập tài khoản khác khi offline/online: không thấy tên hay lộ trình của tài khoản trước
- [ ] Mở trang gốc `/` từ icon đã cài khi đã đăng nhập: vào `/app`; mở trong tab trình duyệt thường vẫn thấy trang giới thiệu
- [ ] Các mục bài học, ôn tập, đồng bộ hàng đợi khi có mạng lại: xem checklist của luồng tải bài offline và hàng đợi (mục "Học bài" bên dưới)

## Học bài (spec 2)
- [ ] Mở "Học tập" → chọn bài → đi hết các bước; nút "Tiếp tục" luôn nằm trong tầm ngón cái và không bị bàn phím che
- [ ] Gõ tiếng Hàn trên bàn phím iOS, Gboard và Samsung Keyboard: nhấn Enter khi đang ghép chữ (ví dụ đang gõ 학생) không nộp bài; chữ cuối không bị mất hay nhân đôi
- [ ] Gõ tiếng Việt bằng Telex và VNI: đáp án có dấu được chấm đúng; thiếu dấu ở bài cho phép hiện "Gần đúng"
- [ ] Sai lần đầu chỉ hiện gợi ý; sai lần hai hoặc "Xem đáp án" mới hiện đáp án và lời giải thích
- [ ] Tải lại trang giữa bài: quay lại đúng bước, phản hồi đã chấm vẫn còn
- [ ] Tắt mạng rồi nộp: hiện "Đang chờ đồng bộ"; bật mạng lại thì có kết quả; không nộp trùng
- [ ] Nút back của điện thoại lùi từng bước trong bài; thoát giữa bài hiện "Tiến độ đã được lưu"
- [ ] VoiceOver / TalkBack: đọc được đề, phương án, kết quả "Chính xác / Gần đúng / Chưa đúng"; làm trọn bài không cần nhìn màu
- [ ] Nhãn "Nội dung demo — chưa kiểm duyệt" hiển thị ở trang Học tập và màn hình học bài
