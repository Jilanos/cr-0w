# crow-mail-draft COM bridge: classic Outlook through a fixed action list. Never sends.
# bin/crow-mail-draft calls it with one JSON request file; it prints one JSON line {ok, result|error}.
param([Parameter(Mandatory=$true)][string]$RequestFile)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$script:wrote = $false
$script:phase = 'request'
function Drafts { $script:ns.GetDefaultFolder(16) }
function Stamp($value) { ([datetime]$value).ToUniversalTime().ToString('o') }
function Item($id, $store) {
    if (-not $id) { throw 'Message id missing.' }
    if ($store) { return $script:ns.GetItemFromID([string]$id, [string]$store) }
    return $script:ns.GetItemFromID([string]$id)
}
function Address($entry) {
    if ($null -eq $entry) { return '' }
    if ($entry.Type -eq 'EX') {
        try { $user = $entry.GetExchangeUser(); if ($user -and $user.PrimarySmtpAddress) { return [string]$user.PrimarySmtpAddress } } catch {}
        try { return [string]$entry.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x39FE001E') } catch {}
    }
    return [string]$entry.Address
}
function Recipients($mail) {
    $rows = @()
    foreach ($r in $mail.Recipients) { $rows += @{name=[string]$r.Name; address=(Address $r.AddressEntry); type=[int]$r.Type} }
    return ,$rows
}
function Attachments($mail) {
    $rows = @()
    foreach ($a in $mail.Attachments) {
        $cid = ''; try { $cid = [string]$a.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F') } catch {}
        $rows += @{name=[string]$a.FileName; size=[int]$a.Size; type=[int]$a.Type; cid=$cid}
    }
    return ,$rows
}
function Summary($mail) {
    $sender = ''; try { $sender = Address $mail.Sender } catch {}
    if (-not $sender) { $sender = [string]$mail.SenderEmailAddress }
    $body = [string]$mail.Body
    $subject = [string]$mail.Subject; if (-not $subject) { $subject = '(no subject)' }
    return @{id=[string]$mail.EntryID; entry_id=[string]$mail.EntryID; store_id=[string]$mail.Parent.StoreID;
        conversation_id=[string]$mail.ConversationID; folder_id=[string]$mail.Parent.EntryID;
        from=@{name=[string]$mail.SenderName; address=$sender}; subject=$subject;
        preview=$body.Substring(0, [Math]::Min(1000, $body.Length)); preview_truncated=($body.Length -gt 1000);
        received=(Stamp $mail.ReceivedTime); unread=[bool]$mail.UnRead; has_attachments=($mail.Attachments.Count -gt 0);
        attachments=(Attachments $mail); to_count=[int]$mail.Recipients.Count; sent=[bool]$mail.Sent; is_draft=([string]$mail.Parent.EntryID -eq [string](Drafts).EntryID)}
}
function Body($mail) {
    $row = Summary $mail
    $recipients = Recipients $mail
    $row.body_text = [string]$mail.Body; $row.html = [string]$mail.HTMLBody
    $row.to = @($recipients | Where-Object { $_.type -eq 1 }); $row.cc = @($recipients | Where-Object { $_.type -eq 2 })
    $row.outlook_link = 'outlook:' + [string]$mail.EntryID
    return $row
}
function QuotedThread([string]$html) {
    # Word inserts the user's automatic signature before its original-message bookmark.
    # Preserve the original header and all its ancestors; drop only that reply prefix.
    $signature = [regex]::Match($html, '(?is)\bname\s*=\s*["'']?_MailAutoSig\b')
    if (-not $signature.Success) { return $html }
    $original = [regex]::Match($html, '(?is)\bname\s*=\s*["'']?_MailOriginal\b')
    if (-not $original.Success -or $original.Index -lt $signature.Index) {
        throw 'Automatic signature cannot be isolated. Turn off the reply signature in Outlook.'
    }
    $stack = New-Object 'System.Collections.Generic.List[object]'
    $bodyEnd = 0
    foreach ($tag in [regex]::Matches($html.Substring(0,$original.Index), '(?is)<!--.*?-->|<[^>]+>')) {
        $name = [regex]::Match($tag.Value, '^<\s*(/?)\s*([a-z0-9:]+)', 'IgnoreCase')
        if (-not $name.Success) { continue }
        $kind = $name.Groups[2].Value.ToLowerInvariant()
        if ($name.Groups[1].Value -eq '/') {
            for ($i=$stack.Count-1; $i -ge 0; $i--) {
                if ($stack[$i].kind -eq $kind) { $stack.RemoveRange($i,$stack.Count-$i); break }
            }
        } elseif ($kind -notin @('img','br','hr','meta','link','input','area','base','wbr') -and -not $tag.Value.EndsWith('/>')) {
            $stack.Add(@{kind=$kind; tag=$tag.Value; index=$tag.Index})
            if ($kind -eq 'body') { $bodyEnd = $tag.Index + $tag.Length }
        }
    }
    $header = -1
    for ($i=$stack.Count-1; $i -ge 0; $i--) {
        if ($stack[$i].kind -eq 'div' -and $stack[$i].tag -match 'border-top\s*:') { $header = $i; break }
    }
    if ($header -lt 0 -or $bodyEnd -eq 0) { throw 'Thread header cannot be isolated. Open the message in Outlook.' }
    $prefix = $html.Substring(0,$bodyEnd)
    $inside = $false
    for ($i=0; $i -lt $header; $i++) {
        if ($stack[$i].kind -eq 'body') { $inside = $true; continue }
        if ($inside) { $prefix += $stack[$i].tag }
    }
    return $prefix + $html.Substring($stack[$header].index)
}
function InlineCids([string]$html) {
    $ids = @()
    foreach ($image in [regex]::Matches($html, '(?is)<img\b[^>]*>')) {
        $cid = [regex]::Match($image.Value, '(?is)\bsrc\s*=\s*["'']?cid:([^"''\s>]+)')
        if ($cid.Success -and $cid.Groups[1].Value -notin $ids) { $ids += $cid.Groups[1].Value }
    }
    return ,$ids
}
function PreserveInline($source, $draft, [string]$quoted) {
    $sourceCids = InlineCids ([string]$source.HTMLBody)
    $quoteCids = InlineCids $quoted
    if ($sourceCids.Count -ne $quoteCids.Count) { throw 'Thread images cannot be matched. Open the message in Outlook.' }
    $directory = Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName())
    $null = [IO.Directory]::CreateDirectory($directory)
    try {
        for ($i=$draft.Attachments.Count; $i -ge 1; $i--) {
            $a = $draft.Attachments.Item($i); $cid = ''
            try { $cid = [string]$a.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F') } catch {}
            if ($cid -and ($cid -notin $quoteCids -or $a.Size -eq 0)) { $a.Delete() }
        }
        for ($i=0; $i -lt $quoteCids.Count; $i++) {
            $existing = @(Attachments $draft | Where-Object { $_.cid -eq $quoteCids[$i] -and $_.size -gt 0 })
            if ($existing.Count) { continue }
            $original = $null
            foreach ($a in $source.Attachments) {
                $cid = ''; try { $cid = [string]$a.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F') } catch {}
                if ($cid -eq $sourceCids[$i]) { $original = $a; break }
            }
            if ($null -eq $original) { throw 'Original image unavailable. Download the message in Outlook.' }
            $path = Join-Path $directory ([IO.Path]::GetFileName([string]$original.FileName))
            $original.SaveAsFile($path)
            if ((Get-Item -LiteralPath $path).Length -eq 0) { throw 'Original image empty. Download the message in Outlook.' }
            $a = $draft.Attachments.Add($path, 1)
            $a.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F', [string]$quoteCids[$i])
            $a.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x7FFE000B', $true)
        }
    } finally { Remove-Item -LiteralPath $directory -Recurse -Force }
}
function Conversation($mail, $limit) {
    $rows = @(); $complete = $true
    $conversation = $mail.GetConversation()
    if ($null -eq $conversation) { return @{items=@(); complete=$false; reason='Native conversation unavailable.'} }
    $table = $conversation.GetTable()
    $tag = 'http://schemas.microsoft.com/mapi/proptag/0x0FFB0102'
    $null = $table.Columns.Add($tag)
    while (-not $table.EndOfTable -and $rows.Count -lt $limit) {
        $r = $table.GetNextRow()
        try {
            $m = Item $r.Item('EntryID') ($r.BinaryToString($tag))
            if ($m.Class -eq 43) { $rows += Summary $m }
        } catch { $complete = $false }
    }
    return @{items=$rows; complete=($complete -and $table.EndOfTable)}
}
try {
    $request = [IO.File]::ReadAllText($RequestFile, [Text.Encoding]::UTF8) | ConvertFrom-Json
    $allowed = @('probe','inbox','body','conversation','reply','draft','delete_draft')
    if ($request.action -notin $allowed) { throw 'Outlook action not allowed.' }
    $script:phase = 'connect'
    $app = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
    $script:ns = $app.GetNamespace('MAPI')
    $script:phase = 'read'
    switch ($request.action) {
        'probe' {
            $inbox = $script:ns.GetDefaultFolder(6)
            $result = @{connected=$true; inbox_id=[string]$inbox.EntryID; drafts_id=[string](Drafts).EntryID; store_id=[string]$inbox.StoreID}
        }
        'inbox' {
            $items = $script:ns.GetDefaultFolder(6).Items; $items.Sort('[ReceivedTime]', $true)
            $rows = @(); $limit = [Math]::Min(500, [Math]::Max(1, [int]$request.limit))
            for ($i=1; $i -le [Math]::Min($limit, $items.Count); $i++) {
                try { $mail = $items.Item($i); if ($mail.Class -eq 43) { $rows += Summary $mail } } catch {}
            }
            $result = @{items=$rows; total=[int]$items.Count}
        }
        'body' { $result = Body (Item $request.entry_id $request.store_id) }
        'conversation' { $result = Conversation (Item $request.entry_id $request.store_id) ([Math]::Max(1, [int]$request.limit)) }
        'reply' {
            if (-not $request.html -or $request.html.Length -gt 200000) { throw 'Reply text empty or too long.' }
            $mail = Item $request.entry_id $request.store_id
            if ($mail.Class -ne 43) { throw 'Pick a mail message.' }
            foreach ($address in $request.cc) {
                if ($address -notmatch '^[^\s<>@;]+@[^\s<>@;]+\.[^\s<>@;]+$') { throw 'Invalid Cc address.' }
            }
            $script:wrote = $true
            if ($request.mode -eq 'sender') { $draft = $mail.Reply() } else { $draft = $mail.ReplyAll() }
            # ReplyAll inserts the automatic signature; QuotedThread keeps only the quoted thread.
            $quote = QuotedThread ([string]$draft.HTMLBody)
            $expected = Recipients $draft
            PreserveInline $mail $draft $quote
            foreach ($address in $request.cc) { $r = $draft.Recipients.Add([string]$address); $r.Type = 2 }
            if (-not $draft.Recipients.ResolveAll()) { throw 'Recipient not resolved. Check the addresses in Outlook.' }
            $draft.BodyFormat = 2
            $fragment = '<div id="crow-reply">' + [string]$request.html + '</div>'
            $match = [regex]::Match($quote, '(?is)<body\b[^>]*>')
            if ($match.Success) { $draft.HTMLBody = $quote.Insert($match.Index + $match.Length, $fragment) }
            else { $draft.HTMLBody = $fragment + $quote }
            foreach ($file in $request.files) {
                $attachment = $draft.Attachments.Add([string]$file.path, 1)
                if ($file.cid) {
                    $attachment.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x3712001F', [string]$file.cid)
                    $attachment.PropertyAccessor.SetProperty('http://schemas.microsoft.com/mapi/proptag/0x7FFE000B', $true)
                }
            }
            $draft.Save()
            $readback = Body (Item $draft.EntryID $draft.Parent.StoreID)
            $readback.draft_id = [string]$draft.EntryID; $readback.expected_recipients = $expected
            $readback.quoted_text = [string]$mail.Body; $readback.replied_message_id = [string]$mail.EntryID
            $result = $readback
        }
        'draft' {
            $draft = Item $request.entry_id $request.store_id
            if ($draft.Sent -or [string]$draft.Parent.EntryID -ne [string](Drafts).EntryID) { throw 'This message is not in Drafts.' }
            $result = Body $draft; $result.draft_id = [string]$draft.EntryID
        }
        'delete_draft' {
            $draft = Item $request.entry_id $request.store_id
            if ($draft.Sent -or [string]$draft.Parent.EntryID -ne [string](Drafts).EntryID) { throw 'Delete refused: this message is not in Drafts.' }
            $script:wrote = $true; $draft.Delete()
            $remaining = $null; try { $remaining = Item $request.entry_id $request.store_id } catch {}
            if ($remaining -and [string]$remaining.Parent.EntryID -eq [string](Drafts).EntryID) { throw 'The draft still exists.' }
            $result = @{deleted=$true; draft_id=[string]$request.entry_id}
        }
    }
    @{ok=$true; result=$result} | ConvertTo-Json -Depth 25 -Compress
} catch {
    $message = if ($script:phase -eq 'connect') { 'Classic Outlook is not running. Open it and retry.' } else { 'Outlook action failed. ' + $_.Exception.Message }
    @{ok=$false; error=@{code=$(if ($script:phase -eq 'connect') {'com_unavailable'} else {'com_failed'}); message=$message; uncertain=$script:wrote}} | ConvertTo-Json -Depth 5 -Compress
    exit 1
}
