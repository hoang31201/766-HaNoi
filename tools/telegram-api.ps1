function Get-TelegramErrorMessage([int]$Code, [string]$Method, [string]$Transport = '') {
    switch ($Code) {
        401 { return 'Telegram từ chối token (401). Sao chép lại token của @HNi766_bot từ BotFather.' }
        404 { return 'Telegram không nhận diện token hoặc địa chỉ API (404). Kiểm tra token có bị thiếu ký tự.' }
        403 { return 'Telegram từ chối quyền truy cập (403). Kiểm tra bot còn trong nhóm và được phép gửi tin.' }
        409 { return 'Bot đang được một chương trình khác lấy tin (409). Cần kiểm tra kết nối khác trước; chưa thay đổi kết nối đó.' }
        429 { return 'Telegram giới hạn số lần thử (429). Chờ một lúc rồi thử lại.' }
        400 { return "Telegram từ chối yêu cầu $Method (400). Cần kiểm tra cấu hình bot; không gửi token vào chat." }
    }
    if ($Code -ge 500) { return "Telegram gặp lỗi máy chủ ($Code). Thử lại sau." }
    if ($Code -gt 0) { return "Telegram trả lỗi HTTP $Code ở bước $Method. Không gửi token vào chat." }
    if ($Transport -eq 'Timeout') { return 'Kết nối Telegram quá thời gian chờ. Thử lại và kiểm tra mạng.' }
    if ($Transport -eq 'NameResolutionFailure') { return 'Máy không phân giải được địa chỉ Telegram. Kiểm tra DNS và Internet.' }
    if ($Transport -in @('TrustFailure','SecureChannelFailure')) { return 'Không thiết lập được kết nối HTTPS an toàn. Kiểm tra ngày giờ máy và kết nối mạng; không tắt kiểm tra chứng chỉ.' }
    return "Không hoàn tất được bước $Method. Kiểm tra mạng và thử lại; không gửi token vào chat."
}

function Call-Telegram([string]$Token, [string]$Method, $Body) {
    $code = 0
    $transport = ''
    try {
        $response = Invoke-RestMethod -Uri "https://api.telegram.org/bot$Token/$Method" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 6))) -TimeoutSec 25
        if (!$response.ok) { $code = [int]$response.error_code; throw 'Telegram API failed' }
        return $response.result
    } catch {
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        if ($_.Exception.Status) { $transport = [string]$_.Exception.Status }
        # Store only safe error metadata; exception text can contain the token-bearing URL.
        if ($directory) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
            [IO.File]::WriteAllText((Join-Path $directory 'setup-diagnostic.json'), (@{ method = $Method; httpStatus = $code; transport = $transport; checkedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        }
        throw (Get-TelegramErrorMessage $code $Method $transport)
    }
}
