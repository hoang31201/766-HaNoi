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

Lam moi du lieu tai ban da cong bo moi nhat. Lich su cap nhat mo trang workflow de xem ket qua publish. Khach xem web khong duoc cap token hay quyen ghi.

Trang va cac chi tieu tong hop la cong khai. Toan bo app dung du lieu cong khai cua Cong DVCQG. Danh sach ho so, cookie va SQLite khong nam trong ban nay.

## Chay thu

```sh
node --test tools/quality-deployment.test.mjs
QUALITY_DATA_DIR=history/quality GITHUB_REPOSITORY=hoang31201/766-HaNoi node tools/build-quality-pages.mjs
```

Du lieu trong dist la trang tinh, hoat dong ca duoi duong dan repository (khong goi API may chu).

Tai lieu: https://docs.github.com/en/pages/getting-started-with-github-pages
