$ErrorActionPreference = 'Continue'

# Enable VBOM access for all installed Office versions
foreach ($ver in @('16.0', '15.0', '14.0', '17.0')) {
    $rp = "HKCU:\Software\Microsoft\Office\$ver\Excel\Security"
    if (Test-Path $rp) {
        Set-ItemProperty -Path $rp -Name 'AccessVBOM'    -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
        Set-ItemProperty -Path $rp -Name 'VBAWarnings'   -Value 1 -Type DWord -Force -ErrorAction SilentlyContinue
        Write-Host "Registry set for Office $ver"
    }
}

# Kill stale Excel
Get-Process -Name EXCEL -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 2000
Write-Host 'Killed stale Excel processes'

$filePath   = 'c:\Pranav\SiddhaAI\02_Bravoro\01_WebsiteRepo\leapleadsai\InputFiles\BulkSearch_Template_orignal.xlsm'
$shVbaPath  = 'c:\Pranav\SiddhaAI\02_Bravoro\01_WebsiteRepo\leapleadsai\sheet_vba.txt'
$wbVbaPath  = 'c:\Pranav\SiddhaAI\02_Bravoro\01_WebsiteRepo\leapleadsai\wb_vba.txt'
$pwd        = '@Gurudev108!!'

Remove-Item -Path "${filePath}:Zone.Identifier" -ErrorAction SilentlyContinue

$excel = New-Object -ComObject Excel.Application
$excel.Visible        = $false
$excel.DisplayAlerts  = $false
$excel.AutomationSecurity = 3   # msoAutomationSecurityForceDisable — prevent Workbook_Open/SelectionChange from blocking

$wb = $excel.Workbooks.Open($filePath)
$ws = $wb.Sheets.Item(1)
Write-Host "Opened sheet: $($ws.Name)  CodeName: $($ws.CodeName)"

# Unprotect
$ws.Unprotect($pwd)
Write-Host 'Sheet unprotected'

# -------- Helper: set header cell --------
function Set-Header($ws, $col, $text) {
    $c = $ws.Cells.Item(1, $col)
    $c.Value2               = $text
    $c.Font.Bold            = $true
    $c.Font.Size            = 14
    $c.Font.Name            = 'Calibri'
    $c.Font.Color           = 0
    $c.Interior.Color       = 11389944   # existing header green
    $c.Locked               = $true
    $c.WrapText             = $true
    # borders
    foreach ($side in @(7,8,9,10)) {
        $c.Borders($side).LineStyle = 1   # xlContinuous
        $c.Borders($side).Weight   = 2   # xlThin
        $c.Borders($side).Color    = 0
    }
}

Set-Header $ws 8  'Toggle job search'
Set-Header $ws 9  'Job Title'
Set-Header $ws 10 'Job seniority'
Set-Header $ws 11 'Date Posted (days)'
Write-Host 'Headers set'

# -------- H2:H101 — Yes/No, always unlocked --------
$hRng = $ws.Range('H2:H101')
$hRng.Interior.ColorIndex = -4142   # xlNone (clear)
$hRng.Locked = $false
$hRng.Validation.Delete()
$hRng.Validation.Add(3, 1, 1, 'Yes,No')   # xlValidateList
$hRng.Validation.IgnoreBlank     = $true
$hRng.Validation.InCellDropdown  = $true
$hRng.Validation.ShowError       = $true
$hRng.Validation.ErrorTitle      = 'Invalid Entry'
$hRng.Validation.ErrorMessage    = 'Please select Yes or No.'
Write-Host 'H validation set'

# -------- I2:I101 — locked initially, CF gray when H blank/No --------
$iRng = $ws.Range('I2:I101')
$iRng.Interior.ColorIndex = -4142
$iRng.Locked = $true
$iRng.FormatConditions.Delete()
$iRng.FormatConditions.Add(2, 1, '=OR(H2="",H2="No")')  # xlExpression=2
$iRng.FormatConditions(1).Interior.Color = 15921906      # light gray
$ws.Columns('I').ColumnWidth = 26
Write-Host 'I column set'

