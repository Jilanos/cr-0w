param([Parameter(Mandatory=$true)][string]$RequestFile)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$script:wrote = $false
$script:phase = 'connect'
function Stamp($value) { ([datetime]$value).ToUniversalTime().ToString('o') }
function Folder($id, $store) {
    if (-not $id) { throw 'Identifiant du dossier manquant. Synchronise la boîte.' }
    if ($store) { return $script:ns.GetFolderFromID([string]$id, [string]$store) }
    return $script:ns.GetFolderFromID([string]$id)
}
function Item($id, $store) {
    if (-not $id) { throw 'Identifiant du message manquant. Synchronise la boîte.' }
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
    $subject = [string]$mail.Subject; if (-not $subject) { $subject = '(sans objet)' }
    return @{id=[string]$mail.EntryID; entry_id=[string]$mail.EntryID; store_id=[string]$mail.Parent.StoreID;
        conversation_id=[string]$mail.ConversationID; folder_id=[string]$mail.Parent.EntryID;
        from=@{name=[string]$mail.SenderName; address=$sender}; subject=$subject;
        preview=$body.Substring(0, [Math]::Min(1000, $body.Length)); preview_truncated=($body.Length -gt 1000);
        received=(Stamp $mail.ReceivedTime); unread=[bool]$mail.UnRead; has_attachments=($mail.Attachments.Count -gt 0);
        attachments=(Attachments $mail); to_count=[int]$mail.Recipients.Count; sent=[bool]$mail.Sent; is_draft=([string]$mail.Parent.EntryID -eq [string]$script:ns.GetDefaultFolder(16).EntryID)}
}
function Body($mail) {
    $row = Summary $mail
    $recipients = Recipients $mail
    $row.body_text = [string]$mail.Body; $row.html = [string]$mail.HTMLBody
    $row.to = @($recipients | Where-Object { $_.type -eq 1 }); $row.cc = @($recipients | Where-Object { $_.type -eq 2 })
    $row.outlook_link = 'outlook:' + [string]$mail.EntryID
    return $row
}
function Tree {
    $rows = New-Object 'System.Collections.Generic.List[object]'
    $errors = New-Object 'System.Collections.Generic.List[string]'
    $roles = @{}
    foreach ($store in $script:ns.Stores) {
        foreach ($pair in @(@(6,'inbox'),@(16,'drafts'),@(5,'sentitems'),@(3,'deleteditems'),@(4,'outbox'),@(23,'junkemail'),@(9,'calendar'),@(10,'contacts'),@(13,'tasks'))) {
            try { $f = $store.GetDefaultFolder([int]$pair[0]); $roles[[string]$f.EntryID] = $pair[1] } catch {}
        }
        # Exchange's one-click archive folder has no OlDefaultFolders enum value.
        try {
            $root = $store.GetRootFolder()
            $archive = $root.PropertyAccessor.GetProperty('http://schemas.microsoft.com/mapi/proptag/0x35FF0102')
            $archiveId = $root.PropertyAccessor.BinaryToString($archive)
            $roles[$archiveId] = 'archive'
        } catch {}
    }
    function Walk($f, $parent, $prefix, $depth) {
        if ($depth -gt 60 -or $rows.Count -ge 20000) { $errors.Add('Arborescence trop grande.'); return }
        $path = if ($prefix) { $prefix + '/' + [string]$f.Name } else { [string]$f.Name }
        $id = [string]$f.EntryID
        $rows.Add(@{id=$id; entry_id=$id; store_id=[string]$f.StoreID; path=$path; parent_id=$parent;
            well_known=$roles[$id]; mail_folder=($depth -gt 0 -and $f.DefaultItemType -eq 0)})
        try { foreach ($child in $f.Folders) { Walk $child $id $path ($depth + 1) } }
        catch { $errors.Add('Un sous-dossier ne peut pas être lu.') }
    }
    foreach ($store in $script:ns.Stores) {
        try { Walk ($store.GetRootFolder()) $null '' 0 } catch { $errors.Add('Un magasin ne peut pas être lu.') }
    }
    return @{folders=@($rows.ToArray()); folders_complete=($errors.Count -eq 0); errors=@($errors.ToArray())}
}
function Conversation($mail, $limit) {
    $rows = @(); $complete = $true
    $conversation = $mail.GetConversation()
    if ($null -eq $conversation) { return @{items=@(); complete=$false; reason='Conversation native indisponible.'} }
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
    $allowed = @('probe','folders','inbox','calendar','body','conversation','history','move','reply_all','draft','delete_draft')
    if ($request.action -notin $allowed) { throw 'Action Outlook non autorisée.' }
    $app = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application')
    $script:ns = $app.GetNamespace('MAPI')
    $script:phase = 'read'
    switch ($request.action) {
        'probe' {
            $inbox = $script:ns.GetDefaultFolder(6)
            $drafts = $script:ns.GetDefaultFolder(16)
            foreach ($f in $request.folders) { $null = Folder $f.id $f.store_id }
            $result = @{connected=$true; folders_resolvable=$true; inbox_id=[string]$inbox.EntryID; drafts_id=[string]$drafts.EntryID; store_id=[string]$inbox.StoreID}
        }
        'folders' { $result = Tree }
        'inbox' {
            $folder = $script:ns.GetDefaultFolder(6); $items = $folder.Items; $items.Sort('[ReceivedTime]', $true)
            $rows = @(); $errors = @(); $count = $items.Count; $limit = [Math]::Min(10000, [Math]::Max(1, [int]$request.limit))
            for ($i=1; $i -le [Math]::Min($limit,$count); $i++) {
                try { $mail = $items.Item($i); if ($mail.Class -eq 43) { $rows += Summary $mail } }
                catch { $errors += 'Un message de la boîte ne peut pas être lu.' }
            }
            $complete = ($count -le $limit -and $errors.Count -eq 0 -and $folder.Items.Count -eq $count)
            $result = @{items=$rows; exhausted=$complete; coverage=@{status=$(if ($complete) {'complete'} else {'partial'}); total_known=$count; errors=$errors}}
        }
        'body' { $result = Body (Item $request.entry_id $request.store_id) }
        'conversation' { $result = Conversation (Item $request.entry_id $request.store_id) ([int]$request.limit) }
        'calendar' {
            $start = [datetimeoffset]::Parse($request.window_start).LocalDateTime
            $end = [datetimeoffset]::Parse($request.window_end).LocalDateTime
            $items = $script:ns.GetDefaultFolder(9).Items
            $items.Sort('[Start]'); $items.IncludeRecurrences = $true
            $filter = "[Start] < '" + $end.ToString('g', [cultureinfo]::GetCultureInfo('en-US')) + "' AND [End] > '" + $start.ToString('g', [cultureinfo]::GetCultureInfo('en-US')) + "'"
            $items = $items.Restrict($filter)
            $events = @(); $event = $items.GetFirst()
            while ($null -ne $event -and $events.Count -lt 5000) {
                $events += @{id=[string]$event.EntryID; subject=[string]$event.Subject; start=(Stamp $event.Start); end=(Stamp $event.End);
                    all_day=[bool]$event.AllDayEvent; cancelled=($event.MeetingStatus -eq 5 -or $event.MeetingStatus -eq 7); location=[string]$event.Location; web_link=$null}
                $event = $items.GetNext()
            }
            $result = @{synced_at=(Stamp (Get-Date)); time_zone=$request.time_zone;
                coverage=@{status=$(if ($null -eq $event) {'complete'} else {'partial'}); window_start=$request.window_start; window_end=$request.window_end}; events=$events}
        }
        'history' {
            $folder = Folder $request.folder_id $request.store_id
            $cursor = $request.cursor; $rows = @(); $scanned = 0
            $table = $folder.GetTable(); $null = $table.Columns.Add('LastModificationTime'); $table.Sort('LastModificationTime', $false)
            $since = if ($cursor.modified) { [datetime]::Parse($cursor.modified).ToUniversalTime() } else { [datetime]::MinValue }
            if ($cursor.modified) {
                $filter = '@SQL="http://schemas.microsoft.com/mapi/proptag/0x30080040" >= ' + "'" + $since.ToString('yyyy-MM-dd HH:mm:ss') + "'"
                $table = $table.Restrict($filter); $table.Sort('LastModificationTime', $false)
            }
            $boundary = @($cursor.ids); $modified = $cursor.modified; $ids = @($cursor.ids)
            while (-not $table.EndOfTable -and $scanned -lt [int]$request.limit) {
                $row = $table.GetNextRow(); $id = [string]$row.Item('EntryID'); $stamp = Stamp $row.Item('LastModificationTime')
                if ([datetime]::Parse($stamp).ToUniversalTime() -lt $since -or ($stamp -eq $cursor.modified -and $id -in $boundary)) { continue }
                $scanned++
                $mail = Item $id $folder.StoreID
                if ($mail.Class -eq 43) {
                    $sender = Address $mail.Sender
                    $rows += @{id=$id; sender=$sender; conversation_id=[string]$mail.ConversationID; modified=$stamp}
                }
                if ($stamp -ne $modified) { $modified = $stamp; $ids = @() }; $ids += $id
            }
            $result = @{messages=$rows; scanned=$scanned; complete=$table.EndOfTable;
                cursor=@{modified=$modified; ids=$ids; sweep=$cursor.sweep; full_at=$cursor.full_at}}
        }
        'move' {
            $mail = Item $request.entry_id $request.store_id
            $target = Folder $request.folder_id $request.folder_store_id
            if ([string]$mail.Parent.EntryID -ne $request.source_id) { throw 'Le message a changé de dossier. Synchronise avant de le classer.' }
            if ($target.DefaultItemType -ne 0) { throw 'Choisis un dossier de courrier.' }
            $script:wrote = $true
            $moved = $mail.Move($target)
            $check = Item $moved.EntryID $moved.Parent.StoreID
            if ([string]$check.Parent.EntryID -ne $request.folder_id) { throw 'Déplacement non vérifié. Contrôle le dossier dans Outlook.' }
            $result = @{new_message_id=[string]$check.EntryID; folder_id=[string]$check.Parent.EntryID; store_id=[string]$check.Parent.StoreID; verified=$true}
        }
        'reply_all' {
            if (-not $request.html -or $request.html.Length -gt 200000) { throw 'Texte de réponse vide ou trop long.' }
            $mail = Item $request.entry_id $request.store_id
            if ($mail.Class -ne 43) { throw 'Choisis un message de courrier.' }
            $draft = $mail.ReplyAll()
            $quote = [string]$draft.HTMLBody
            $quotedText = [string]$draft.Body
            $expected = Recipients $draft
            foreach ($address in $request.cc) {
                if ($address -notmatch '^[^\s<>@;]+@[^\s<>@;]+\.[^\s<>@;]+$') { throw 'Adresse Cc invalide.' }
                $r = $draft.Recipients.Add([string]$address); $r.Type = 2
            }
            if (-not $draft.Recipients.ResolveAll()) { throw 'Destinataire non résolu. Vérifie les adresses dans Outlook.' }
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
            $script:wrote = $true; $draft.Save()
            $readback = Body (Item $draft.EntryID $draft.Parent.StoreID)
            $readback.draft_id = [string]$draft.EntryID; $readback.expected_recipients = $expected
            $readback.quoted_html = $quote; $readback.quoted_text = $quotedText; $readback.replied_message_id = [string]$mail.EntryID
            $readback.draft_link = 'outlook:' + [string]$draft.EntryID
            $result = $readback
        }
        'draft' {
            $draft = Item $request.entry_id $request.store_id
            if ($draft.Sent -or $draft.Parent.EntryID -ne $script:ns.GetDefaultFolder(16).EntryID) { throw 'Ce message ne se trouve pas dans Brouillons.' }
            $result = Body $draft; $result.draft_id = [string]$draft.EntryID
        }
        'delete_draft' {
            $draft = Item $request.entry_id $request.store_id
            if ($draft.Sent -or $draft.Parent.EntryID -ne $script:ns.GetDefaultFolder(16).EntryID) { throw 'Suppression refusée : ce message ne se trouve pas dans Brouillons.' }
            $script:wrote = $true; $draft.Delete()
            $remaining = $null; try { $remaining = Item $request.entry_id $request.store_id } catch {}
            if ($remaining -and $remaining.Parent.EntryID -eq $script:ns.GetDefaultFolder(16).EntryID) { throw 'Le brouillon existe encore.' }
            $result = @{deleted=$true; draft_id=$request.entry_id}
        }
    }
    @{ok=$true; result=$result} | ConvertTo-Json -Depth 25 -Compress
} catch {
    $message = if ($script:phase -eq 'connect') { 'Outlook classique non ouvert. Ouvre Outlook classique puis synchronise. Le connecteur reste disponible.' } else { 'Action Outlook impossible. ' + $_.Exception.Message }
    @{ok=$false; error=@{code=$(if ($script:phase -eq 'connect') {'com_unavailable'} else {'com_failed'}); message=$message; uncertain=$script:wrote}} | ConvertTo-Json -Depth 5 -Compress
    exit 1
}
