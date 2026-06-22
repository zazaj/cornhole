import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';

export default function Tournament() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [newTournament, setNewTournament] = useState('');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [mode, setMode] = useState('teams'); // 'teams' or 'players'
  const [teams, setTeams] = useState([]);
  const [newTeam, setNewTeam] = useState('');
  const [players, setPlayers] = useState([]);
  const [newPlayer, setNewPlayer] = useState('');
  const [playerError, setPlayerError] = useState('');
  const [showOddPlayerModal, setShowOddPlayerModal] = useState(false);
  const [matches, setMatches] = useState([]);
  const [showBracket, setShowBracket] = useState(false);
  const [showTeamList, setShowTeamList] = useState(true);
  const [tournamentStarted, setTournamentStarted] = useState(false);
  const [hideCompleted, setHideCompleted] = useState(false);

  const hasBracket = selectedTournament && matches.length > 0;

  // Check if tournament has a champion (final match has a winner)
  const hasChampion = matches.length > 0 && (() => {
    const maxRound = Math.max(...matches.map(m => m.round || 1));
    const finalMatches = matches.filter(m => m.round === maxRound);
    return finalMatches.length === 1 && finalMatches[0].winner_id;
  })();

  // Fetch tournaments
  const fetchTournaments = async () => {
    const { data } = await supabase.from('tournaments').select('*');
    setTournaments(data || []);
  };

  const [createError, setCreateError] = useState('');

  // Create tournament
  const createTournament = async () => {
    if (!newTournament) return;
    setCreateError('');

    const insertData = { name: newTournament, mode };
    const { error } = await supabase.from('tournaments').insert(insertData);

    if (error) {
      console.error('Create tournament error:', error);
      if (error.message?.includes('column') && error.message?.includes('mode')) {
        const { error: fallbackError } = await supabase.from('tournaments').insert({ name: newTournament });
        if (fallbackError) {
          setCreateError('Unable to create tournament. Please try again.');
          return;
        }
      } else {
        setCreateError('Unable to create tournament. Please try again.');
        return;
      }
    }

    setNewTournament('');
    await fetchTournaments();
  };

  // Select tournament + fetch teams
  const selectTournament = async (t) => {
    setSelectedTournament(t);
    setMode(t.mode || 'teams');
    setTournamentStarted(t.started || false);
    const { data: teamsData } = await supabase
      .from('teams')
      .select('*')
      .eq('tournament_id', t.id);

    setTeams(teamsData || []);

    const { data: playersData } = await supabase
      .from('players')
      .select('*')
      .eq('tournament_id', t.id);

    setPlayers(playersData ? playersData.map(p => p.name) : []);

    await fetchMatches(t.id);

    setShowBracket(true);

    // Clear new player input
    setNewPlayer('');
    setPlayerError('');
  };

  // Delete tournament and all related data
  const deleteTournament = async () => {
    if (!selectedTournament?.id) return;

    const tournamentId = selectedTournament.id;

    await supabase.from('matches').delete().eq('tournament_id', tournamentId);
    await supabase.from('players').delete().eq('tournament_id', tournamentId);
    await supabase.from('teams').delete().eq('tournament_id', tournamentId);

    const { error } = await supabase.from('tournaments').delete().eq('id', tournamentId);
    if (error) {
      console.error('Delete tournament error:', error);
      return;
    }

    setSelectedTournament(null);
    setTeams([]);
    setPlayers([]);
    setMatches([]);
    setShowBracket(false);
    setNewPlayer('');
    setNewTeam('');
    setPlayerError('');

    await fetchTournaments();
  };

  // Add team
  const addTeam = async () => {
    if (!newTeam || !selectedTournament) return;

    await supabase.from('teams').insert({
      name: newTeam,
      tournament_id: selectedTournament.id
    });

    setNewTeam('');
    selectTournament(selectedTournament);
  };

  // Add player
  const addPlayer = async () => {
    const trimmed = newPlayer.trim();
    if (!trimmed) return;
    if (players.some(p => p.toLowerCase() === trimmed.toLowerCase())) {
      setPlayerError('Player names must be unique.');
      return;
    }

    const { error } = await supabase.from('players').insert({
      name: trimmed,
      tournament_id: selectedTournament.id
    });

    if (error) {
      console.error('Add player error:', error);
      setPlayerError('Failed to add player.');
      return;
    }

    setPlayers([...players, trimmed]);
    setNewPlayer('');
    setPlayerError('');
  };

  // Remove player
  const removePlayer = async (index) => {
    const playerName = players[index];
    const { error } = await supabase
      .from('players')
      .delete()
      .eq('tournament_id', selectedTournament.id)
      .eq('name', playerName);

    if (error) {
      console.error('Remove player error:', error);
      return;
    }

    setPlayers(players.filter((_, i) => i !== index));
  };

  // Generate teams from players (sync version for creation)
  const generateTeamsFromPlayersSync = (playerList) => {
    const shuffled = [...playerList].sort(() => Math.random() - 0.5);
    const newTeams = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      newTeams.push({
        name: `${shuffled[i]} & ${shuffled[i + 1]}`
      });
    }

    return newTeams;
  };

  // Generate teams for selected tournament
  const generateTeams = async () => {
    if (!selectedTournament) return;

    setPlayerError('');

    if (players.length < 4) {
      setPlayerError('Players mode requires at least 4 players.');
      return;
    }

    if (players.length % 2 !== 0) {
      setPlayerError('Player count must be even to generate teams.');
      return;
    }

    // Delete existing bracket since teams have changed, invalidating any current bracket
    await supabase
      .from('matches')
      .delete()
      .eq('tournament_id', selectedTournament.id);

    await supabase
      .from('tournaments')
      .update({ started: false })
      .eq('id', selectedTournament.id);

    // Reset local state immediately so Start Tournament is disabled
    setMatches([]);
    setTournamentStarted(false);
    setSelectedTournament({ ...selectedTournament, started: false });

    // Delete only auto-generated teams from players
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('tournament_id', selectedTournament.id)
      .eq('generated_from_players', true);

    if (deleteError) {
      console.error('Delete teams error:', deleteError);
      alert('Failed to delete existing teams.');
      return;
    }

    // Generate new teams
    const newTeams = generateTeamsFromPlayersSync(players);

    // Insert new teams marked as auto-generated
    for (const team of newTeams) {
      const { error: insertError } = await supabase.from('teams').insert({
        name: team.name,
        tournament_id: selectedTournament.id,
        generated_from_players: true
      });

      if (insertError) {
        console.error('Insert team error:', insertError);
        alert('Failed to generate teams.');
        return;
      }
    }

    // Refresh teams
    await selectTournament(selectedTournament);
  };


  // Helper: Generate teams from players only (no bracket generation)
  const generateTeamsFromPlayersOnly = async () => {
    if (!players || players.length === 0) return true; // No players, proceed

    if (players.length < 4) {
      setPlayerError('Players mode requires at least 4 players.');
      return false;
    }

    if (players.length % 2 !== 0) {
      setPlayerError('Player count must be even to generate teams.');
      return false;
    }

    // Delete only auto-generated teams from previous runs
    // Use .is() to explicitly check for true value, not null or false
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('tournament_id', selectedTournament.id)
      .is('generated_from_players', true);

    if (deleteError) {
      console.error('Delete auto-generated teams error:', deleteError);
      alert('Failed to delete auto-generated teams.');
      return false;
    }

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const newTeams = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      newTeams.push({
        name: `${shuffled[i]} & ${shuffled[i + 1]}`,
        tournament_id: selectedTournament.id,
        generated_from_players: true
      });
    }

    const { error: insertError } = await supabase.from('teams').insert(newTeams);

    if (insertError) {
      console.error('Insert teams error:', insertError);
      alert('Failed to generate teams.');
      return false;
    }

    // Fetch updated teams
    const { data: updatedTeams } = await supabase
      .from('teams')
      .select('*')
      .eq('tournament_id', selectedTournament.id);

    const teamsData = updatedTeams || [];
    setTeams(teamsData);

    return true;
  };

  // Propagate winners to next match slots
  const propagateWinners = async (tournamentId) => {
    const { data: allMatches } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId);

    if (!allMatches) return;

    for (const match of allMatches) {
      if (match.winner_id && match.next_match_id) {
        const nextMatch = allMatches.find(m => m.id === match.next_match_id);
        if (!nextMatch) continue;

        const slotField = match.next_team_slot === 1 ? 'team1_id' : 'team2_id';

        // Only update if the slot is empty
        if (!nextMatch[slotField]) {
          await supabase
            .from('matches')
            .update({ [slotField]: match.winner_id })
            .eq('id', nextMatch.id);
        }
      }
    }
  };

  // Generate full bracket upfront
  const generateBracket = async () => {
    if (!selectedTournament) return;

    // Check if players exist and if teams have already been generated from them
    if (players.length > 0) {
      // Check if auto-generated teams already exist
      const { data: existingAutoTeams } = await supabase
        .from('teams')
        .select('*')
        .eq('tournament_id', selectedTournament.id)
        .eq('generated_from_players', true);

      const hasAutoGeneratedTeams = existingAutoTeams && existingAutoTeams.length > 0;

      // Only generate teams if they haven't been generated yet
      if (!hasAutoGeneratedTeams) {
        const success = await generateTeamsFromPlayersOnly();
        if (!success) return;
      }
    }

    // Fetch fresh teams list
    const { data: freshTeams } = await supabase
      .from('teams')
      .select('*')
      .eq('tournament_id', selectedTournament.id);

    const teamList = freshTeams || [];
    const teamIds = teamList.map(t => t.id);

    if (teamIds.length < 2) {
      alert('At least 2 teams are required to generate a bracket.');
      return;
    }

    // Calculate bracket structure
    const numTeams = teamIds.length;
    const rounds = Math.ceil(Math.log2(numTeams));
    const totalSlots = Math.pow(2, rounds);
    const numByes = totalSlots - numTeams;

    // Shuffle teams randomly
    const shuffled = [...teamIds].sort(() => Math.random() - 0.5);

    // Create all match slots for all rounds
    const allMatches = [];
    for (let r = 1; r <= rounds; r++) {
      const matchesInRound = totalSlots / Math.pow(2, r);
      for (let p = 0; p < matchesInRound; p++) {
        allMatches.push({
          tournament_id: selectedTournament.id,
          round: r,
          position: p,
          team1_id: null,
          team2_id: null,
          winner_id: null,
          next_match_id: null,
          next_team_slot: null
        });
      }
    }

    // Insert all matches
    const { data: insertedMatches, error: insertError } = await supabase
      .from('matches')
      .insert(allMatches)
      .select();

    if (insertError) {
      console.error('Insert matches error:', JSON.stringify(insertError, null, 2));
      alert('Failed to generate bracket: ' + (insertError.message || JSON.stringify(insertError)));
      return;
    }

    // Link each match to its next match
    for (const match of insertedMatches) {
      if (match.round < rounds) {
        const nextPosition = Math.floor(match.position / 2);
        const nextTeamSlot = (match.position % 2) + 1;
        const nextMatch = insertedMatches.find(
          m => m.round === match.round + 1 && m.position === nextPosition
        );

        if (nextMatch) {
          await supabase
            .from('matches')
            .update({ next_match_id: nextMatch.id, next_team_slot: nextTeamSlot })
            .eq('id', match.id);
        }
      }
    }

    // Assign teams to round 1 matches
    const round1Matches = insertedMatches
      .filter(m => m.round === 1)
      .sort((a, b) => a.position - b.position);

    let teamIndex = 0;
    for (let i = 0; i < round1Matches.length; i++) {
      const match = round1Matches[i];
      const isBye = i >= round1Matches.length - numByes;

      if (isBye && teamIndex < numTeams) {
        // Bye match - team auto-advances
        await supabase
          .from('matches')
          .update({
            team1_id: shuffled[teamIndex],
            winner_id: shuffled[teamIndex]
          })
          .eq('id', match.id);
        teamIndex++;
      } else if (teamIndex + 1 < numTeams) {
        // Regular match with two teams
        await supabase
          .from('matches')
          .update({
            team1_id: shuffled[teamIndex],
            team2_id: shuffled[teamIndex + 1]
          })
          .eq('id', match.id);
        teamIndex += 2;
      }
    }

    // Propagate bye winners to next match slots
    await propagateWinners(selectedTournament.id);

    await fetchMatches(selectedTournament.id);
  };

  // Regenerate bracket
  const regenerateBracket = async () => {
    await deleteBracket();
    await generateBracket();
  };

  // Fetch matches
  const fetchMatches = async (tournamentId) => {
    const { data } = await supabase
      .from('matches')
      .select(`
        *,
        team1:team1_id(id, name),
        team2:team2_id(id, name)
      `)
      .eq('tournament_id', tournamentId)
      .order('round', { ascending: true })
      .order('position', { ascending: true });

    setMatches(data || []);
  };

  // Play match
  const playMatch = (m) => {
    // Find the current active round: lowest round that still has playable unfinished matches
    const unfinishedRounds = matches
      .filter(m => !m.winner_id && m.team1_id && m.team2_id)
      .map(m => m.round);
    const currentRound = unfinishedRounds.length > 0
      ? Math.min(...unfinishedRounds)
      : Math.max(...matches.map(m => m.round || 1));
    navigate('/', {
      state: {
        matchId: m.id,
        tournamentId: selectedTournament?.id,
        team1: m.team1,
        team2: m.team2,
        team1_score: m.team1_score ?? 0,
        team2_score: m.team2_score ?? 0,
        winner_id: m.winner_id ?? null,
        round: m.round,
        latestRound: currentRound,
        next_match_id: m.next_match_id,
        next_team_slot: m.next_team_slot
      }
    });
  };

  // Delete bracket
  const deleteBracket = async () => {
    if (!selectedTournament) return;

    await supabase
      .from('matches')
      .delete()
      .eq('tournament_id', selectedTournament.id);

    // Reset started status in database
    await supabase
      .from('tournaments')
      .update({ started: false })
      .eq('id', selectedTournament.id);

    setMatches([]);
    setTournamentStarted(false);
    setSelectedTournament({ ...selectedTournament, started: false });
  };

  // Start tournament
  const startTournament = async () => {
    if (!selectedTournament) return;

    const { error } = await supabase
      .from('tournaments')
      .update({ started: true })
      .eq('id', selectedTournament.id);

    if (!error) {
      setTournamentStarted(true);
      setSelectedTournament({ ...selectedTournament, started: true });
    }
  };

  // Get the next match info for display
  const getNextMatchInfo = (match) => {
    if (!match.next_match_id) return null;
    const nextMatch = matches.find(m => m.id === match.next_match_id);
    if (!nextMatch) return null;
    return {
      match: nextMatch,
      slot: match.next_team_slot === 1 ? 'Team 1' : 'Team 2'
    };
  };

  useEffect(() => {
    fetchTournaments();
  }, []);

  useEffect(() => {
    if (selectedTournament?.id) {
      fetchMatches(selectedTournament.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTournament]);

  return (
    <div className="container py-4">
      <h2>Tournaments</h2>

      {/* Create Tournament */}
      <div className="mb-3 d-flex gap-2">
        <input
          className="form-control"
          value={newTournament}
          onChange={(e) => setNewTournament(e.target.value)}
          placeholder="New tournament name"
        />
        <button className="btn btn-primary" onClick={createTournament}>
          Create
        </button>
      </div>
      {createError && (
        <div className="alert alert-danger py-2 mb-3">{createError}</div>
      )}

      {/* Tournament List */}
      <ul className="list-group mb-4">
        {tournaments.map((t) => (
          <li
            key={t.id}
            className="list-group-item list-group-item-action"
            onClick={() => selectTournament(t)}
            style={{ cursor: 'pointer' }}
          >
            {t.name}
          </li>
        ))}
      </ul>

      {/* Teams / Players Section */}
      {selectedTournament && (
        <>
          <h3>{selectedTournament.name}</h3>

          <div className="mb-3 d-flex gap-2 align-items-center">
            <button
              className={`btn ${showTeamList ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => setShowTeamList(!showTeamList)}
            >
              {showTeamList ? "Hide Teams/Players" : "Show Teams/Players"}
            </button>
            <button
              className={`btn ${mode === 'teams' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setMode('teams')}
            >
              Teams
            </button>
            <button
              className={`btn ${mode === 'players' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setMode('players')}
            >
              Players
            </button>
            <button
              className="btn btn-danger ms-auto"
              onClick={deleteTournament}
              disabled={tournamentStarted && !hasChampion}
            >
              Delete Tournament
            </button>
          </div>

          {showTeamList && (mode === 'players' ? (
            <>
              <div className="mb-3 d-flex gap-2">
                <input
                  className="form-control"
                  value={newPlayer}
                  onChange={(e) => {
                    setNewPlayer(e.target.value);
                    setPlayerError('');
                  }}
                  placeholder="Player name"
                />
                <button className="btn btn-success" onClick={addPlayer} disabled={tournamentStarted}>
                  Add Player
                </button>
              </div>

              {playerError && (
                <div className="alert alert-danger py-2 mb-3">{playerError}</div>
              )}

              <ul className="list-group mb-3">
                {players.map((player, index) => (
                  <li key={`${player}-${index}`} className="list-group-item d-flex justify-content-between align-items-center">
                    {player}
                    <button className="btn btn-sm btn-outline-danger" onClick={() => removePlayer(index)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>

              <div className="text-muted small mb-3">
                {players.length} player{players.length !== 1 ? 's' : ''} added
              </div>

              <div className="mb-3">
                <button className="btn btn-info" onClick={generateTeams}>
                  Generate Teams
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mb-3 d-flex gap-2">
                <input
                  className="form-control"
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  placeholder="Team name"
                />
                <button className="btn btn-success" onClick={addTeam} disabled={tournamentStarted}>
                  Add Team
                </button>
              </div>

              <ul className="list-group mb-3">
                {teams.map((team) => (
                  <li key={team.id} className="list-group-item">
                    {team.name}
                  </li>
                ))}
              </ul>

              <div className="text-muted small mb-3">
                {teams.length} team{teams.length !== 1 ? 's' : ''} added
              </div>
            </>
          ))}

          <h3 className="mt-4">Matches</h3>

          {/* Button logic based on tournament state */}
          {teams.length >= 2 && (
            <div className="d-flex gap-2 mb-3">
              {/* Phase 1: Only Generate Bracket when no bracket exists */}
              {!hasBracket && (
                <button
                  className="btn btn-warning"
                  onClick={generateBracket}
                  disabled={teams.length < 2}
                >
                  Generate Bracket
                </button>
              )}

              {/* Phase 2: Regenerate and Start Tournament when bracket exists but not started */}
              {hasBracket && !tournamentStarted && (
                <>
                  <button
                    className="btn btn-danger"
                    onClick={regenerateBracket}
                  >
                    Regenerate Bracket
                  </button>

                  <button
                    className="btn btn-success"
                    onClick={startTournament}
                  >
                    Start Tournament
                  </button>
                </>
              )}

              {/* Phase 3: Fetch Scores when tournament started */}
              {tournamentStarted && (
                <button
                  className="btn btn-info"
                  onClick={() => fetchMatches(selectedTournament.id)}
                >
                  Get Scores
                </button>
              )}
            </div>
          )}

          {showBracket && (
            <>
              <div className="form-check mb-2">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="hideCompleted"
                  checked={hideCompleted}
                  onChange={(e) => setHideCompleted(e.target.checked)}
                />
                <label className="form-check-label" htmlFor="hideCompleted">
                  Hide completed matches
                </label>
              </div>

              {/* Group matches by round for bracket display */}
              {(() => {
                const maxRound = matches.length > 0 ? Math.max(...matches.map(m => m.round || 1)) : 1;
                const rounds = [];
                for (let r = 1; r <= maxRound; r++) {
                  const roundMatches = matches
                    .filter(m => m.round === r)
                    .sort((a, b) => a.position - b.position);
                  rounds.push({ round: r, matches: roundMatches });
                }

                return rounds.map(({ round, matches: roundMatches }) => {
                  const filteredMatches = hideCompleted
                    ? roundMatches.filter(m => !m.winner_id)
                    : roundMatches;

                  if (filteredMatches.length === 0) return null;

                  const roundLabel = round === maxRound ? 'Final' :
                    round === maxRound - 1 ? 'Semifinals' :
                    round === maxRound - 2 ? 'Quarterfinals' :
                    `Round ${round}`;

                  return (
                    <div key={round} className="mb-4">
                      <h5 className="text-muted mb-2">{roundLabel}</h5>
                      <ul className="list-group">
                        {filteredMatches.map((m) => {
                          const nextInfo = getNextMatchInfo(m);
                          return (
                            <li
                              key={m.id}
                              className="list-group-item d-flex justify-content-between align-items-center"
                              style={{ cursor: 'pointer' }}
                            >
                              <div className="d-flex flex-column">
                                <span>
                                  <strong>Match {m.position + 1}:</strong>{" "}
                                  {m.team1?.name || (
                                    <span className="text-muted fst-italic">TBD</span>
                                  )}{" "}
                                  <strong style={{ color: "red" }}>vs</strong>{" "}
                                  {m.team2_id === null ? (
                                    <span className="text-muted">BYE</span>
                                  ) : m.team2?.name || (
                                    <span className="text-muted fst-italic">TBD</span>
                                  )}
                                </span>
                                {nextInfo && (
                                  <small className="text-muted mt-1">
                                    → Winner advances to {nextInfo.match.round === maxRound ? 'Final' : `Round ${nextInfo.match.round}`} Match {nextInfo.match.position + 1} as {nextInfo.slot}
                                  </small>
                                )}
                              </div>

                              <div className="d-flex gap-2 align-items-center">
                                <span className="me-2">
                                  {m.team1_score} - {m.team2_score}
                                </span>
                                <button
                                  className="btn btn-primary btn-sm"
                                  onClick={() => playMatch(m)}
                                  disabled={!m.team1_id || !m.team2_id || m.winner_id}
                                >
                                  Play Match
                                </button>
                                {m.winner_id && (
                                  <span className="badge bg-success fs-6">
                                    {m.winner_id === m.team1?.id ? m.team1.name : m.team2?.name} Wins!
                                  </span>
                                )}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                });
              })()}
            </>
          )}
        </>
      )}

      {showOddPlayerModal && (
        <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Odd Player Count</h5>
              </div>
              <div className="modal-body">
                <p>Players mode requires an even number of players so teams can be formed with two players each.</p>
                <p>Please add one more player or remove one player.</p>
              </div>
              <div className="modal-footer">
                <button className="btn btn-secondary" onClick={() => setShowOddPlayerModal(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}