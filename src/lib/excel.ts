import type { Tournament, Match, Standing, Field } from './supabase'

// ── Zaans Licht kleuren (ARGB voor ExcelJS) ────────────────────────────────
const C_ORANGE  = 'FFFF6B00'
const C_DARK    = 'FF1A1A1A'
const C_WHITE   = 'FFFFFFFF'
const C_GRAY_LT = 'FFF8F8F8'
const C_GRAY_BD = 'FFE5E7EB'
const C_BLUE_LT = 'FFEFF6FF'  // KO-rondes achtergrond
const C_YELLOW  = 'FFFEF9C3'  // lege invulvakken

const KO_LABEL: Record<string, string> = {
  quarter_final: 'Kwartfinales',
  semi_final:    'Halve finales',
  final:         'Finale',
  third_place:   'Wedstrijd om 3e plaats',
}

const STATUS_NL: Record<string, string> = {
  scheduled: 'Gepland',
  live:      'Live',
  finished:  'Gespeeld',
  cancelled: 'Geannuleerd',
}

// ── Helpers ────────────────────────────────────────────────────────────────
type Fill   = import('exceljs').Fill
type Border = import('exceljs').Borders

function solidFill(argb: string): Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function thinBorder(argb = C_GRAY_BD): Border {
  const s = { style: 'thin' as const, color: { argb } }
  return { top: s, left: s, bottom: s, right: s, diagonal: {} }
}

function getRoundTime(tournament: Tournament, groupIdx: number): string {
  if (!tournament.starts_at) return ''
  const per = (tournament.match_duration_minutes + (tournament.break_minutes ?? 25)) * 60_000
  return new Date(new Date(tournament.starts_at).getTime() + groupIdx * per)
    .toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
}

