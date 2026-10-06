# Khung bao cao chi so 766 phuc vu lanh dao UBND thanh pho

Trang thai: bot HNi766_bot da cau hinh, danh sach toi da 3 so/nganh va 10 xa/phuong. Ban GitHub-first duoc thiet ke gui luc 06:30 hang ngay (Viet Nam) hoac khi du lieu den muon; chi kich hoat sau khi duyet commit va kiem tra tren GitHub. Token da duoc luu trong GitHub Actions Secrets theo chap thuan cua nguoi dung, khong nam trong ma nguon. Xem README_github_automation.md.

Mau dang dung da rut gon: khong hien nguon/do phu, de xuat xu ly, luu y va nguong trong tin nhan. Thong tin chat luong du lieu van duoc giu trong ket qua tao bao cao (`qualityNotes`). Cac muc duoi day mo ta khung phan tich ban dau; khong phai tat ca deu duoc gui vao nhom.

## 1. Muc tieu

Bao cao doc trong 1-2 phut, tra loi ba cau hoi:

- Ket qua toan thanh pho dang o muc nao va thay doi ra sao?
- Nhom chi so, so/nganh, xa/phuong nao can chu y?
- Noi dung nao can kiem tra, don doc; bang chung va dau moi la gi?

Moi noi dung de xuat xu ly la goi y, khong phai chi dao da duoc lanh dao ban hanh.

## 2. Cau truc gui hang ngay

Gui mot tin tom tat; chi gui them mot tin danh sach khi co canh bao vuot nguong.
Chi tiet day du xem tren web, khong dua 142 don vi hay 27 tieu chi vao tin nhan.

### A. Thong tin ban so lieu

- Ngay so lieu, thoi diem lay thanh cong theo gio Viet Nam.
- Nguon: Cong Dich vu cong quoc gia; ky luy ke nam.
- Ngay doi chieu: dung ngay lien truoc. Neu thieu thi ghi ro, khong tu gan ngay gan nhat la hom qua.
- Do phu: so don vi co diem tong, co du 6 nhom, co chi tiet tieu chi.
- Trang thai: du so lieu / thieu mot phan / chua lay duoc ban moi.

### B. Ket qua toan thanh pho

- Diem tong / 100; chenh lech diem so voi hom qua.
- Thu hang / so tinh thanh; thay doi bac hang.
- Diem 6 nhom / diem toi da va chenh lech diem:
  CKMB /18, TDGQ /20, DVCTT /12, TTTT /10, MDHL /18, SHHS /22.
- Nhom yeu nhat theo ty le diem/dat toi da, khong so sanh diem tho khac thang.
- Dien bien 7 ngay: chenh lech tu dau den cuoi cua 7 ngay lich, ghi ro neu khong du du lieu.

### C. Noi dung can chu y

Uu tien toi da ba van de, moi van de co:

- Ten nhom/tieu chi, don vi lien quan.
- Muc hien tai, muc doi chieu, chenh lech va don vi do.
- Anh huong: toan thanh pho / so-nganh / xa-phuong.
- Bang chung: duong dan xem don vi va ngay tren web.
- De xuat: kiem tra xac nhan / giai trinh / de xuat bien phap; dau moi du kien.

Khong suy dien nguyen nhan giam diem thanh loi cua can bo hay loi he thong.
Khong ghi thoi han, giao nhiem vu nhu mot quyet dinh da duoc ban hanh.

### D. Don vi can theo doi

- Tach hai danh sach: so/nganh va xa/phuong.
- Danh sach so/nganh: toi da 3 don vi; xa/phuong: toi da 10 don vi.
- Uu tien giam vuot nguong (muc giam lon truoc), sau do diem thap (ty le diem/dat toi da thap truoc). Don vi chi xuat hien mot lan trong cung danh sach.
- Khong du don vi co du lieu hop le: hien so luong thuc te va ghi ro thieu du lieu, khong dien cho du so luong.
- Hien diem tong, chenh lech, nhom dong gop muc giam lon nhat neu du du lieu.
- Thong ke rieng so don vi tang / giam / khong doi / chua du doi chieu.
- Don vi cai thien noi bat: toi da hai, tach khoi danh sach canh bao.
- Hang va thay doi hang don vi tinh trong cung nhom; bang diem cung hang.
- Diem giam nhung van cao va diem thap nhung khong giam la hai tinh huong khac nhau.

### E. Chi so nghiep vu phuc vu dieu hanh

Chi dua len tin chinh khi co canh bao; con lai xem tren web:

- Dung han/trong han va thoi gian giai quyet trung binh.
- Ho so nop truc tuyen, ho so truc tuyen giai quyet dung han.
- Ho so thanh toan truc tuyen.
- Hai long trong tiep nhan/giai quyet; PAKN xu ly dung han.
- Cap ket qua dien tu, so hoa ho so, tai su dung du lieu.

Ty le hien kem tu so/mau so khi co. Neu mau so nho thi canh bao ve co so so lieu.
Khong suy ra so ho so qua han tu tong tiep nhan tru tong hoan thanh.
Chenh lech so dem luy ke chi la chenh lech giua hai ban, chua phai ho so phat sinh trong ngay.

## 3. Nguong de xuat, khong phai nguong danh gia chinh thuc

Hai loai canh bao phai hien tach biet:

### Muc diem

- Do: diem/dat toi da <50%.
- Vang: 50% <= diem/dat toi da <70%.
- Tu 70%: khong canh bao diem thap; khong dong nghia da dat muc tieu chinh thuc.
- Thieu diem hoac diem toi da: chua du du lieu, khong coi la 0.

