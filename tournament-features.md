# Tournament Page - Feature Report

## Overview
The tournament page (`src/Tournament.js`) is a full-featured tournament management system that integrates with Supabase for persistence. It supports two modes: **Teams** (direct team entry) and **Players** (individual players auto-paired into teams).

---

## 1. Tournament CRUD

### 1.1 Fetch Tournaments
- Loads all tournaments from Supabase `tournaments` table on component mount.
- Displays them as a clickable list.

### 1.2 Create Tournament
- Text input + "Create" button.
- Sends `name` and `mode` ('teams' or 'players') to Supabase.
- Fallback to just `name` if `mode` column doesn't exist (legacy support).
- Error display via `createError` state.
- Clears input on success and refreshes tournament list.

### 1.3 Select Tournament
- Clicking a tournament in the list loads its full state:
  - Sets `selectedTournament`, `mode`, and `tournamentStarted`.
  - Fetches associated **teams**, **players**, and **matches** from Supabase.
  - Sets `showBracket = true`.

### 1.4 Delete Tournament
- "Delete Tournament" button (shown when a tournament is selected).
- Cascading delete: removes all matches → players → teams → tournament.
- Disabled while tournament is started AND no champion exists (prevents accidental deletion).
- Resets all local state on deletion.
- Refreshes tournament list.

---

## 2. Teams Mode

### 2.1 Add Team
- Text input + "Add Team" button.
- Inserts into `teams` table with `tournament_id`.
- Disabled when tournament is started.
- Refreshes team list after addition.

### 2.2 Team List
- Displays all teams for the selected tournament.
- Shows team count with proper pluralization.

---

## 3. Players Mode

### 3.1 Add Player
- Text input + "Add Player" button.
- Validates unique player names (case-insensitive comparison).
- Inserts into `players` table with `tournament_id`.
- Error display for duplicates or database failures.
- Clears error on input change.

### 3.2 Player List
- Displays all players with "Remove" button per player.
- Shows player count with proper pluralization.

### 3.3 Remove Player
- Deletes player from `players` table by `tournament_id` and `name`.
- Removes from local state.

### 3.4 Generate Teams (from Players)
- "Generate Teams" button in Players mode.
- Validations:
  - Minimum 4 players required.
  - Even player count required.
- Shuffles players randomly and pairs them (2 per team).
- Team names: `"Player1 & Player2"`.
- Deletes existing auto-generated teams (`generated_from_players = true`) before creating new ones.
- Marks new teams as `generated_from_players = true`.
- Deletes existing bracket (matches) since teams changed.
- Resets tournament `started` status to `false`.
- Refreshes all state.

---

## 4. Bracket Generation

### 4.1 Generate Bracket
- "Generate Bracket" button (shown when `teams.length >= 2` and no bracket exists).
- If players exist and no auto-generated teams yet, generates teams first automatically.
- Requires at least 2 teams.

### 4.2 Dynamic Round Structure
- Calculates rounds based on team count (no power-of-2 constraint).
- Supports odd/even team counts naturally.
- Round structure: `matches = floor(remaining/2)`, `byes = remaining % 2`.
- Creates match slots for each round with proper linking.

### 4.3 Match Linking (Bracket Wiring)
- Each match linked to its next match via `next_match_id` and `next_team_slot`.
- Winners auto-advance to correct position.
- Team 1 slot = position 0 winners, Team 2 slot = position 1 winners.

### 4.4 Bye Handling (Odd Teams)
- For odd team counts, round 1 has bye slots.
- Modal asks user to select which team gets the bye.
- Selected bye team gets auto-assigned to a bye slot.
- Remaining teams randomly assigned to actual matches.
- Cancel option cleans up all created matches.

### 4.5 Even Team Assignment
- No byes, teams shuffled and assigned to round 1 matches.
- `assignTeamsToRound1` handles both regular and bye match assignments.

### 4.6 Winner Propagation
- `propagateWinners` cascades through all rounds:
  - Auto-completes bye matches (team1 exists, no team2, no winner → team1 wins).
  - Propagates winners to next match slots.
  - Loops until no more changes (handles cascading byes).

### 4.7 Regenerate Bracket
- "Regenerate Bracket" button (shown when bracket exists but tournament not started).
- Deletes existing bracket, then generates a new one.

### 4.8 Delete Bracket
- Called as part of regenerate, also independently when teams regenerated.
- Deletes all matches for the tournament.
- Resets `started` status to `false`.

---

## 5. Tournament Lifecycle

### 5.1 Start Tournament
- "Start Tournament" button (shown when bracket exists and not started).
- Sets `started = true` in Supabase.
- Once started, teams/players cannot be modified.

### 5.2 Get Scores
- "Get Scores" button (shown when tournament is started).
- Refreshes matches data from Supabase.

---

## 6. Match Display - Round View

### 6.1 Round Grouping
- Matches grouped by round number.
- Round labels: "Final", "Semifinals", "Quarterfinals", "Round N".

### 6.2 Match Cards
- Each match shows:
  - Match number (position + 1).
  - Team 1 name (or "TBD" if unassigned).
  - "vs" separator in red.
  - Team 2 name, "TBD", or "BYE" for bye matches.
  - Score display (`team1_score - team2_score`).
  - "Play Match" button (disabled if no teams assigned or match completed).
  - Winner badge (green) with winning team name.

