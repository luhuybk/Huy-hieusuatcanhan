# Life Hub

App cá nhân để quản lý **mối quan hệ** và **công việc nhiều mảng** — chạy offline, cài được như app trên điện thoại, và khi đưa lên hosting thì có **đăng nhập bằng mật khẩu** cùng **đồng bộ giữa các thiết bị** qua máy chủ của chính bạn.

---

## Dùng thử ngay

Mở file kèm `?demo` để nạp sẵn một bộ dữ liệu mẫu đầy đủ (12 người bốn nhóm, 16 lượt trao đổi, 15 việc có lặp và chuỗi, 14 thẻ giao việc cho 4 nhân sự, 7 dịp lễ có âm lịch):

```
life-hub-standalone.html?demo
```

Chỉ nạp khi dữ liệu còn trống nên không sợ đè lên dữ liệu thật. Hoặc bấm **Dùng dữ liệu mẫu** ở màn hình chào. Xoá sạch trong Cài đặt là về trắng.

## Chạy thế nào

**Cách nhanh nhất — 1 file:** mở `life-hub-standalone.html` bằng trình duyệt. Gửi đúng file đó sang điện thoại là dùng được ngay.

**Cách đầy đủ — cả thư mục:** dựng rồi chạy máy chủ thử. Cài như app thật (biểu tượng riêng, toàn màn hình) và thông báo nhắc nhở chỉ chạy qua http/https, không chạy với `file://`:

```bash
node build.js && node serve.js
```

rồi mở `http://localhost:5199`. Trên điện thoại: mở link đó (cùng wifi, thay `localhost` bằng IP máy tính) → Chia sẻ → **Thêm vào Màn hình chính**.

---

## Đưa lên Hostinger

```bash
node build.js
```

Lệnh này tạo thư mục **`dist/`**. Upload **toàn bộ nội dung bên trong `dist/`** (không phải cả thư mục `dist`) vào `public_html` bằng File Manager hoặc FTP. Xong. Không cần PHP, không cần cơ sở dữ liệu, không cần cài gì thêm.

Muốn đặt ở đường dẫn con (`tenmien.com/lifehub/`) thì tạo thư mục đó trong `public_html` rồi bỏ nội dung vào — mọi đường dẫn đều tương đối nên chạy được ngay.

**Nhớ ba điều:**

1. **Bật SSL** trong hPanel (Hostinger cấp miễn phí). Không có `https` thì Chrome và Safari sẽ chặn cài app, chặn thông báo và chặn micro.
2. `dist/` đã kèm sẵn `.htaccess` (ép https, nén, đặt hạn bộ nhớ đệm, chặn lập chỉ mục) và `robots.txt`. File Manager của Hostinger mặc định giấu file bắt đầu bằng dấu chấm — bật **Show hidden files** để thấy và kiểm tra `.htaccess` đã lên chưa.
3. **Chỉ upload `dist/`.** Đừng upload cả thư mục dự án: `supabase-schema.sql`, `README.md`, `build.js`, `serve.js` mà nằm trên máy chủ thì ai gõ đúng đường dẫn cũng tải về đọc được.

