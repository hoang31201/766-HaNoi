$ErrorActionPreference = 'Stop'
foreach ($module in @('Microsoft.PowerShell.Security', 'ScheduledTasks')) {
    Import-Module (Join-Path $PSHOME "Modules/$module/$module.psd1") -ErrorAction Stop
}
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$directory = Join-Path $root 'outputs/telegram-private'
$script:reportRunner = Join-Path $PSScriptRoot 'send-telegram-quality.ps1'
$script:setupDirectory = $directory
$script:setupRoot = $root
$script:boundToken = $null
$script:groups = @()
. (Join-Path $PSScriptRoot 'telegram-api.ps1')
$form = New-Object Windows.Forms.Form
$form.Text = 'Thiết lập báo cáo 766 - Bản sửa mô-đun Windows'
$form.Size = New-Object Drawing.Size(720, 590)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.Font = New-Object Drawing.Font('Segoe UI', 10)
$intro = New-Object Windows.Forms.Label
$intro.Text = "Bot: @HNi766_bot | Báo cáo: 3 sở/ngành và 10 xã/phường.`r`nGửi 06:30 hằng ngày, giờ Việt Nam. Token chỉ lưu mã hóa trên máy này."
$intro.SetBounds(20, 16, 670, 55)
$form.Controls.Add($intro)
$label = New-Object Windows.Forms.Label
$label.Text = 'Dán token do BotFather cấp (không gửi vào chat):'
$label.SetBounds(20, 80, 660, 25)
$form.Controls.Add($label)
$tokenInput = New-Object Windows.Forms.TextBox
$tokenInput.UseSystemPasswordChar = $true
$tokenInput.SetBounds(20, 110, 660, 30)
$form.Controls.Add($tokenInput)
$find = New-Object Windows.Forms.Button
$find.Text = 'Kiểm tra bot và tìm nhóm'
$find.SetBounds(20, 155, 250, 36)
$form.Controls.Add($find)
$instructions = New-Object Windows.Forms.Label
$instructions.Text = 'Gửi /start@HNi766_bot trong nhóm cần nhận báo cáo, rồi bấm tìm nhóm.'
$instructions.SetBounds(20, 205, 660, 50)
$form.Controls.Add($instructions)
$list = New-Object Windows.Forms.ListBox
$list.SetBounds(20, 260, 660, 140)
$form.Controls.Add($list)
$save = New-Object Windows.Forms.Button
$save.Text = 'Xác nhận nhóm và bật lịch 06:30'
$save.Enabled = $false
$save.SetBounds(20, 420, 350, 38)
$form.Controls.Add($save)
$status = New-Object Windows.Forms.Label
$status.SetBounds(20, 472, 660, 65)
$status.Text = 'Chưa lưu token. Chưa bật lịch. Không có tin nhắn nào được gửi.'
$form.Controls.Add($status)
$find.Add_Click({
    $find.Enabled = $false; $save.Enabled = $false; $list.Items.Clear()
    $status.Text = 'Đang kiểm tra kết nối...'; $form.Refresh()
    try {
        $token = $tokenInput.Text.Trim()
        if ($token -notmatch '^\d+:[A-Za-z0-9_-]+$') { throw 'Token không đúng định dạng.' }
        $bot = Call-Telegram $token 'getMe' @{}
        if ($bot.username -ne 'HNi766_bot') { throw 'Token không thuộc bot @HNi766_bot. Chưa lưu.' }
        $webhook = Call-Telegram $token 'getWebhookInfo' @{}
        if ($webhook.url) { throw 'Bot đang có kết nối webhook khác. Chưa thay đổi kết nối đó; cần kiểm tra trước.' }
        $updates = @(Call-Telegram $token 'getUpdates' @{ timeout = 0; limit = 100; allowed_updates = @('message','my_chat_member') })
        $choices = @{}
        foreach ($update in $updates) {
            $chat = $update.message.chat
            $thread = $update.message.message_thread_id
            $validCommand = $update.message.text -match '^/start(?:@HNi766_bot)?(?:\s|$)'
            if (!$validCommand) { continue }
            if ($chat.type -notin @('group','supergroup')) { continue }
            $key = '{0}:{1}' -f $chat.id, $thread
            $choices[$key] = @{ chatId = [string]$chat.id; title = [string]$chat.title; threadId = $thread }
        }
        $script:groups = @($choices.Values | Sort-Object title)
        foreach ($group in $script:groups) { [void]$list.Items.Add(('{0} | {1}{2}' -f $group.title, $group.chatId, $(if ($group.threadId) { ' | chủ đề ' + $group.threadId } else { '' }))) }
        $script:boundToken = $token
        if (!$script:groups.Count) { $status.Text = 'Chưa tìm thấy lệnh /start trong nhóm. Gửi lại /start@HNi766_bot ở nhóm rồi bấm tìm nhóm.' }
        else { $status.Text = 'Chọn đúng nhóm nhận báo cáo bên trên. Chưa gửi tin, chưa bật lịch.'; $save.Enabled = $true }
    } catch { $status.Text = $_.Exception.Message }
    finally { $token = $null; $find.Enabled = $true }
})
$save.Add_Click({
    if ($list.SelectedIndex -lt 0) { $status.Text = 'Bạn cần chọn nhóm nhận báo cáo.'; return }
    $group = $script:groups[$list.SelectedIndex]
    $answer = [Windows.Forms.MessageBox]::Show("Bật gửi báo cáo mỗi ngày lúc 06:30 vào nhóm:`r`n$($group.title)`r`n`r`nToken được Windows mã hóa cho tài khoản hiện tại. Máy cần bật, đăng nhập và có Internet. Chưa gửi báo cáo ngay lúc này.", 'Xác nhận nơi nhận báo cáo', 'YesNo', 'Question')
    if ($answer -ne 'Yes') { return }
    $save.Enabled = $false
    $stage = 'timezone'
    try {
        if ((Get-TimeZone).Id -ne 'SE Asia Standard Time') { throw 'Máy chưa đặt múi giờ Việt Nam. Chưa bật lịch.' }
        $stage = 'token'
        if ([string]::IsNullOrWhiteSpace($script:boundToken)) { throw 'Missing checked token' }
        $stage = 'directory'
        New-Item -ItemType Directory -Path $script:setupDirectory -Force | Out-Null
        $stage = 'encryption'
        $secure = ConvertTo-SecureString $script:boundToken -AsPlainText -Force
        $config = @{ botUsername = 'HNi766_bot'; encryptedToken = (ConvertFrom-SecureString $secure); chatId = $group.chatId; groupTitle = $group.title; threadId = $group.threadId; timezone = 'Asia/Ho_Chi_Minh'; sendTime = '06:30'; agencyLimit = 3; communeLimit = 10 }
        $stage = 'save-config'
        [IO.File]::WriteAllText((Join-Path $script:setupDirectory 'config.json'), ($config | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        $stage = 'task-action'
        $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $action = New-ScheduledTaskAction -Execute "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script:reportRunner) -WorkingDirectory $script:setupRoot
        $stage = 'task-settings'
        $trigger = New-ScheduledTaskTrigger -Daily -At '06:30'
        $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
        $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
        $stage = 'register-task'
        Register-ScheduledTask -TaskName 'Hanoi-766-Telegram-Report' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Send public Hanoi 766 leadership report at 06:30 Vietnam time to the approved Telegram group.' -Force | Out-Null
        $stage = 'save-status'
        [IO.File]::WriteAllText((Join-Path $script:setupDirectory 'setup-status.json'), (@{ status = 'ready'; botUsername = 'HNi766_bot'; groupTitle = $group.title; sendTime = '06:30'; configuredAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        $script:boundToken = $null; $tokenInput.Clear()
        $status.Text = 'Đã lưu mã hóa và bật lịch 06:30. Chưa gửi tin thử. Có thể đóng cửa sổ và báo lại đã cấu hình.'
        $find.Enabled = $false
    } catch {
        $failure = @{ stage = $stage; errorType = $_.Exception.GetType().Name; errorCode = $_.FullyQualifiedErrorId; checkedAt = [DateTime]::UtcNow.ToString('o') }
        try {
            New-Item -ItemType Directory -Path $script:setupDirectory -Force | Out-Null
            [IO.File]::WriteAllText((Join-Path $script:setupDirectory 'schedule-diagnostic.json'), ($failure | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        } catch {}
        $status.Text = "Chưa hoàn tất. Bước: $stage; mã: $($failure.errorCode). Không gửi token vào chat."
        $save.Enabled = $true
    }
})
$form.Add_FormClosed({ $tokenInput.Clear(); $script:boundToken = $null })
[void]$form.ShowDialog()