### 6.3 Play Match
- Navigates to root path (`/`) with match state:
  - `matchId`, `tournamentId`, both team objects, scores, `winner_id`, round info, next match linkage.
- Disabled if match already has a winner.
- Current round detection: finds lowest round with playable unfinished matches.

### 6.4 Next Match Info
- Shows where the winner advances: "→ Winner advances to Round N Match M as Team 1/2".

### 6.5 Hide Completed Matches
- Checkbox toggle to filter out completed matches (those with a winner).
- Purely visual filter.

---

## 7. Match Display - Bracket View

### 7.1 Visual Bracket Layout
- Horizontal bracket with rounds displayed as columns.
- Scrollable horizontally for overflow.

### 7.2 Bracket Match Cards
- Each match shows both teams with scores.
- Winner team highlighted with green background (`bracket-team-winner` class).
- Completed matches have reduced opacity.
- Clicking a playable match navigates to scoring.
- "BYE" shown for empty team2 slots.

### 7.3 Round Labels
- Same labeling as round view (Final, Semifinals, etc.).

---

## 8. View Toggle

### 8.1 Round View / Bracket View
- Toggle buttons to switch between round and bracket display.
- "Round View" button selected by default.
- Active view highlighted with primary styling.

---

## 9. UI Controls

### 9.1 Show/Hide Teams
- Toggle button to show/hide the teams/players section.
- Text changes between "Hide Teams/Players" and "Show Teams/Players".

### 9.2 Mode Toggle
- "Teams" and "Players" buttons to switch between modes.
- Active mode highlighted with primary styling.

### 9.3 Delete Tournament Button
- Positioned right-aligned with `ms-auto`.
- Red/danger styling.

---

## 10. Modals

### 10.1 Odd Player Count Modal
- Shown when trying to proceed with odd player count.
- Message: "Players mode requires an even number of players."
- "Close" button to dismiss.
- Uses `showOddPlayerModal` state (currently always false - not actively triggered).

### 10.2 Bye Selection Modal
- Shown when odd team count during bracket generation.
- Lists all teams as selectable options.
- Active selection highlighted.
- "Cancel" button to abort bracket generation (cleans up matches).
- "Confirm Bye" button (disabled until a team is selected).
- Confirm triggers assignment and propagation.

---

## 11. Scoring Integration
- Matches are played by navigating to the scoring page (`/`).
- State passed includes tournament context for auto-advancement.
- Winner auto-advances to next match in bracket via `next_match_id` and `next_team_slot`.
- Cascading bye auto-completion handled on scoring page.

---

## 12. State Management

### State Variables (26 total)
```javascript
tournaments, newTournament, selectedTournament, mode, teams, newTeam,
players, newPlayer, playerError, showOddPlayerModal, matches, showBracket,
showTeamList, tournamentStarted, hideCompleted, showByeModal, byeTeamOptions,
selectedByeTeamId, pendingBracketData, viewMode, createError
```

### Derived State (2)
```javascript
hasBracket = selectedTournament && matches.length > 0
hasChampion = final match has a winner
```

---

## 13. Database Schema (PostgreSQL / Supabase)

### tournaments
| Column | Type | Default |
|--------|------|---------|
| id | SERIAL PK | |
| name | TEXT NOT NULL | |
| mode | TEXT NOT NULL | 'teams' |
| started | BOOLEAN NOT NULL | false |
| created_at | TIMESTAMPTZ | now() |

### teams
| Column | Type | Default |
|--------|------|---------|
| id | SERIAL PK | |
| tournament_id | INTEGER FK → tournaments | |
| name | TEXT NOT NULL | |
| generated_from_players | BOOLEAN | false |
| created_at | TIMESTAMPTZ | now() |

### players
| Column | Type | Default |
|--------|------|---------|
| id | SERIAL PK | |
| tournament_id | INTEGER FK → tournaments | |
| name | TEXT NOT NULL | |
| created_at | TIMESTAMPTZ | now() |
| UNIQUE(tournament_id, name) | | |

### matches
| Column | Type | Default |
|--------|------|---------|
| id | SERIAL PK | |
| tournament_id | INTEGER FK → tournaments | |
| round | INTEGER | 1 |
| position | INTEGER | 0 |
| team1_id | INTEGER FK → teams (SET NULL) | |
| team2_id | INTEGER FK → teams (SET NULL) | |
| team1_score | INTEGER | 0 |
| team2_score | INTEGER | 0 |
| winner_id | INTEGER FK → teams (SET NULL) | |
| next_match_id | INTEGER FK → matches (SET NULL) | |
| next_team_slot | INTEGER (1 or 2) | |
| created_at | TIMESTAMPTZ | now() |
| updated_at | TIMESTAMPTZ | now() |

---

## 14. Supabase Integration
- Client initialized in `src/supabase.js`.
- Tables: `tournaments`, `teams`, `players`, `matches`.
- Cascade deletes handled by application code (not DB foreign keys).
- Matches fetched with joins: `team1:team1_id(id, name)`, `team2:team2_id(id, name)`.