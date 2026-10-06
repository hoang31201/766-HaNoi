# Chat luong phuc vu Ha Noi - GitHub Pages

Web tinh hien thi 6 nhom va 27 chi tieu cua Ha Noi tu Cong DVCQG, luu so lieu nam hien tai theo tung ngay Viet Nam, so sanh 2 ngay va canh bao tang/giam. Cac ngay chua lay khong duoc tao du lieu gia.

## Publish mien phi

1. Repository PUBLIC cua ban: https://github.com/hoang31201/766-HaNoi, nhanh mac dinh `main`. GitHub Pages tren GitHub Free can repository public; runner Ubuntu tieu chuan cua Actions tren repository public khong tinh phi thoi gian chay.
2. Dua NOI DUNG thu muc `outputs/github-ready` len goc repository, gom ca `.github/workflows/update-quality.yml`. Khong upload thu muc API ho so, database, cookie hay file Excel.
3. Settings > Pages > Build and deployment > Source: GitHub Actions.
4. Actions > Update Hanoi quality and publish > Run workflow > main > Run workflow chi publish lai du lieu da luu. Du lieu moi duoc lay tren may Windows va dua len repository.
5. Xem URL tai Settings > Pages hoac deployment github-pages. Duong dan cua ban: `https://hoang31201.github.io/766-HaNoi/` (chi hoat dong sau khi deploy thanh cong).

## Lich lay va luu

Task Windows `Hanoi-766-Daily-Sync` chay luc 08:17, 17:17 Viet Nam va khi dang nhap. May can bat va co mang; task chay bu khi co the. GitHub Actions chi kiem tra va publish Pages sau commit, khong crawl tu runner vi ket noi nguon hien bi timeout. Khi may tat, web van hien thi du lieu da publish gan nhat.

Lich su chinh luu trong `history/quality/YYYY-MM-DD.json` va duoc commit sau moi lan lay. Cung ngay giu lan thanh cong moi nhat. Phan raw chi luu tren may trong `outputs/local-sync/history/raw`, khong commit. Nhat ky dong bo: `outputs/local-sync/sync.log`. Dang nhap duoc Git Credential Manager luu trong kho bao mat Windows, khong trong source. Email commit dung noreply. Artifact trang web luu 1 ngay. Khong su dung runner lon, dich vu tra phi hay khoa API.

Cong cu tren may: `tools/sync-quality-local.ps1`; cai lich bang `tools/install-quality-sync.ps1`. Chay ngay bang `powershell -NoProfile -ExecutionPolicy Bypass -File tools/sync-quality-local.ps1`. Dung lich bang Disable task `Hanoi-766-Daily-Sync` trong Task Scheduler. Cong cu dung neu checkout co thay doi chua luu hoac pull khong the fast-forward, khong ghi de. Crawl loi thi giu du lieu cu; push loi thi giu commit tren may de thu lai. Bo chi so nam duoc chup theo ngay, khong phai so ho so phat sinh rieng trong ngay.

## Nut tren web

Trang chinh tu doi chieu ban luu hom nay voi dung ngay hom qua (mui gio Viet Nam), khong dung ngay gan nhat thay the. Neu thieu hom nay/hom qua hoac khac nam thi khong tinh bien dong. Trang `#history` liet ke cac ngay da luu; `#history?day=YYYY-MM-DD` mo chi tiet ngay do, cho phep chon ngay doi chieu cung nam. Bang don vi tach thanh So, nganh va co quan (`AGENCY`) va Xa, phuong (`COMMUNE`) theo phan loai cua nguon; don vi chua phan loai duoc hien rieng neu co.

Moi bang don vi co STT va mac dinh sap xep diem hien tai giam dan; bam tieu de diem de doi chieu tang/giam rieng tung bang. Diem bang nhau sap theo ten, don vi chua co diem o cuoi. STT danh lai theo ket qua dang hien thi khi tim kiem.

Chon Nhom tieu chi de xem diem nhom cua tung don vi, kem diem toi da. Diem doi chieu, bien dong va sap xep deu theo nhom dang chon. Tat ca nhom hien diem tong hop. Snapshot moi luu `departments[].groupScores` tu tung endpoint nguon, ghep theo ID don vi; ban luu cu chua co diem nhom hien dau gach, khong thay bang diem tong hop. Da bo lien ket Lich su cap nhat o goc tren.

Lam moi du lieu tai ban da cong bo moi nhat. Khach xem web khong duoc cap token hay quyen ghi.

Trang va cac chi tieu tong hop la cong khai. Toan bo app dung du lieu cong khai cua Cong DVCQG. Danh sach ho so, cookie va SQLite khong nam trong ban nay.

## Ban do dia ban

Ban do Leaflet 1.9.4 to mau 126 xa/phuong theo nhom tieu chi dang chon. Popup hien diem nhom, diem tong hop va bien dong; bang KPI ben canh co bieu do Chart.js 4.5.1 theo nhom va theo ngay. Bo loc gom xa/phuong, trang thai, ten dia ban va chon don vi. Nguong diem mac dinh do duoi 50%, vang duoi 70% diem toi da; day la nguong theo doi cua app, khong phai xep loai chinh thuc. Che do suy giam dung nguong bien dong chung: vang giam tu 1 lan nguong, do giam tu 2 lan nguong. Thieu ngay doi chieu, thieu diem hoac khac thang diem thi khong tinh bien dong.

Ranh gioi tham khao tu Vietnamese Provinces Database, revision `8b78ba5118715e1fa81769286724db79346abf52`, MIT: https://github.com/thanglequoc/vietnamese-provinces-database . Nguon GIS goc duoc du an ghi la sapnhap.bando.com.vn. Khong dung ban do nay xac dinh dia gioi phap ly. Ghep don vi theo ten chuan hoa (giu loai xa/phuong), khong ghep gan dung; don vi khong khop hien chua du so lieu. `tools/import-quality-map.mjs` tao du lieu dia ly va tai cac thu vien co phien ban co dinh. Thu vien, ranh gioi va giay phep duoc luu cung app; khong goi tile server, khong can API key, khong tinh phi va hoat dong voi file HTML tren may. Lucide 0.468.0 dung cho icon, giay phep ISC; Leaflet BSD-2-Clause, Chart.js MIT.

Chu repository da xac nhan commit va xuat ban thay doi ban do len GitHub.

## Chay thu

```sh
node --test tools/quality-deployment.test.mjs
QUALITY_DATA_DIR=history/quality GITHUB_REPOSITORY=hoang31201/766-HaNoi node tools/build-quality-pages.mjs
```

Du lieu trong dist la trang tinh, hoat dong ca duoi duong dan repository (khong goi API may chu).

Tai lieu: https://docs.github.com/en/pages/getting-started-with-github-pages
