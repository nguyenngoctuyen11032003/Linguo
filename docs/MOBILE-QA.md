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
- [ ] "Thêm vào màn hình chính": icon đúng (không có ô ca-rô), mở vào /app