// ── Hoofd export ─────────────────────────────────────────────────────────────
export async function downloadTournamentExcel(
  tournament: Tournament,
  matches: Match[],
  standings: Standing[],
  fields: Field[],
  mode: 'blank' | 'filled',
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Zaans Licht Toernooi'
  wb.created = new Date()

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 1: Schema
  // ══════════════════════════════════════════════════════════════════════════
  const ws1 = wb.addWorksheet('Schema', {
    pageSetup: {
      paperSize: 9,           // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
  })

  // Kolombreedte
  ws1.columns = [
    { width: 7  },  // A: Ronde
    { width: 16 },  // B: Fase
    { width: 7  },  // C: Tijd
    { width: 12 },  // D: Veld
    { width: 20 },  // E: Thuisteam
    { width: 7  },  // F: Score thuis  ← invulvak
    { width: 3  },  // G: –
    { width: 7  },  // H: Score uit    ← invulvak
    { width: 20 },  // I: Uitteam
    { width: 14 },  // J: Scheidsrechter
    { width: 10 },  // K: Status
  ]

  // ─── Titelrij ────────────────────────────────────────────────────────────
  const titleRow = ws1.addRow([`${tournament.name}  —  Wedstrijdschema`])
  titleRow.height = 26
  ws1.mergeCells('A1:K1')
  const tc = titleRow.getCell(1)
  tc.font      = { bold: true, size: 14, color: { argb: C_WHITE } }
  tc.fill      = solidFill(C_ORANGE)
  tc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  // ─── Subtitelrij ─────────────────────────────────────────────────────────
  const now     = new Date()
  const dateStr = now.toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const modeStr = mode === 'blank'
    ? 'Leeg schema – vul hieronder de scores in'
    : `Ingevuld schema · export ${now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`
  const subRow = ws1.addRow([`${dateStr}  ·  ${modeStr}`])
  subRow.height = 16
  ws1.mergeCells('A2:K2')
  const sc = subRow.getCell(1)
  sc.font      = { size: 9, italic: true, color: { argb: 'FF888888' } }
  sc.fill      = solidFill('FF2A2A2A')
  sc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  ws1.addRow([])  // lege scheidingslijn

  // ─── Kolomkoppen ─────────────────────────────────────────────────────────
  const SCHEMA_HEADERS = ['Ronde', 'Fase', 'Tijd', 'Veld', 'Thuisteam', 'Score', '–', 'Score', 'Uitteam', 'Scheidsrechter', 'Status']
  const hdr = ws1.addRow(SCHEMA_HEADERS)
  hdr.height = 18
  hdr.eachCell(cell => {
    cell.font      = { bold: true, size: 10, color: { argb: C_WHITE } }
    cell.fill      = solidFill(C_DARK)
    cell.alignment = { vertical: 'middle', horizontal: 'center' }
    cell.border    = thinBorder()
  })

  // ─── Wedstrijdrijen ──────────────────────────────────────────────────────
  const roundMap: Record<number, Match[]> = {}
  matches.forEach(m => {
    const r = m.round ?? 0
    if (!roundMap[r]) roundMap[r] = []
    roundMap[r].push(m)
  })
  const sortedRounds = Object.keys(roundMap).map(Number).sort((a, b) => a - b)

  // Tel alleen groepsronden voor tijdberekening
  let groupRoundIdx = 0
  const SCHEMA_DATA_START = 5  // rij 5 = eerste datarij (na 4 headerrijen)
  let schemaDataEnd = SCHEMA_DATA_START - 1

  sortedRounds.forEach(roundNum => {
    const rm     = roundMap[roundNum]
    const isKO   = rm.some(m => m.phase !== 'group')
    const isGroup = !isKO

    if (isGroup) {
      // Voeg rondeseparator toe
      const sepRow = ws1.addRow([`Ronde ${roundNum}`])
      sepRow.height = 14
      ws1.mergeCells(`A${sepRow.number}:K${sepRow.number}`)
      const sep = sepRow.getCell(1)
      sep.font      = { bold: true, size: 9, color: { argb: C_ORANGE } }
      sep.fill      = solidFill('FF2A2A2A')
      sep.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    }

    rm.forEach((match, mi) => {
      const phase = match.phase === 'group'
        ? 'Groepsfase'
        : (KO_LABEL[match.phase] ?? match.phase)

      const time = match.scheduled_at
        ? new Date(match.scheduled_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        : (isGroup ? getRoundTime(tournament, groupRoundIdx) : '')

      const homeName = match.home_team?.name ?? ''
      const awayName = match.away_team?.name ?? ''
      const refName  = (match as Match & { referee?: { name: string } }).referee?.name ?? ''
      const status   = STATUS_NL[match.status] ?? match.status

      const homeScore = mode === 'filled' && match.home_score != null ? match.home_score : ''
      const awayScore = mode === 'filled' && match.away_score != null ? match.away_score : ''

      const row = ws1.addRow([
        roundNum, phase, time,
        match.field?.name ?? '',
        homeName, homeScore, '–', awayScore, awayName,
        refName, status,
      ])

      row.height = 18
      const bg = isKO ? C_BLUE_LT : (mi % 2 === 0 ? C_WHITE : C_GRAY_LT)

      row.eachCell((cell, col) => {
        cell.border    = thinBorder()
        cell.alignment = { vertical: 'middle', horizontal: col <= 4 ? 'center' : 'left' }

        if (col === 6 || col === 8) {
          // Score-invulcellen
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.font      = { bold: true, size: 12 }
          cell.fill      = mode === 'blank' ? solidFill(C_YELLOW) : solidFill(bg)
          if (mode === 'blank') {
            cell.border = {
              ...thinBorder(C_ORANGE),
              top: { style: 'medium', color: { argb: C_ORANGE } },
              bottom: { style: 'medium', color: { argb: C_ORANGE } },
              left: { style: 'medium', color: { argb: C_ORANGE } },
              right: { style: 'medium', color: { argb: C_ORANGE } },
            }
            // Getal-validatie: alleen 0–99
            cell.dataValidation = {
              type: 'whole',
              operator: 'between',
              formulae: ['0', '99'],
              showErrorMessage: true,
              errorStyle: 'warning',
              error: 'Voer een getal in tussen 0 en 99',
              errorTitle: 'Ongeldige score',
            }
          }
        } else if (col === 7) {
          cell.alignment = { vertical: 'middle', horizontal: 'center' }
          cell.font      = { bold: true, size: 11, color: { argb: 'FF888888' } }
          cell.fill      = solidFill(bg)
        } else {
          cell.fill = solidFill(bg)
          cell.font = { size: 10 }
        }
      })

      // Teamnamen vet
      row.getCell(5).font = { bold: true, size: 10 }
      row.getCell(9).font = { bold: true, size: 10 }

      // Status kleur
      if (match.status === 'finished') {
        row.getCell(11).font = { size: 10, color: { argb: 'FF22C55E' } }
      } else if (match.status === 'live') {
        row.getCell(11).font = { bold: true, size: 10, color: { argb: C_ORANGE } }
      }

      schemaDataEnd = row.number
    })

    if (isGroup) groupRoundIdx++
  })

  // Print-instellingen Schema
  ws1.headerFooter.oddHeader = `&C&B${tournament.name} — Wedstrijdschema`
  ws1.headerFooter.oddFooter = `&LZaans Licht Toernooi&C${mode === 'blank' ? 'Leeg schema' : 'Ingevuld schema'}&R&P / &N`

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 2: Standen
  //
  // Alle formules verwijzen naar het Schema-blad en berekenen automatisch
  // opnieuw zodra de gebruiker scores invult in Sheet 1.
  // Filter: fase = "Groepsfase" EN beide scores zijn ingevuld (ISNUMBER).
  // ══════════════════════════════════════════════════════════════════════════
  const ws2 = wb.addWorksheet('Standen', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
  })

  ws2.columns = [
    { width: 6  },  // A: Pool (verborgen)
    { width: 5  },  // B: Pos
    { width: 22 },  // C: Team
    { width: 7  },  // D: Gesp.
    { width: 7  },  // E: W
    { width: 7  },  // F: G
    { width: 7  },  // G: V
    { width: 7  },  // H: Voor
    { width: 7  },  // I: Tegen
    { width: 7  },  // J: Saldo
    { width: 7  },  // K: Ptn
    { width: 1  },  // L: Sorteersleutel (verborgen)
  ]

  // Titelrij Standen
  const s2Title = ws2.addRow([null, null, `${tournament.name}  —  Groepsstanden`])
  s2Title.height = 24
  ws2.mergeCells('C1:K1')
  const s2tc = s2Title.getCell(3)
  s2tc.font      = { bold: true, size: 13, color: { argb: C_WHITE } }
  s2tc.fill      = solidFill(C_ORANGE)
  s2tc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  const s2Sub = ws2.addRow([null, null,
    mode === 'blank'
      ? 'Formules werken automatisch zodra scores worden ingevuld op het blad "Schema"'
      : `Export ${now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}  ·  Scores van het blad "Schema"`,
  ])
  ws2.mergeCells('C2:K2')
  const s2sc = s2Sub.getCell(3)
  s2sc.font      = { size: 9, italic: true, color: { argb: 'FF666666' } }
  s2sc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  ws2.addRow([])  // lege rij

  // Groepen teams per poule
  const numPools     = tournament.num_pools ?? 1
  const poolNames    = tournament.pool_names ?? []
  const allTeamRows: number[] = []  // bijhouden voor Finales-formules
  let standingDataStart = 4  // wordt bijgewerkt

  for (let pool = 1; pool <= numPools; pool++) {
    // Filter standings op poule
    const poolStandings = standings.filter(s => (s.pool ?? 1) === pool)
    if (!poolStandings.length) continue

    const poolName = poolNames[pool - 1] ?? (numPools > 1 ? `Poule ${pool}` : null)

    if (poolName) {
      const phdr = ws2.addRow([null, null, poolName])
      phdr.height = 16
      ws2.mergeCells(`C${phdr.number}:K${phdr.number}`)
      const ph = phdr.getCell(3)
      ph.font      = { bold: true, size: 11, color: { argb: C_WHITE } }
      ph.fill      = solidFill(C_DARK)
      ph.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    }

    // Kolomkoppen
    const colHdr = ws2.addRow([null, 'Pos', 'Team', 'Gesp.', 'W', 'G', 'V', 'Voor', 'Tegen', 'Saldo', 'Ptn', ''])
    colHdr.height = 16
    colHdr.eachCell((cell, col) => {
      if (col < 2) return
      cell.font      = { bold: true, size: 10, color: { argb: C_WHITE } }
      cell.fill      = solidFill('FF3A3A3A')
      cell.alignment = { vertical: 'middle', horizontal: col === 3 ? 'left' : 'center' }
      cell.border    = thinBorder('FF555555')
    })

    if (allTeamRows.length === 0) standingDataStart = ws2.rowCount + 1

    // Teamrijen
    poolStandings.forEach((st, idx) => {
      const teamName = st.team?.name ?? st.team_id
      const r        = ws2.rowCount + 1  // rijnummer voor formules

      // Formulebereiken in het Schema-blad
      const E = `Schema!E$${SCHEMA_DATA_START}:E$${schemaDataEnd}`  // Thuisteam
      const I = `Schema!I$${SCHEMA_DATA_START}:I$${schemaDataEnd}`  // Uitteam
      const F = `Schema!F$${SCHEMA_DATA_START}:F$${schemaDataEnd}`  // Score thuis
      const H = `Schema!H$${SCHEMA_DATA_START}:H$${schemaDataEnd}`  // Score uit
      const B = `Schema!B$${SCHEMA_DATA_START}:B$${schemaDataEnd}`  // Fase

      // Gemeenschappelijke filtercondities: groepsfase + beide scores ingevuld
      const cond = `(${B}="Groepsfase")*ISNUMBER(${F})*ISNUMBER(${H})`
      const T    = `C${r}`  // teamnaám cel

      const fGespeeld = `=SUMPRODUCT((${E}=${T})*${cond})+SUMPRODUCT((${I}=${T})*${cond})`
      const fGewonnen = `=SUMPRODUCT((${E}=${T})*${cond}*(${F}>${H}))+SUMPRODUCT((${I}=${T})*${cond}*(${H}>${F}))`
      const fGelijk   = `=SUMPRODUCT((${E}=${T})*${cond}*(${F}=${H}))+SUMPRODUCT((${I}=${T})*${cond}*(${H}=${F}))`
      const fVerloren = `=D${r}-E${r}-F${r}`
      const fVoor     = `=SUMPRODUCT((${E}=${T})*${cond}*IFERROR(${F},0))+SUMPRODUCT((${I}=${T})*${cond}*IFERROR(${H},0))`
      const fTegen    = `=SUMPRODUCT((${E}=${T})*${cond}*IFERROR(${H},0))+SUMPRODUCT((${I}=${T})*${cond}*IFERROR(${F},0))`
      const fSaldo    = `=H${r}-I${r}`
      const fPunten   = `=E${r}*3+F${r}`
      // Sorteersleutel: ptn*10^8 + (saldo+999)*10^5 + voor*1000 + tiebreak-volgorde
      const fSortKey  = `=K${r}*100000000+(J${r}+999)*100000+H${r}*1000+(ROW()-${standingDataStart}+1)`
      // Positie: tel hoeveel teams in dezelfde poule een hogere sorteersleutel hebben
      const poolDataEnd = ws2.rowCount + (poolStandings.length - idx)
      const fPos = `=COUNTIFS(A$${standingDataStart}:A$1000,A${r},L$${standingDataStart}:L$1000,">"&L${r})+1`

      const row = ws2.addRow([pool, { formula: fPos }, teamName,
        { formula: fGespeeld }, { formula: fGewonnen }, { formula: fGelijk }, { formula: fVerloren },
        { formula: fVoor }, { formula: fTegen }, { formula: fSaldo }, { formula: fPunten },
        { formula: fSortKey },
      ])
      row.height = 17

      const bg = idx % 2 === 0 ? C_WHITE : C_GRAY_LT
      row.eachCell((cell, col) => {
        if (col < 2) { cell.fill = solidFill(C_WHITE); return }
        cell.fill      = solidFill(bg)
        cell.border    = thinBorder()
        cell.alignment = { vertical: 'middle', horizontal: col === 3 ? 'left' : 'center' }
        cell.font      = { size: 10 }
        if (col === 3) cell.font = { bold: true, size: 10 }
        if (col === 11) cell.font = { bold: true, size: 10, color: { argb: C_ORANGE } }
      })

      allTeamRows.push(r)
    })

    ws2.addRow([])  // ruimte tussen poules
  }

  // Pool-kolom (A) verbergen
  ws2.getColumn(1).hidden = true
  // Sorteersleutel (L) verbergen
  ws2.getColumn(12).hidden = true

  ws2.headerFooter.oddHeader = `&C&B${tournament.name} — Groepsstanden`
  ws2.headerFooter.oddFooter = '&LZaans Licht Toernooi&R&P / &N'

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 3: Finales (alleen als er finales zijn)
  // ══════════════════════════════════════════════════════════════════════════
  if (tournament.finals_type !== 'none') {
    const ws3 = wb.addWorksheet('Finales', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    })

    ws3.columns = [
      { width: 18 },  // A: Ronde
      { width: 22 },  // B: Thuisteam
      { width: 8  },  // C: Score thuis
      { width: 4  },  // D: –
      { width: 8  },  // E: Score uit
      { width: 22 },  // F: Uitteam
      { width: 12 },  // G: Status
    ]

    // Titelrij Finales
    const f3t = ws3.addRow([`${tournament.name}  —  Finales`])
    f3t.height = 26
    ws3.mergeCells('A1:G1')
    const f3tc = f3t.getCell(1)
    f3tc.font      = { bold: true, size: 14, color: { argb: C_WHITE } }
    f3tc.fill      = solidFill(C_ORANGE)
    f3tc.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

    const finType = {
      final:         { label: 'Finale (top 2)',           count: 2 },
      semi_final:    { label: 'Halve finales + Finale (top 4)', count: 4 },
      quarter_final: { label: 'Kwartfinales + Halve finales + Finale (top 8)', count: 8 },
    }[tournament.finals_type] ?? { label: 'Finales', count: 2 }

    const f3s = ws3.addRow([
      mode === 'blank'
        ? `${finType.label}  ·  Teams worden automatisch bepaald op basis van de Standen`
        : `${finType.label}  ·  Export ${now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`,
    ])
    f3s.height = 16
    ws3.mergeCells('A2:G2')
    f3s.getCell(1).font      = { size: 9, italic: true, color: { argb: 'FF666666' } }
    f3s.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

    ws3.addRow([])

    // Kolomkoppen
    const f3h = ws3.addRow(['Ronde', 'Thuisteam', 'Score', '–', 'Score', 'Uitteam', 'Status'])
    f3h.height = 18
    f3h.eachCell(cell => {
      cell.font      = { bold: true, size: 10, color: { argb: C_WHITE } }
      cell.fill      = solidFill(C_DARK)
      cell.alignment = { vertical: 'middle', horizontal: 'center' }
      cell.border    = thinBorder()
    })

    // Helper: haal teamnaam op uit Standen-blad voor poule P, positie N
    // Formule: INDEX + SUMPRODUCT om te vermijden dat arrayformules nodig zijn
    const teamFormula = (pool: number, pos: number): string =>
      `=IFERROR(INDEX(Standen!C:C,SUMPRODUCT((Standen!A$${standingDataStart}:A$1000=${pool})*(Standen!B$${standingDataStart}:B$1000=${pos})*ROW(Standen!A$${standingDataStart}:A$1000))),"?")`

    // Bestaande KO-wedstrijden uit het schema (filled mode)
    const koMatches = matches.filter(m => m.phase !== 'group')
    const koByPhase: Record<string, Match[]> = {}
    koMatches.forEach(m => {
      if (!koByPhase[m.phase]) koByPhase[m.phase] = []
      koByPhase[m.phase].push(m)
    })

    const PHASE_ORDER: Record<string, number> = {
      quarter_final: 1, semi_final: 2, third_place: 3, final: 4,
    }

    const phaseLabels: Record<string, string> = {
      quarter_final: 'Kwartfinale',
      semi_final:    'Halve finale',
      third_place:   'Wedstrijd om 3e pl.',
      final:         'Finale',
    }

    let finalRow = 0  // bijhouden voor kleur-alternatie

    // ── Functie: voeg een finale-match toe ───────────────────────────────
    const addFinaleRow = (
      phaseName: string,
      homeVal: string | object,
      awayVal: string | object,
      homeScore: string | number,
      awayScore: string | number,
      status: string,
      isKO = false,
    ) => {
      finalRow++
      const bg = isKO ? C_BLUE_LT : (finalRow % 2 === 0 ? C_WHITE : C_GRAY_LT)
      const row = ws3.addRow([phaseName, homeVal, homeScore, '–', awayScore, awayVal, status])
      row.height = 19

      row.eachCell((cell, col) => {
        cell.border    = thinBorder()
        cell.alignment = { vertical: 'middle', horizontal: col === 1 || col === 2 || col === 6 ? 'left' : 'center' }
        cell.fill      = solidFill(bg)
        cell.font      = { size: 10 }
        if (col === 1) cell.font = { bold: true, size: 10, color: { argb: C_DARK } }
        if (col === 2 || col === 6) cell.font = { bold: true, size: 10 }
        if (col === 3 || col === 5) {
          cell.font = { bold: true, size: 12 }
          cell.fill = mode === 'blank' ? solidFill(C_YELLOW) : solidFill(bg)
          if (mode === 'blank') {
            cell.border = {
              top: { style: 'medium', color: { argb: C_ORANGE } },
              bottom: { style: 'medium', color: { argb: C_ORANGE } },
              left: { style: 'medium', color: { argb: C_ORANGE } },
              right: { style: 'medium', color: { argb: C_ORANGE } },
            }
            cell.dataValidation = {
              type: 'whole', operator: 'between', formulae: ['0', '99'],
              showErrorMessage: true, errorStyle: 'warning',
              error: 'Voer een getal in (0–99)', errorTitle: 'Ongeldige score',
            }
          }
        }
        if (col === 4) cell.font = { bold: true, size: 11, color: { argb: 'FF888888' } }
        if (status === 'Gespeeld' && col === 7) cell.font = { size: 10, color: { argb: 'FF22C55E' } }
      })
    }

    if (mode === 'filled' && koMatches.length > 0) {
      // ── Ingevuld: toon bestaande KO-wedstrijden ───────────────────────
      const phases = Object.keys(koByPhase).sort((a, b) => (PHASE_ORDER[a] ?? 9) - (PHASE_ORDER[b] ?? 9))
      phases.forEach(phase => {
        koByPhase[phase].forEach(match => {
          const home   = match.home_team?.name ?? ''
          const away   = match.away_team?.name ?? ''
          const hs     = match.home_score ?? ''
          const as_    = match.away_score ?? ''
          const status = STATUS_NL[match.status] ?? match.status
          addFinaleRow(phaseLabels[phase] ?? phase, home, away, hs, as_, status, true)
        })
      })
    } else {
      // ── Leeg of nog geen KO: toon schema op basis van Standen-formules ─
      // Bepaal seeding op basis van tournament type en aantal poules
      const isMulti = numPools > 1
      const count   = finType.count

      if (count >= 8 && tournament.finals_type === 'quarter_final') {
        // Kwartfinales (1v8, 4v5, 2v7, 3v6)
        ws3.addRow([null])
        const kfSep = ws3.addRow(['⬛  Kwartfinales'])
        ws3.mergeCells(`A${kfSep.number}:G${kfSep.number}`)
        kfSep.getCell(1).font = { bold: true, size: 10, color: { argb: C_ORANGE } }
        const seeds = isMulti
          ? [1, 2, 3, 4, 5, 6, 7, 8].map(n => teamFormula(Math.ceil(n / (count / numPools)), ((n - 1) % (count / numPools)) + 1))
          : [1, 2, 3, 4, 5, 6, 7, 8].map(n => teamFormula(1, n))
        // Matchups: 1v8, 4v5, 2v7, 3v6
        const kfMatchups: [number, number][] = [[0,7],[3,4],[1,6],[2,5]]
        kfMatchups.forEach(([a, b]) => {
          addFinaleRow('Kwartfinale', { formula: seeds[a].slice(1) }, { formula: seeds[b].slice(1) }, '', '', 'Gepland', true)
        })
        ws3.addRow([null])
        const hfSep = ws3.addRow(['⬛  Halve finales'])
        ws3.mergeCells(`A${hfSep.number}:G${hfSep.number}`)
        hfSep.getCell(1).font = { bold: true, size: 10, color: { argb: C_ORANGE } }
        addFinaleRow('Halve finale 1', 'Winnaar KF 1', 'Winnaar KF 2', '', '', 'Gepland', true)
        addFinaleRow('Halve finale 2', 'Winnaar KF 3', 'Winnaar KF 4', '', '', 'Gepland', true)
        ws3.addRow([null])
        const fSep = ws3.addRow(['🏆  Finale + 3e Plaats'])
        ws3.mergeCells(`A${fSep.number}:G${fSep.number}`)
        fSep.getCell(1).font = { bold: true, size: 10, color: { argb: C_ORANGE } }
        addFinaleRow('Wedstrijd om 3e pl.', 'Verliezer HF 1', 'Verliezer HF 2', '', '', 'Gepland', true)
        addFinaleRow('Finale', 'Winnaar HF 1', 'Winnaar HF 2', '', '', 'Gepland', true)

      } else if (count >= 4 && tournament.finals_type === 'semi_final') {
        // Halve finales + finale (1v4, 2v3)
        const getTeam = (pos: number) => isMulti
          ? teamFormula(pos <= numPools ? pos : pos - numPools, pos <= numPools ? 1 : 2)
          : teamFormula(1, pos)

        ws3.addRow([null])
        const hfSep = ws3.addRow(['⬛  Halve finales'])
        ws3.mergeCells(`A${hfSep.number}:G${hfSep.number}`)
        hfSep.getCell(1).font = { bold: true, size: 10, color: { argb: C_ORANGE } }
        // Seeding: 1v4, 2v3
        addFinaleRow('Halve finale 1', { formula: getTeam(1).slice(1) }, { formula: getTeam(4).slice(1) }, '', '', 'Gepland', true)
        addFinaleRow('Halve finale 2', { formula: getTeam(2).slice(1) }, { formula: getTeam(3).slice(1) }, '', '', 'Gepland', true)
        ws3.addRow([null])
        const fSep = ws3.addRow(['🏆  Finale + 3e Plaats'])
        ws3.mergeCells(`A${fSep.number}:G${fSep.number}`)
        fSep.getCell(1).font = { bold: true, size: 10, color: { argb: C_ORANGE } }
        addFinaleRow('Wedstrijd om 3e pl.', 'Verliezer HF 1', 'Verliezer HF 2', '', '', 'Gepland', true)
        addFinaleRow('Finale', 'Winnaar HF 1', 'Winnaar HF 2', '', '', 'Gepland', true)

      } else {
        // Directe finale (top 2)
        const t1 = isMulti ? teamFormula(1, 1) : teamFormula(1, 1)
        const t2 = isMulti ? teamFormula(2, 1) : teamFormula(1, 2)
        ws3.addRow([null])
        addFinaleRow('Finale', { formula: t1.slice(1) }, { formula: t2.slice(1) }, '', '', 'Gepland', true)
      }
    }

    ws3.headerFooter.oddHeader = `&C&B${tournament.name} — Finales`
    ws3.headerFooter.oddFooter = '&LZaans Licht Toernooi&R&P / &N'
  }

  // ── Download ─────────────────────────────────────────────────────────────
  const buffer   = await wb.xlsx.writeBuffer()
  const blob     = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url      = URL.createObjectURL(blob)
  const safeName = tournament.name.replace(/[^a-zA-Z0-9\-_]/g, '-').replace(/-+/g, '-')
  const filename = `${safeName}_${mode === 'blank' ? 'leeg' : 'ingevuld'}.xlsx`
  const a        = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