# -------- J2:J101 — locked, multi-select list, CF gray --------
$jRng = $ws.Range('J2:J101')
$jRng.Interior.ColorIndex = -4142
$jRng.Locked = $true
$jRng.Validation.Delete()
$jRng.Validation.Add(3, 1, 1, 'Internship,Entry level,Associate,Mid-Senior level,Director,Executive')
$jRng.Validation.IgnoreBlank    = $true
$jRng.Validation.InCellDropdown = $true
$jRng.Validation.ShowError      = $true
$jRng.Validation.ErrorTitle     = 'Invalid Entry'
$jRng.Validation.ErrorMessage   = 'Choose from the seniority list.'
$jRng.FormatConditions.Delete()
$jRng.FormatConditions.Add(2, 1, '=OR(H2="",H2="No")')
$jRng.FormatConditions(1).Interior.Color = 15921906
$ws.Columns('J').AutoFit()
Write-Host 'J column set'

# -------- K2:K101 — locked, integer only, CF gray --------
$kRng = $ws.Range('K2:K101')
$kRng.Interior.ColorIndex = -4142
$kRng.Locked = $true
$kRng.Validation.Delete()
$kRng.Validation.Add(1, 1, 1, '1', '9999')   # xlValidateWholeNumber=1, xlBetween=1
$kRng.Validation.IgnoreBlank  = $true
$kRng.Validation.ShowError    = $true
$kRng.Validation.ErrorTitle   = 'Whole number required'
$kRng.Validation.ErrorMessage = 'Enter days back. 7=last week, 30=last month, 90=last quarter.'
$kRng.FormatConditions.Delete()
$kRng.FormatConditions.Add(2, 1, '=OR(H2="",H2="No")')
$kRng.FormatConditions(1).Interior.Color = 15921906
$ws.Columns('K').AutoFit()
Write-Host 'K column set'

# Unlock rows where H is already "Yes" (preserve existing data)
for ($row = 2; $row -le 101; $row++) {
    $hv = $ws.Cells.Item($row, 8).Value2
    if ($hv -ne $null -and ($hv.ToString().Trim().ToUpper() -eq 'YES')) {
        $ws.Range("I${row}:K${row}").Locked = $false
    }
}
Write-Host 'Existing YES rows unlocked'

# -------- VBA injection --------
$vbaOk = $false
try {
    Start-Sleep -Milliseconds 300
    $vbProj = $wb.VBProject
    if ($null -eq $vbProj) { throw 'VBProject is null — VBOM access denied' }
    Write-Host "VBProject accessible: $($vbProj.Name)"

    $sheetVba = [System.IO.File]::ReadAllText($shVbaPath)
    $wbVba    = [System.IO.File]::ReadAllText($wbVbaPath)

    # Sheet module
    $shComp = $null
    foreach ($comp in @($vbProj.VBComponents)) {
        if ($comp.Name -eq $ws.CodeName) { $shComp = $comp; break }
    }
    if ($null -ne $shComp) {
        $cm = $shComp.CodeModule
        if ($cm.CountOfLines -gt 0) { $cm.DeleteLines(1, $cm.CountOfLines) }
        $cm.AddFromString($sheetVba)
        Write-Host "Sheet VBA injected into: $($shComp.Name)"
    } else {
        Write-Host "WARNING: could not find sheet VBComponent for CodeName=$($ws.CodeName)"
    }

    # ThisWorkbook module
    $wbComp = $null
    foreach ($comp in @($vbProj.VBComponents)) {
        if ($comp.Type -eq 100 -and $comp.Name -ne $ws.CodeName) { $wbComp = $comp; break }
    }
    if ($null -ne $wbComp) {
        $cm = $wbComp.CodeModule
        if ($cm.CountOfLines -gt 0) { $cm.DeleteLines(1, $cm.CountOfLines) }
        $cm.AddFromString($wbVba)
        Write-Host "Workbook VBA injected into: $($wbComp.Name)"
    }

    $vbaOk = $true
} catch {
    Write-Host "VBA injection SKIPPED: $_"
    Write-Host "=> Cells will show correct colours but locking won't toggle dynamically."
    Write-Host "=> To enable dynamic locking: File > Options > Trust Center > Macro Settings >"
    Write-Host "   tick 'Trust access to the VBA project object model', re-run this script."
}

# Protect sheet (UserInterfaceOnly so VBA can write to locked cells at runtime)
$ws.Protect($pwd, $false, $true, $false, $true)
Write-Host "Sheet protected (UserInterfaceOnly=$vbaOk)"

$wb.Save()
Write-Host 'Saved'

$wb.Close($false)
$excel.Quit()
[System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
Write-Host 'Done'