Muốn có **đăng nhập bằng mật khẩu** và **đồng bộ điện thoại ⇄ máy tính** thì làm thêm mục [Đăng nhập & đồng bộ qua máy chủ của bạn](#đăng-nhập--đồng-bộ-qua-máy-chủ-của-bạn) bên dưới — thêm đúng một bước đổi tên file trên máy chủ.

**Cập nhật về sau:** sửa mã nguồn → `node build.js` → upload đè `dist/`. Mỗi lần dựng, `css`/`js` được gắn mã phiên bản mới nên trình duyệt và service worker tự lấy bản mới, không kẹt ở bản cũ.

**Riêng tư đến đâu:**

- *Chưa cài `api/`* — dữ liệu chỉ nằm trong trình duyệt của bạn, không có gì trên máy chủ. Người lạ mở đúng địa chỉ thấy một app trắng trơn.
- *Đã cài `api/`* — dữ liệu nằm trên máy chủ và **phải có mật khẩu mới xem được**. Người lạ mở địa chỉ chỉ thấy màn hình đăng nhập.

Trong cả hai trường hợp, mã nguồn tải về không chứa mật khẩu hay khoá nào.

---

## Cấu trúc

| File | Việc của nó |
|---|---|
| `index.html` | khung trang |
| `css/style.css` | toàn bộ giao diện |
| `js/state.js` | dữ liệu, ngày tháng, tiền tệ, migration |
| `js/lunar.js` | đổi dương ⇄ âm lịch (thuật toán Hồ Ngọc Đức) |
| `js/voice.js` | đọc thành chữ tiếng Việt |
| `js/api.js` | gọi máy chủ + màn hình đăng nhập |
| `js/sync.js` | đồng bộ (máy chủ riêng hoặc Supabase) |
| `js/notify.js` | thông báo nhắc nhở |
| `js/views.js` | dựng HTML từng màn hình |
| `js/app.js` | biểu mẫu + xử lý sự kiện |
| `sw.js`, `manifest.webmanifest` | cài như app, chạy offline |
| `api/index.php` | máy chủ: đăng nhập + đồng bộ (SQLite) |
| `api/lib.php` | phần dùng chung: dữ liệu, Telegram, bộ hẹn giờ |
| `api/cron.php` | hPanel gọi mỗi 5 phút để gửi nhắc nhở |
| `api/config.example.php` | mẫu cấu hình — chép thành `config.php` trên máy chủ |
| `tools/hash-password.js` | tạo mã mật khẩu để dán vào `config.php` |
| `icon.svg`, `assets/*.png` | biểu tượng (PNG cần cho iOS và cho thông báo) |
| `tools/make-icons.js` | sinh PNG từ `icon.svg`, không cần thư viện ngoài |
| `build.js` | tạo `dist/` + `life-hub-standalone.html` |
| `serve.js` | máy chủ thử trên máy (có giả lập luôn phần PHP) |
| `supabase-schema.sql` | chỉ cần nếu dùng cách đồng bộ cũ |

`build.js`, `serve.js`, `tools/`, `supabase-schema.sql`, `README.md` chỉ dùng lúc phát triển — `build.js` không đưa chúng vào `dist/`. Riêng `api/config.php` (chứa mã mật khẩu của bạn) cũng không bao giờ vào `dist/` và không vào git.

---

## Các màn hình

### Tổng quan
Việc đến hạn, việc giao đang trễ, sinh nhật sắp tới, ân tình chưa trả — và mục **“Hôm nay nên hỏi thăm ai”** gợi ý ba người đang bị bỏ quên lâu nhất so với chu kỳ của nhóm họ.

### Quan hệ — năm module S / S2 / A / B / C
Cuộn một mạch từ trên xuống, mỗi nhóm là một khối riêng có tiêu đề và đường ngăn, người bên trong hiển thị dạng **thẻ**.

| Nhóm | Ý nghĩa | Nhắc liên lạc |
|---|---|---|
| **S** | Ba mẹ, anh chị em, người trong nhà | 14 ngày |
| **S2** | Cô dì chú bác, họ hàng gần | 21 ngày |
| **A** | Thân hơn bạn bè, chưa tới mức gia đình | 30 ngày |
| **B** | Bạn bè, đồng nghiệp thân thiết | 60 ngày |
| **C** | Có qua lại nhưng không quá sâu | 150 ngày |

**S** và **S2** tách ra vì không phải người nhà nào cũng ở cùng khoảng cách: ba mẹ khác cô dì chú bác, cả về mức độ hỏi thăm lẫn mức quà app gợi ý (S 1tr · S2 800k).

Vòng tròn trên mỗi thẻ là **điểm chăm sóc 0–100**: 100 là vừa liên lạc, tụt dần theo số ngày im lặng so với chu kỳ của nhóm. Trong mỗi nhóm, người có điểm thấp nhất được xếp lên trước — nhìn là biết ai đang bị bỏ quên.

Đổi nhóm bất cứ lúc nào, mỗi lần đổi đều được ghi vào lịch sử.

**Nhật ký gặp gỡ:** mỗi lần cà phê / gọi điện / được giúp đỡ, ghi một dòng. Hiện thành dòng thời gian trong trang từng người và tự cập nhật ngày liên lạc gần nhất.

**Sổ trao đổi:** ghi món họ tặng kèm giá ước tính → tick ô vuông để khai mình đã trả lại bằng gì, bao nhiêu, ngày nào. App tự tính phần còn nợ.
Ô nhập tiền hiểu: `300k` · `1tr2` · `1,5tr` · `1tr250` · `250.000` · `2 tỷ`.

### Công việc
- **Việc cần làm** — tự chia Quá hạn / Hôm nay / Sắp tới / Không hạn.
- **Việc lặp lại** — hàng ngày, cách ngày, hàng tuần, 2 tuần, hàng tháng, mỗi quý, nửa năm, hàng năm. Tick xong là hạn tự nhảy sang kỳ kế tiếp, kèm **chuỗi 🔥** đếm số kỳ làm đúng hẹn liên tiếp (bỏ lỡ thì chuỗi về 0). Nếu bỏ lỡ nhiều kỳ, app nhảy thẳng tới mốc sắp tới chứ không dồn việc.
- **Ý tưởng** — nội dung và hướng triển khai tách riêng, có nút đưa thẳng lên bảng giao việc.

### Giao việc
Bốn cột: **Lên ý tưởng → Đã giao việc → Đang làm → Hoàn thành**. Mỗi thẻ có nút chuyển cột ngay trên thẻ. Dưới bảng là tiến độ theo từng người.

**Việc ngoài luồng.** Trong thẻ có ô *Loại việc* — chọn "Ngoài luồng — cần chi thêm" cho những việc giao ngoài nhiệm vụ thường ngày, kèm số tiền công hoặc thưởng dự tính. Thẻ sẽ mang nhãn ⌁ vàng trên bảng, chuyển xanh khi đã trả.

Bên dưới bảng có khối **Việc ngoài luồng · tiền cần chi thêm**: tổng chưa trả / đã trả, gom theo từng người, tick ô vuông khi đã đưa tiền, hoặc bấm *Trả hết* để chốt một lần cho cả người đó. Số còn nợ cũng hiện trong *Ôn lại tuần* để cuối tuần không quên thanh toán.

Cơ chế giống hệt sổ ân tình bên Quan hệ, chỉ khác là với nhân viên.

### Hồ sơ nhân viên
Cài đặt → Nhân sự, hoặc chạm tên người trong khối *Tiến độ theo người* dưới bảng. Mỗi nhân sự có: vai trò, **mảng việc phụ trách** (chọn được nhiều), điện thoại, **sinh nhật**, ngày vào làm, ghi chú riêng.

Sinh nhật nhân viên hiện chung với sinh nhật người quen ở màn Tổng quan, trên lịch tháng, và trong bản tóm tắt gửi Telegram — có nhãn *(nhân viên)* để bạn biết đường chuẩn bị quà.

Trang hồ sơ gom lại: tổng việc / đang làm / đã xong / đang trễ, tỉ lệ hoàn thành, **tỉ lệ xong đúng hạn**, toàn bộ tiền ngoài luồng đã và chưa trả, và danh sách việc nhóm theo cột. Có nút giao việc thẳng cho người đó.

Hai điều về cách tính:
- *Đúng hạn* chỉ chấm trên những thẻ có **cả hạn chót lẫn mốc hoàn thành** (mốc này được ghi khi bạn chuyển thẻ sang cột Hoàn thành trong app). Thẻ cũ nhập tay không có mốc thì không bị tính, và app nói rõ "chưa đủ dữ liệu" thay vì đưa ra con số sai.
- Thẻ việc gắn với nhân viên **theo tên**. Đổi tên trong hồ sơ thì app tự cập nhật tất cả thẻ cũ, nhưng nếu bạn sửa tên bằng cách xoá rồi tạo lại thì các thẻ cũ sẽ mồ côi.

### Sổ tiền
Gom mọi khoản tiền đã ghi rải rác trong app về một dòng chảy theo tháng:

- **Chi** — quà mình tặng, món trả lại trong sổ ân tình, và tiền ngoài luồng đã trả cho nhân viên.
- **Nhận** — quà người khác trao mình (không phải tiền mặt, chỉ để đối chiếu đang nợ hay dư).

Có biểu đồ 12 tháng (phần tím là quan hệ, xanh là nhân viên — chạm cột để nhảy tới tháng đó), so với tháng trước và **so với cùng kỳ năm ngoái**.

Phần đáng giá nhất là **Chi theo dịp trong năm**: ví dụ *"Tết · 3 người · trung bình 1,9tr · tổng 5,8tr"*. Trước Tết mở ra là biết năm ngoái tiêu bao nhiêu để đặt ngân sách, thay vì tiêu tới đâu hay tới đó.

### Hộp ghi nhanh
Nút ✎ trên thanh đầu, hoặc <kbd>Ctrl/Cmd</kbd> + <kbd>J</kbd>. Một ô duy nhất: gõ một câu (hoặc bấm 🎤 nói) rồi <kbd>Enter</kbd> là xong — không phải chọn mảng, hạn hay loại. **Lưu & ghi tiếp** giữ ô mở để trút liền mấy ý.

Lúc rảnh vào *Hộp ghi nhanh* đẩy từng mẩu về đúng chỗ, mỗi mẩu một hàng nút:

| Chuyển thành | Nhận được gì |
|---|---|
| **Việc** | dòng đầu thành tên việc, phần còn lại thành ghi chú |
| **Ý tưởng** | dòng đầu thành tên, phần còn lại thành nội dung |
| **Giao việc** | thành thẻ ở cột Lên ý tưởng |
| **Nhật ký** | chọn người, cả mẩu thành một dòng nhật ký gặp gỡ, tự cập nhật ngày liên lạc |

Mẩu nào không cần chuyển thì bấm *Xong, khỏi chuyển*. Số mẩu chờ hiện thành huy hiệu ở thanh bên và một khối nhắc trên Tổng quan, để hộp không bị bỏ quên.

Lý do có màn này: ma sát lúc nhập là chỗ các app kiểu này chết. Nghĩ ra ý tưởng lúc đang lái xe mà phải mở form chọn năm thứ thì thà không ghi — rồi quên luôn.

### Lịch tháng
Việc đến hạn, thẻ giao việc, dịp lễ và sinh nhật nằm chung trên một lưới lịch, tuần bắt đầu từ Thứ 2. Mỗi ô có **số ngày âm** nhỏ bên cạnh ngày dương.

Việc lặp lại được **chiếu tới trước** trong tháng đang xem — nhìn là biết tuần sau có gì, dù bạn mới chỉ tạo nó một lần. Các kỳ lặp tương lai hiển thị mờ hơn để phân biệt với kỳ hiện tại.

Ô hẹp nên chỗ hiển thị có hạn: dịp và sinh nhật luôn được xếp lên trước, việc lặp hằng ngày xuống sau, để thứ quan trọng không bị đẩy khuất. Trên điện thoại mỗi ô rút gọn thành các chấm màu theo mảng.

Chạm một ngày để xem đầy đủ bên dưới, và có nút thêm việc thẳng vào đúng ngày đó.

**Tick xong việc ngay trên lịch.** Việc thường tick là xong; việc lặp tick là hoàn thành kỳ hiện tại (hạn nhảy sang kỳ sau, chuỗi 🔥 +1); thẻ giao việc tick là chuyển thẳng sang cột Hoàn thành, bỏ tick thì quay lại Đang làm.

Hai trường hợp cố ý **không** có ô tick, để tránh làm hỏng chuỗi và ngày hạn:
- *Kỳ lặp sắp tới* (ví dụ buổi gym của thứ Tư khi hôm nay mới thứ Hai) — chỉ hiện chấm màu.
- *Buổi đã làm xong trong quá khứ* — đây là bản ghi lịch sử, không phải việc đang chờ.

Nhờ bản ghi lịch sử đó, lịch cho thấy cả những buổi bạn **đã thật sự làm** chứ không chỉ kế hoạch sắp tới — nhìn lại tháng là biết mình tập được bao nhiêu buổi.

### Dịp & lễ
Giỗ, Tết, kỷ niệm cưới, 20/11… lặp lại mỗi năm. Chọn **âm lịch** cho giỗ và Tết — app tự quy ra ngày dương từng năm bằng thuật toán âm lịch Việt Nam (múi giờ +7), không cần nhập lại hằng năm.

Có sẵn 15 lễ Việt thường gặp để thêm bằng một chạm. Mỗi dịp gắn được nhiều người, và với mỗi người app **gợi ý mức quà**:

1. Đã từng tặng người đó vào đúng dịp này → lấy mức lần trước.
2. Chưa từng → lấy trung bình bạn đã tặng người đó.
3. Chưa tặng bao giờ → mức mặc định theo nhóm (S 1tr · A 700k · B 400k · C 200k).
4. Nếu đang **nợ ân tình** nhiều hơn mức trên → nâng lên cho bằng phần đang nợ.

Số cuối được làm tròn cho đẹp và luôn kèm lý do ("lần trước tặng 500k", "đang nợ 950k ân tình") — nó gợi ý chứ không quyết thay bạn.

### Ôn lại tuần
Bảy ngày qua: việc đã xong, việc đang trễ, ai đã hỏi thăm, ai đang bị bỏ quên, còn nợ ân tình ai — kèm ba câu tự vấn.

**Cân bằng giữa các mảng** — thanh phân bổ cho thấy 7 ngày qua bạn dồn sức vào đâu, tính bằng "lượt chạm": việc hoàn thành + thẻ giao việc động tới + nhật ký gặp gỡ với người thuộc mảng đó. Mảng nào còn việc đang mở mà cả tuần không đụng tới sẽ bị gắn cờ đỏ. Đây là chỗ để phát hiện "cả tuần chỉ lo Barbershop, Gym bỏ không".

---

## Tìm kiếm toàn cục

Nút 🔍 trên thanh đầu, hoặc phím tắt <kbd>Ctrl/Cmd</kbd> + <kbd>K</kbd>. Tìm xuyên **người, việc, ý tưởng, thẻ giao việc, dịp lễ và cả sổ trao đổi**, kết quả gom theo nhóm, Enter để nhảy vào kết quả đầu.

Tìm **không dấu vẫn ra**: gõ `tuan` ra "Trần Minh Tuấn", `do my linh` ra "Đỗ Mỹ Linh", `tet` ra Tết Nguyên Đán và các món quà Tết. Nội dung nhật ký gặp gỡ cũng được tìm — gõ `xuong` là ra người mà bạn từng ghi "đang tính mở xưởng".

## Mảng việc (tag)

Tạo trong thanh bên: Gym, Barbershop, Kinh doanh online, Cá nhân… Gán cho việc, ý tưởng, thẻ giao việc và cả người. Bấm vào một mảng ở thanh bên là **lọc toàn bộ** Tổng quan / Công việc / Giao việc theo mảng đó.

Riêng màn Quan hệ không bị lọc — bốn vòng tròn luôn hiện đủ, vì quan hệ không thuộc về mảng kinh doanh nào. Mảng của một người vẫn hiện trên thẻ và tìm kiếm được.

---

## Ghi bằng giọng nói

Ô nhật ký gặp gỡ, ghi chú người, mô tả ý tưởng và mô tả thẻ việc đều có nút 🎤. Bấm rồi nói tiếng Việt, chữ chạy thẳng vào ô; bấm ■ để dừng. Vừa rời quán cà phê, đọc 10 giây là xong một dòng nhật ký.

Dùng Web Speech API có sẵn của trình duyệt: Chrome, Edge, Safari mới đều chạy; Firefox chưa hỗ trợ nên nút tự ẩn. Lần đầu trình duyệt sẽ hỏi quyền micro. Nhận dạng chạy qua dịch vụ của trình duyệt (với Chrome là máy chủ Google) — nếu bạn ngại điều đó thì cứ gõ tay như bình thường.

## Thông báo nhắc nhở

Cài đặt → Nhắc nhở → Bật, chọn giờ. Mỗi ngày một thông báo tóm tắt: việc đến hạn, **dịp sắp tới**, sinh nhật, việc giao trễ, người lâu chưa hỏi thăm.

**Giới hạn cần biết:** đây là thông báo cục bộ, không có máy chủ đẩy. Nó chỉ bắn khi app đang mở hoặc đang chạy nền. Nếu cả ngày không mở app thì sẽ không có thông báo — mở ra là thấy đủ trong màn Tổng quan. Trên iPhone bắt buộc phải “Thêm vào Màn hình chính” trước.

---

## Thông báo Telegram

Khác hẳn thông báo trong máy: cái này do **máy chủ** gửi, nên tin vẫn tới kể cả khi bạn đã tắt app, tắt trình duyệt, tắt máy. Cần cài `api/` theo mục trên trước.

### Cài lần đầu

**1. Tạo bot**

Nhắn **@BotFather** trên Telegram → `/newbot` → đặt tên → chép mã bot (dạng `123456:AAE…`).

**2. Cho bot vào group**

Thêm bot vào group của bạn và cho quyền gửi tin. Nếu group có bật **Topics** (nhánh), vào đúng nhánh bạn muốn nhận tin rồi **nhắn một câu bất kỳ** — bước này quan trọng, vì bot chỉ "nhìn thấy" group sau khi có tin nhắn.

**3. Nối vào app**

Cài đặt → Thông báo Telegram → **Cài đặt**:

- Dán mã bot
- Bấm **Dò group** — app tự điền ID group và số nhánh
- Chọn giờ gửi bản tóm tắt hằng ngày (để trống thì không gửi)
- Bấm **Gửi thử** để chắc tin vào đúng nhánh
- **Lưu cấu hình**

**4. Hẹn giờ cho máy chủ — đừng bỏ bước này**

Vào hPanel → **Cron Jobs**, tạo lịch chạy **mỗi 5 phút** với lệnh app hiện sẵn trong Cài đặt:

```
/usr/bin/php /home/uXXXXXXXX/public_html/api/cron.php
```

Gói hosting nào chỉ cho gọi bằng đường link thì dùng địa chỉ `cron.php?key=…`, cũng hiện ngay bên dưới lệnh đó.

Chưa làm bước 4 thì lời nhắc vẫn hiện đầy đủ trong app nhưng **sẽ không có tin nào chạy vào Telegram**.

### Nhắc lặp lại theo thứ và giờ

Cài đặt → **Nhắc lặp lại** → **+ Thêm**. Mỗi lời nhắc gồm: nội dung, giờ, những thứ trong tuần, nhánh riêng (nếu muốn tin này vào nhánh khác), và ghi chú thêm.

Đúng ví dụ bạn nói: *Tập gym · T2·T3·T5·T6·T7 · 18:30* — app hiển thị gọn thành `T2 · T3 · T5 · T6 · T7 lúc 18:30`. Chọn cả 7 thứ thì nó rút thành "hằng ngày", chọn T2→T6 thì thành "thứ 2 → thứ 6".

Nút ➤ bên phải mỗi dòng gửi thử ngay lập tức. Ô vuông bên trái bật/tắt nhanh mà không cần mở ra sửa.

**Về giờ giấc:** máy chủ tính theo giờ Việt Nam. Cron chạy 5 phút một lần nên lời nhắc đặt 18:30 sẽ tới trong khoảng 18:30–18:35. Nếu máy chủ trục trặc và trễ **quá một tiếng** thì app bỏ luôn lần đó chứ không gửi muộn — nhắc "tập gym 18:30" vào lúc 22h chỉ gây khó chịu. Mỗi lời nhắc chỉ gửi một lần mỗi ngày, cron chạy lại bao nhiêu lần cũng không gửi trùng.

### Bản tóm tắt hằng ngày

Gửi một lần mỗi ngày vào giờ bạn chọn, gồm: việc đến hạn (kèm số việc đã trễ), sinh nhật hôm nay và trong 7 ngày tới (cả người quen lẫn nhân viên), dịp và giỗ sắp tới theo số ngày báo trước của từng dịp, việc đã giao đang trễ, và tiền công ngoài luồng còn nợ.

Máy chủ tự tính từ dữ liệu đã đồng bộ nên vẫn đúng dù bạn cả tuần không mở app. Riêng ngày âm lịch được app tính sẵn mỗi lần bạn mở lên rồi gửi kèm — nên nếu bạn không mở app suốt nhiều tháng, ngày giỗ có thể lệch một năm cho tới lần mở kế tiếp.

> **Mã bot để ở đâu:** trong cơ sở dữ liệu trên máy chủ, không nằm trong `config.php`, không đồng bộ xuống máy nào, và API không bao giờ trả nó về trình duyệt — màn hình Cài đặt chỉ biết "đã có mã" hay chưa. Ai cầm được mã bot là nhắn được vào group của bạn, nên nó không đi lung tung.

---

## Đăng nhập & đồng bộ qua máy chủ của bạn

Đây là cách nên dùng khi app đã nằm trên Hostinger: dữ liệu ở máy chủ, muốn xem phải nhập mật khẩu, điện thoại và máy tính thấy cùng một thứ.

### Cài lần đầu (làm một lần)

**1. Tạo mã mật khẩu ở máy bạn**

```bash
node tools/hash-password.js
```

Gõ mật khẩu bạn muốn. Nó in ra một dòng `define('LH_PASSWORD', 'pbkdf2_sha256$…');`. Mật khẩu thật không đi đâu cả — dòng này chỉ là mã băm, từ đó không suy ngược lại được.

**2. Dựng và upload**

```bash
node build.js
```

Upload nội dung `dist/` vào `public_html` như thường. Trong đó đã có sẵn thư mục `api/`.

**3. Tạo file cấu hình trên máy chủ**

Trong File Manager của Hostinger, vào `public_html/api/`:

- Đổi tên `config.example.php` → `config.php`
- Mở nó ra, thay dòng `define('LH_PASSWORD', 'DAN_MA_VAO_DAY');` bằng dòng bạn vừa tạo ở bước 1
- Lưu lại

Xong. Mở app trên trình duyệt, nó sẽ hỏi mật khẩu.

### Kiểm tra nhanh sau khi upload

1. Mở app → phải thấy màn hình nhập mật khẩu, không thấy dữ liệu.
2. Gõ sai một lần → phải báo *"Sai mật khẩu. Còn 7 lần thử."* Nếu báo *"Chưa có api/config.php"* thì bước 3 chưa xong.
3. Đăng nhập → vào được → Cài đặt → **Xem máy chủ**, phải hiện số bản ghi.
4. Mở trên điện thoại, đăng nhập → dữ liệu phải hiện đầy đủ.

### Cách nó chạy

- Dữ liệu vẫn nằm trong máy để app mở nhanh và chạy được khi mất mạng, nhưng bản gốc ở máy chủ.
- Mỗi bản ghi có mốc thời gian riêng, ai sửa sau thì bản đó thắng. Xoá là đánh dấu xoá nên xoá ở máy này sẽ lan sang máy kia.
- Đẩy lên sau mỗi thay đổi 2,5 giây; kéo về mỗi 45 giây, mỗi lần mở lại app và mỗi lần có mạng trở lại.
- Phiên đăng nhập sống 60 ngày. Mất mạng thì vẫn mở được app trong khoảng đó; **hết hạn mà vẫn mất mạng thì phải nhập lại mật khẩu** — không có đường vòng.

### Đổi mật khẩu

Chạy lại `node tools/hash-password.js`, thay dòng đó trong `api/config.php`, upload đè. Các máy đang đăng nhập vẫn giữ phiên; muốn đá hết ra thì bấm **Đăng xuất mọi thiết bị** trong Cài đặt.

### Đăng xuất

Cài đặt → Đăng xuất, chọn một trong hai:

- **Chỉ đăng xuất** — giữ bản sao trên máy, lần sau mở rất nhanh.
- **Đăng xuất và xoá dữ liệu trên máy này** — dùng khi mượn máy người khác. Dữ liệu trên máy chủ không mất, đăng nhập lại là tải về đủ.

### Sao lưu dữ liệu trên máy chủ

Tải file `api/data/lifehub.sqlite` về bằng File Manager. Hoặc dùng Cài đặt → **Xuất sao lưu** trong app cho nhanh.

> **Nói thẳng về mức bảo vệ:** mật khẩu do máy chủ kiểm, lưu dạng PBKDF2-SHA256 210.000 vòng, sai quá 8 lần thì khoá IP 15 phút. Phiên giữ trong cookie HttpOnly nên JavaScript không đọc được. Như vậy là đủ chắc cho một app cá nhân. Nhưng nó **không** phải hệ thống nhiều người dùng có phân quyền, và không có xác thực hai lớp. Bắt buộc bật SSL — không có https thì mật khẩu đi qua mạng ở dạng trần.

**Nếu hosting không bật `pdo_sqlite`:** app sẽ báo thẳng ra ở màn đăng nhập. Lúc đó vào hPanel → PHP Configuration bật extension đó lên, hoặc nhắn tôi để chuyển `api/index.php` sang MySQL (đổi vài dòng kết nối, phần còn lại giữ nguyên).

---

## Đồng bộ qua Supabase (cách cũ, không bắt buộc)

Cách này có từ trước khi có máy chủ riêng. Nếu bạn đã cài api/ theo mục trên thì bỏ qua hẳn phần này — app tự ưu tiên máy chủ của bạn.

1. Tạo project trên [supabase.com](https://supabase.com) (bản miễn phí là đủ).
2. Vào **SQL Editor** → dán toàn bộ `supabase-schema.sql` → **Run**.
3. Vào **Project Settings → API**, chép **Project URL** và **anon public key**.
4. Trong app: Cài đặt → Đồng bộ → dán URL + key, bấm **Tạo tên ngẫu nhiên** cho ô không gian → **Lưu & kết nối**.
5. Máy thứ hai: nhập đúng ba giá trị đó là dữ liệu chảy về.

Cách trộn: mỗi bản ghi có mốc thời gian riêng, ai sửa sau thì bản đó thắng. Xoá là đánh dấu xoá chứ không mất hẳn, nên xoá ở máy này sẽ lan sang máy kia. Đẩy lên sau mỗi thay đổi 2,5 giây, kéo về mỗi 45 giây và mỗi lần mở lại app.

### Cho nhân viên tự cập nhật tiến độ
Cài đặt → Nhân sự → bấm 🔗 cạnh tên → gửi link cho họ. Mở link là máy họ tự cấu hình, chỉ thấy **bảng việc của riêng họ**, không thấy phần quan hệ hay việc cá nhân.

> **Về bảo mật, nói thẳng:** mô hình ở đây là “ai biết tên không gian + anon key thì đọc ghi được không gian đó”, giống một link chia sẻ bí mật. Không có đăng nhập riêng cho từng người. Vì vậy hãy dùng nút tạo tên ngẫu nhiên (schema đã chặn tên dưới 8 ký tự) và chỉ gửi link cho người bạn tin. Nếu sau này cần chặt chẽ hơn thì phải thêm Supabase Auth và viết lại policy theo `auth.uid()`.

---

## Sao lưu

Cài đặt → **Xuất sao lưu (.json)**. Nên làm mỗi tháng một lần.
Xoá dữ liệu trình duyệt hoặc gỡ app = mất dữ liệu nếu chưa bật đồng bộ.
