param(
  [string]$InputPath = "C:\Users\nikol\Downloads\2026 ljetni rok.xlsx",
  [string]$OutputPath = "data\matura_study_programs.json"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-ColumnNumber([string]$cellRef) {
  $letters = $cellRef -replace '\d', ''
  $number = 0
  foreach ($char in $letters.ToCharArray()) {
    $number = ($number * 26) + ([int][char]$char - [int][char]'A' + 1)
  }
  return $number
}

function Get-CellText($cell, [string[]]$sharedStrings) {
  if ($cell.t -eq 's') {
    $index = [int]$cell.v
    return $sharedStrings[$index]
  }
  if ($cell.t -eq 'inlineStr') {
    return [string]$cell.is.t
  }
  return [string]$cell.v
}

function New-StableUuid([string]$text) {
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text))
  $bytes[6] = ($bytes[6] -band 0x0f) -bor 0x40
  $bytes[8] = ($bytes[8] -band 0x3f) -bor 0x80
  return ([Guid]::new([byte[]]$bytes[0..15])).ToString()
}

function Convert-Number($value) {
  $text = ([string]$value).Trim().Replace(',', '.')
  $number = 0
  if ([double]::TryParse($text, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$number)) {
    return [int][Math]::Round($number)
  }
  return 0
}

if (!(Test-Path -LiteralPath $InputPath)) {
  throw "Excel datoteka nije pronađena: $InputPath"
}

$zip = [System.IO.Compression.ZipFile]::OpenRead($InputPath)
try {
  $sharedStrings = @()
  $sharedStringsEntry = $zip.GetEntry('xl/sharedStrings.xml')
  if ($sharedStringsEntry) {
    $reader = [IO.StreamReader]::new($sharedStringsEntry.Open())
    [xml]$sharedStringsXml = $reader.ReadToEnd()
    $reader.Close()
    foreach ($item in $sharedStringsXml.sst.si) {
      $parts = @()
      foreach ($textNode in $item.GetElementsByTagName('t')) {
        $parts += $textNode.InnerText
      }
      $sharedStrings += (($parts -join '') -replace '\s+', ' ').Trim()
    }
  }

  $sheetEntry = $zip.GetEntry('xl/worksheets/sheet1.xml')
  $reader = [IO.StreamReader]::new($sheetEntry.Open())
  [xml]$sheetXml = $reader.ReadToEnd()
  $reader.Close()

  $programs = @()

  foreach ($row in $sheetXml.worksheet.sheetData.row) {
    $values = @{}
    foreach ($cell in $row.c) {
      $columnNumber = Get-ColumnNumber $cell.r
      $values[$columnNumber] = ((Get-CellText $cell $sharedStrings) -replace '\s+', ' ').Trim()
    }

    if ([int]$row.r -eq 1) {
      continue
    }

    $faculty = $values[1]
    $institutionType = $values[2]
    $component = $values[3]
    $studyType = $values[4]
    $studyName = $values[5]
    $city = $values[6]
    $quota = Convert-Number $values[7]

    if ([string]::IsNullOrWhiteSpace($faculty) -or [string]::IsNullOrWhiteSpace($studyName) -or [string]::IsNullOrWhiteSpace($city)) {
      continue
    }

    $identity = "$faculty|$component|$studyType|$studyName|$city|2026-LJETNI"
    $programs += [ordered]@{
      id = New-StableUuid $identity
      school_id = $null
      source_year = '2026'
      source_round = 'LJETNI'
      source_file = '2026 ljetni rok.xlsx'
      faculty = $faculty
      component = if ([string]::IsNullOrWhiteSpace($component)) { $null } else { $component }
      study_name = $studyName
      city = $city
      study_type = $studyType
      institution_type = $institutionType
      area = $null
      field = $null
      quota_type = 'Bez posebne kvote'
      admission_round = 'LJETNI'
      is_active = $true
      citizen_quota = $quota
      foreign_quota = 0
      school_gpa_weight = 30
      required_exams = @(
        [ordered]@{ subject_name = 'Hrvatski jezik'; level = '-'; threshold = ''; weight = '0'; is_required = $true },
        [ordered]@{ subject_name = 'Matematika'; level = 'B'; threshold = ''; weight = '0'; is_required = $true },
        [ordered]@{ subject_name = 'Strani jezik'; level = 'B'; threshold = ''; weight = '0'; is_required = $true }
      )
      elective_exams = @()
      special_achievements = @()
      health_considerations = @()
      created_by = $null
      updated_by = $null
      created_at = '2026-09-04T00:00:00.000Z'
      updated_at = '2026-09-04T00:00:00.000Z'
    }
  }

  $resolvedOutput = if ([IO.Path]::IsPathRooted($OutputPath)) { $OutputPath } else { Join-Path (Get-Location) $OutputPath }
  $outputDir = Split-Path -Parent $resolvedOutput
  if (!(Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
  }
  $json = $programs | ConvertTo-Json -Depth 10
  [IO.File]::WriteAllText($resolvedOutput, $json, [Text.UTF8Encoding]::new($false))
  Write-Host "Imported $($programs.Count) study programs to $resolvedOutput"
} finally {
  $zip.Dispose()
}
