# Chat luong phuc vu Ha Noi - GitHub Pages

Web tinh hien thi 6 nhom va 27 chi tieu cua Ha Noi tu Cong DVCQG, luu so lieu nam hien tai theo tung ngay Viet Nam, so sanh 2 ngay va canh bao tang/giam. Cac ngay chua lay khong duoc tao du lieu gia.

## Publish mien phi

1. Repository PUBLIC cua ban: https://github.com/hoang31201/766-HaNoi, nhanh mac dinh `main`. GitHub Pages tren GitHub Free can repository public; runner Ubuntu tieu chuan cua Actions tren repository public khong tinh phi thoi gian chay.
2. Dua NOI DUNG thu muc `outputs/github-ready` len goc repository, gom ca `.github/workflows/update-quality.yml`. Khong upload thu muc API ho so, database, cookie hay file Excel.
3. Settings > Pages > Build and deployment > Source: GitHub Actions.
4. Actions > Update Hanoi quality and publish > Run workflow > main > Run workflow. Tac vu lay so lieu, luu JSON vao repository va publish Pages.
5. Xem URL tai Settings > Pages hoac deployment github-pages. Duong dan cua ban: `https://hoang31201.github.io/766-HaNoi/` (chi hoat dong sau khi deploy thanh cong).

## Lich lay va luu

Workflow chay luc 01:17 va 10:17 UTC, tuong ung 08:17 va 17:17 Viet Nam. GitHub co the chay tre khi tai cao. Lich chi chay tren nhanh mac dinh; repository public khong co hoat dong trong 60 ngay co the bi tat lich. Neu tac vu loi, trang giu du lieu cua lan publish thanh cong truoc do; xem Actions de chay lai.

Lich su chinh luu trong `history/quality/YYYY-MM-DD.json` va duoc commit sau moi lan lay. Cung ngay giu lan thanh cong moi nhat. Phan raw khong commit; response goc duoc luu bang artifact cua Actions trong 7 ngay. Artifact trang web luu 1 ngay. Khong su dung runner lon, dich vu tra phi hay khoa API.

## Nut tren web

Lam moi du lieu tai ban da cong bo moi nhat. Lay so lieu moi mo trang workflow; chu repository dang nhap va bam Run workflow. Khach xem web khong duoc cap token hay quyen ghi.

Trang va cac chi tieu tong hop la cong khai. Toan bo app dung du lieu cong khai cua Cong DVCQG. Danh sach ho so, cookie va SQLite khong nam trong ban nay.

## Chay thu

```sh
node --test tools/quality-deployment.test.mjs
QUALITY_DATA_DIR=history/quality GITHUB_REPOSITORY=hoang31201/766-HaNoi node tools/build-quality-pages.mjs
```

Du lieu trong dist la trang tinh, hoat dong ca duoi duong dan repository (khong goi API may chu).

Tai lieu: https://docs.github.com/en/pages/getting-started-with-github-pages