### Bien dong

- Diem tong thanh pho giam >=0.5 diem/ngay: can chu y.
- Diem tong don vi giam >=0.5 diem/ngay: uu tien kiem tra. Chi truong hop nay moi hien nhom giam chinh; don vi chi co diem thap khong hien nhom giam chinh.
- Diem nhom giam >=0.5 diem/ngay: can chu y, hien ro thang diem nhom.
- Ty le nghiep vu giam >=2 diem phan tram: can chu y neu du dieu kien doi chieu.
- Thoi gian giai quyet tang: danh gia rieng theo don vi ngay, khong dung nguong diem.
- Giam lien tiep 3 ngay: xu huong giam lien tuc khi co du 4 ban ngay ke nhau.
- Khong bien moi thay doi lam tron 0.01 diem thanh canh bao day tin nhan.

Nguong phai co the dieu chinh sau khi theo doi du lieu thuc te; khong gan mau bien dong voi mau muc diem.

## 4. Dieu kien duoc phep doi chieu

- Cung don vi, cung ky, cung thang diem va cung dinh nghia chi tieu.
- Chi so ty le: tu so/mau so hop le; mau so =0 hien khong phat sinh, khong danh gia giam.
- So lieu tam, thieu chi tieu, thay doi thang diem: canh bao chat luong du lieu, khong ket luan suy giam.
- Nguon phu ngay 01-05/10/2026 gan nhan rieng; chenh lech voi nguon chinh chi tham khao.
- Ban nguon co diem tong khong khop tong 6 nhom: hien canh bao, khong tu sua diem nguon.
- Khong co ban hom qua: khong bao tang/giam 0; ghi chua du doi chieu.
- Tong hop ty le cap thanh pho dung so lieu nguon, khong lay trung binh ty le cac don vi.

## 5. Mau tin Telegram

BAO CAO 766 HA NOI | {ngay_so_lieu}
Lay luc: {gio_lay}

TOAN THANH PHO
Diem: {diem}/100 ({chenh_diem} diem)
Hang: {hang}/{so_tinh} ({chenh_hang} bac)
CKMB {diem}/18 ({chenh}); TDGQ {diem}/20 ({chenh})
DVCTT {diem}/12 ({chenh}); TTTT {diem}/10 ({chenh})
MDHL {diem}/18 ({chenh}); SHHS {diem}/22 ({chenh})

CAN CHU Y
1. {van_de}: {muc_hien_tai}, {chenh_lech}; {pham_vi_anh_huong}.
2. {van_de}: {muc_hien_tai}, {chenh_lech}; {pham_vi_anh_huong}.
3. {van_de}: {muc_hien_tai}, {chenh_lech}; {pham_vi_anh_huong}.

DON VI CAN THEO DOI
So/nganh: {danh sach toi da 3 don vi: ten, diem, chenh, nhan}.
Xa/phuong: {danh sach toi da 10 don vi: ten, diem, chenh, nhan}.
Nhan: Giam vuot nguong / Diem thap. Chi Giam vuot nguong moi hien nhom giam chinh neu co du lieu.
Ten don vi in dam; diem, bien dong va nhan khong in dam. Khong emoji trong phan don vi, khong emoji tang/giam/giu nguyen.
Tang {n} | Giam {n} | Khong doi {n} | Chua du doi chieu {n}.

Xem chi tiet: {link_web}

Day la mau, khong phai bao cao so lieu ngay 07/10/2026.

## 6. Quy trinh gui de xuat

- Cao du lieu luc 05:00 tren may ca nhan, thu lai moi gio den 23:00 cho toi khi ban hom nay duoc day len GitHub. May chi cao va day du lieu; GitHub tao va gui bao cao.
- Gui luc 06:30 hang ngay theo mui gio Asia/Ho_Chi_Minh. Neu cao chua xong hoac khong co ban hop le cua ngay hien tai thi khong gui du lieu cu duoi nhan ngay moi.
- Gio cao 05:00 va gio gui 06:30 la hai moc rieng; may ca nhan can bat, dang nhap Windows va co Internet vao thoi diem chay.
- Neu chua co du lieu luc 06:30: GitHub gui mot tin bao chua cap nhat, khong lap tin lien tuc. Khi du lieu hom nay duoc day len sau 06:30, GitHub tu dong gui bao cao.
- Gui vao nhom Telegram rieng da duoc phe duyet; chi du lieu cong khai/tong hop, khong thong tin ca nhan ho so.
- Gio gui va so luong don vi da duoc nguoi dung xac nhan. Can xac dinh bot, nhom/nguoi nhan va duyet nguong truoc khi kich hoat.
- Khong tao bot, luu token hay gui tin thu truoc khi nguoi dung duyet khung nay.
- Token khong dua vao chat, repository, bao cao hay anh chup; dung cau hinh rieng tren may.

## 7. Khoang trong can bo sung khi trien khai

- Lich tu dong hien cao diem tong va diem nhom don vi; chua bat che do cao chi tiet tung don vi.
- Muon truy nguyen tieu chi don vi va bao cao chi tiet phai bat che do nay, kiem tra thoi gian cao/loi nguon va du lieu so sanh.
- Chi tieu ho so qua han/tinh trang ton dong chinh xac chi them khi nguon co dinh nghia va du lieu phu hop.
- Chua co du lieu ngay 07/10 trong thu muc lich su dong bo tai thoi diem lap khung; khong dung mau nay de xac nhan cao hang ngay da chay thanh cong.
