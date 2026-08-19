# Định dạng nhị phân `.cpfont` (v4)

> **Nguồn tham chiếu:**
> - Python tool: [`fontconvert_sdcard.py`](file:///media/brianhuster/D/Projects/crosspoint-tools/scripts/font-builder/fontconvert_sdcard.py)
> - JS port: [`fontConvert.js`](file:///media/brianhuster/D/Projects/crosspoint-font-builder/fontConvert.js)
> - Version: [`cpfont_version.py`](file:///media/brianhuster/D/Projects/crosspoint-tools/scripts/font-builder/cpfont_version.py) → `CPFONT_VERSION = 4`

---

## 1. Tổng quan

File `.cpfont` là định dạng nhị phân **little-endian** dùng để lưu trữ dữ liệu bitmap font đã được rasterize sẵn (pre-rasterized) cho thiết bị đọc sách CrossPoint. Thiết bị đọc trực tiếp từ file này mà không cần tính toán lại, giúp tốc độ render chữ nhanh tối đa trên màn hình E-ink.

Một file `.cpfont` chứa **một hoặc nhiều style** (Regular, Bold, Italic, BoldItalic) của cùng một kích thước font (ví dụ: `Literata_16.cpfont` chứa cả 4 style ở 16pt).

**Bố cục tổng thể của file:**

```
[Global Header]         32 bytes
[Style TOC Entry 0]     32 bytes  ─┐
[Style TOC Entry 1]     32 bytes   │ styleCount × 32 bytes
...                                ┘
[Style 0 Data Sections]            ─┐
[Style 1 Data Sections]             │ Nối tiếp nhau, không có padding
...                                 ┘
```

---

## 2. Global Header (32 bytes)

**Python format string:** `<8sHHB19s`

| Offset | Size | Type | Tên | Giá trị |
|--------|------|------|-----|---------|
| 0 | 8 | bytes | `magic` | `CPFONT\x00\x00` (ASCII + 2 null bytes) |
| 8 | 2 | uint16 | `version` | `4` |
| 10 | 2 | uint16 | `flags` | `1` = 2-bit grayscale |
| 12 | 1 | uint8 | `styleCount` | Số style trong file (1–4) |
| 13 | 19 | bytes | *(reserved)* | `\x00 × 19` |

> [!IMPORTANT]
> Magic bytes phải là chính xác `43 50 46 4F 4E 54 00 00` (`CPFONT\x00\x00`). Firmware kiểm tra magic trước tiên — sai magic → file bị từ chối.

---

## 3. Style TOC Entry (32 bytes mỗi entry)

**Python format string:** `<B3xIIBhhHHBBBI4x`

Có `styleCount` entry, nối tiếp nhau ngay sau Global Header.

| Offset | Size | Type | Tên | Mô tả |
|--------|------|------|-----|-------|
| 0 | 1 | uint8 | `styleId` | `0`=Regular, `1`=Bold, `2`=Italic, `3`=BoldItalic |
| 1 | 3 | — | *(pad)* | 3 bytes căn lề |
| 4 | 4 | uint32 | `intervalCount` | Số khoảng Unicode trong style này |
| 8 | 4 | uint32 | `glyphCount` | Tổng số glyph trong style này |
| 12 | 1 | uint8 | `advanceY` | Chiều cao dòng (line height) tính bằng pixel nguyên |
| 13 | 2 | int16 | `ascender` | Chiều cao ascender tính bằng pixel nguyên |
| 15 | 2 | int16 | `descender` | Chiều sâu descender (thường âm) tính bằng pixel nguyên |
| 17 | 2 | uint16 | `kernLeftCount` | Số entry trong bảng kern left |
| 19 | 2 | uint16 | `kernRightCount` | Số entry trong bảng kern right |
| 21 | 1 | uint8 | `kernLeftClassCount` | Số class kern left |
| 22 | 1 | uint8 | `kernRightClassCount` | Số class kern right |
| 23 | 1 | uint8 | `ligatureCount` | Số cặp ligature |
| 24 | 4 | uint32 | `dataOffset` | Offset tuyệt đối (byte) trong file tới section đầu tiên của style này |
| 28 | 4 | — | *(reserved)* | 4 bytes dành để mở rộng tương lai |

> [!NOTE]
> Các TOC entry được sắp xếp theo thứ tự `styleId` tăng dần (0, 1, 2, 3). Firmware dùng `dataOffset` để nhảy trực tiếp đến dữ liệu của style cần dùng.

---

## 4. Data Sections của một Style

Các section nối tiếp nhau liên tục, không padding giữa các section. Thứ tự **bắt buộc**:

```
[Intervals Section]
[Glyphs Section]
[Kern Left Section]
[Kern Right Section]
[Kern Matrix Section]
[Ligatures Section]
[Bitmap Section]
```

### 4.1 Intervals Section

Danh sách các khoảng Unicode liên tục **có glyph thực tế** trong font. Các codepoint không có trong font (không có ở primary lẫn fallback) đã bị loại khỏi intervals.

**Mỗi entry: 12 bytes** (`<III`)

| Offset | Size | Type | Tên | Mô tả |
|--------|------|------|-----|-------|
| 0 | 4 | uint32 | `start` | Codepoint đầu của khoảng |
| 4 | 4 | uint32 | `end` | Codepoint cuối của khoảng (inclusive) |
| 8 | 4 | uint32 | `glyphOffset` | Chỉ số glyph đầu tiên của khoảng trong Glyphs Section |

**Ví dụ:** Nếu intervals là `[0x0041, 0x005A]` (A–Z) và `[0x0061, 0x007A]` (a–z):
```
entry[0]: start=0x41, end=0x5A, glyphOffset=0
entry[1]: start=0x61, end=0x7A, glyphOffset=26
```

Firmware tra cứu codepoint `cp` bằng cách tìm interval chứa `cp` → lấy `glyphOffset + (cp - start)` → chỉ số glyph trong Glyphs Section.

---

### 4.2 Glyphs Section

Mảng các struct mô tả từng glyph. Thứ tự tương ứng 1-1 với thứ tự codepoint trong Intervals.

**Mỗi entry: 16 bytes** (`<BBHhhH2xI`)

| Offset | Size | Type | Tên | Mô tả |
|--------|------|------|-----|-------|
| 0 | 1 | uint8 | `width` | Chiều rộng bitmap (pixel) |
| 1 | 1 | uint8 | `height` | Chiều cao bitmap (pixel) |
| 2 | 2 | uint16 | `advanceX` | Bước ngang, **12.4 fixed-point** (xem §6) |
| 4 | 2 | int16 | `left` | Bearing trái (pixel, có thể âm) |
| 6 | 2 | int16 | `top` | Bearing trên (pixel, tính từ baseline lên) |
| 8 | 2 | uint16 | `dataLength` | Kích thước bitmap đã nén (bytes) |
| 10 | 2 | — | *(pad)* | 2 bytes căn lề 4-byte |
| 12 | 4 | uint32 | `dataOffset` | Offset trong Bitmap Section (byte) |

> [!NOTE]
> Glyph có `width=0, height=0` là glyph trống (codepoint tồn tại trong khoảng nhưng không có glyph thực — hiếm gặp). `dataLength=0` và `dataOffset` trỏ đến cuối bitmap.

---

### 4.3 Kern Left Section

Bảng ánh xạ codepoint → class để tra cứu kerning bên trái (ký tự đứng trước).

**Mỗi entry: 3 bytes** (`<HB`)

| Offset | Size | Type | Tên | Mô tả |
|--------|------|------|-----|-------|
| 0 | 2 | uint16 | `codepoint` | Mã Unicode của ký tự |
| 2 | 1 | uint8 | `classId` | Class ID (0 = không có kern) |

---

### 4.4 Kern Right Section

Bảng ánh xạ codepoint → class để tra cứu kerning bên phải (ký tự đứng sau).

**Cấu trúc giống hệt Kern Left:** 3 bytes mỗi entry (`<HB`)

---

### 4.5 Kern Matrix Section

Ma trận 2D lưu giá trị điều chỉnh khoảng cách giữa các cặp class.

**Kích thước:** `kernLeftClassCount × kernRightClassCount` bytes

**Mỗi phần tử: 1 byte** (`int8`) — giá trị **4.4 signed fixed-point** (xem §6)

Tra cứu: `kern_value = matrix[left_class_id * kernRightClassCount + right_class_id]`

---

### 4.6 Ligatures Section

Danh sách các cặp codepoint được ghép thành ligature (ví dụ: `f` + `i` → `ﬁ`).

**Mỗi entry: 8 bytes** (`<II`)

| Offset | Size | Type | Tên | Mô tả |
|--------|------|------|-----|-------|
| 0 | 4 | uint32 | `packedPair` | `(cp1 << 16) | cp2` — cặp codepoint đầu vào |
| 4 | 4 | uint32 | `ligCp` | Codepoint của glyph ligature đầu ra |

Ligature 3+ ký tự được phân rã thành chuỗi cặp (chained pairs):
- `f + f + i` → `(f, f) → ff_lig`, sau đó `(ff_lig, i) → ffi_lig`

---

### 4.7 Bitmap Section

Dữ liệu bitmap thô của tất cả các glyph, nối tiếp nhau. Mỗi glyph được truy cập qua `dataOffset` và `dataLength` trong Glyphs Section.

**Encoding: 2-bit grayscale, packed 4 pixel/byte**

Mỗi pixel chiếm 2 bit, đại diện cho 4 mức độ sáng:

| Giá trị 2-bit | Mức sáng |
|:---:|---|
| `00` | Trong suốt (transparent) |
| `01` | 33% xám |
| `10` | 67% xám |
| `11` | Đen hoàn toàn |

**Thứ tự bit trong byte:** MSB trước (pixel ngoài cùng bên trái → bit 7–6 của byte đầu tiên).

**Thứ tự pixel:** Trái-sang-phải, Trên-xuống-dưới (row-major).

**Căn lề cuối glyph:** Nếu `width × height` không chia hết cho 4, byte cuối cùng được đệm bằng `0` ở các bit thấp.

**Ngưỡng quantization (darken_aa = True — mặc định):**

| Giá trị grayscale gốc (0–15) | 2-bit output |
|:---:|:---:|
| 0–2 | 00 |
| 3–5 | 01 |
| 6–9 | 10 |
| 10–15 | 11 |

*(Khi `darken_aa = False`: ngưỡng là 0–3 → 00, 4–7 → 01, 8–11 → 10, 12–15 → 11)*

---

## 5. Quy trình rasterize

```
Font TTF/OTF
    │
    ▼
resolve_style_coverage()
    ├─ Quét primary font: codepoint nào có glyph?
    ├─ Fallback 1, 2, ..., N: lấp các codepoint còn thiếu
    └─ Loại bỏ codepoint không có trong bất kỳ font nào
    │
    ▼ validated_intervals (chỉ chứa codepoint thực tế)
    │
    ▼
rasterize_style()
    ├─ Với mỗi codepoint:
    │   ├─ Render glyph bằng FreeType/Canvas tại DPI=150
    │   ├─ Quantize 8-bit grayscale → 2-bit
    │   └─ Pack vào bitmap buffer
    ├─ Tính metrics: advanceY, ascender, descender
    ├─ Trích xuất GPOS kerning → kern classes + matrix
    ├─ Trích xuất GSUB ligatures
    └─ Tái tính activeIntervals từ codepoints thực tế
    │
    ▼
pack_style_sections()
    └─ Serialize thành các section nhị phân
    │
    ▼
generate_cpfont_multistyle()
    ├─ Tính toán file offsets cho từng style
    ├─ Viết Global Header
    ├─ Viết Style TOC
    └─ Viết Data Sections
```

---

## 6. Định dạng số thực cố định (Fixed-Point)

### `advanceX` — 12.4 unsigned (uint16)

Biểu diễn bước ngang của glyph với độ phân giải 1/16 pixel.

- Bit 15–4: phần nguyên (integer bits)
- Bit 3–0: phần thập phân (1/16, 1/8, 1/4, 1/2 pixel)

**Chuyển đổi từ FreeType 16.16:**
```python
advanceX_fp4 = (linearHoriAdvance + (1 << 11)) >> 12
```

**Chuyển đổi từ design units (opentype.js):**
```javascript
advanceX_fp4 = Math.round(glyph.advanceWidth * scale * 16)
```

### `kernMatrix` — 4.4 signed (int8)

Giá trị điều chỉnh khoảng cách kern với độ phân giải 1/16 pixel. Dải: −8.0 đến +7.9375 pixel.

**Chuyển đổi từ design units:**
```python
kern_fp4 = clamp(round(design_units * scale * 16), -128, 127)
```

---

## 7. Chuẩn hóa metrics từ FreeType

FreeType trả về metrics theo đơn vị 26.6 fixed-point (nhân 64 lần).

```python
advanceY = ceil(face.size.height / 64)    # line height
ascender  = ceil(face.size.ascender / 64)
descender = floor(face.size.descender / 64)  # âm
```

---

## 8. Ví dụ file tối thiểu

File `.cpfont` nhỏ nhất hợp lệ: 1 style (Regular), 1 interval (ký tự space U+0020), không kern, không ligature.

```
Offset 0:   43 50 46 4F 4E 54 00 00    magic = "CPFONT\0\0"
Offset 8:   04 00                       version = 4
Offset 10:  01 00                       flags = 1 (2-bit grayscale)
Offset 12:  01                          styleCount = 1
Offset 13:  [19 bytes 00]               reserved

Offset 32:  00                          TOC[0].styleId = 0 (Regular)
Offset 33:  [3 bytes 00]                pad
Offset 36:  01 00 00 00                 intervalCount = 1
Offset 40:  01 00 00 00                 glyphCount = 1
Offset 44:  12                          advanceY = 18
Offset 45:  0E 00                       ascender = 14
Offset 47:  F2 FF                       descender = -14
Offset 49:  00 00                       kernLeftCount = 0
Offset 51:  00 00                       kernRightCount = 0
Offset 53:  00                          kernLeftClassCount = 0
Offset 54:  00                          kernRightClassCount = 0
Offset 55:  00                          ligatureCount = 0
Offset 56:  40 00 00 00                 dataOffset = 64 (= 32 + 1*32)
Offset 60:  [4 bytes 00]                reserved

Offset 64:  20 00 00 00                 Intervals[0].start = 0x20 (space)
Offset 68:  20 00 00 00                 Intervals[0].end = 0x20
Offset 72:  00 00 00 00                 Intervals[0].glyphOffset = 0

Offset 76:  00 00 A0 00 00 00 00 00 00 00 00 00 00 00 00 00
            Glyph[0]: width=0 height=0 advanceX=0x00A0(=10px) left=0 top=0 dataLen=0 dataOffset=0

            (Bitmap section: 0 bytes)
```

---

## 9. Naming Convention

Firmware yêu cầu file được đặt tại:

```
/fonts/<FamilyName>/<FamilyName>_<size>.cpfont
```

hoặc thư mục ẩn:

```
/.fonts/<FamilyName>/<FamilyName>_<size>.cpfont
```

**Ví dụ:**
```
/fonts/Literata/Literata_8.cpfont
/fonts/Literata/Literata_10.cpfont
/fonts/Literata/Literata_12.cpfont
/fonts/Literata/Literata_14.cpfont
/fonts/Literata/Literata_16.cpfont
/fonts/Literata/Literata_18.cpfont
```

Kích thước UI fonts (8pt, 10pt) dùng cho giao diện hệ thống. Kích thước đọc sách (12–18pt) dùng cho nội dung sách. Family name trong đường dẫn **phải khớp chính xác** (case-sensitive) với tên trong tên file.
