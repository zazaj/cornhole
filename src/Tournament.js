import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from './supabase';

export default function Tournament() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState([]);
  const [newTournament, setNewTournament] = useState('');
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [error, setError] = useState('');

  const [mode, setMode] = useState('teams');
  const [showTeams, setShowTeams] = useState(false);
  const [teams, setTeams] = useState([]);
  const [newTeam, setNewTeam] = useState('');
  const [players, setPlayers] = useState([]);
  const [newPlayer, setNewPlayer] = useState('');
  const [playerError, setPlayerError] = useState('');

  const [matches, setMatches] = useState([]);

  const hasBracket = matches.length > 0;

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    setTournaments(data || []);
  };

  const createTournament = async () => {
    const name = newTournament.trim();
    if (!name) return;
    setError('');

    const { error: err } = await supabase.from('tournaments').insert({ name });
    if (err) {
      setError('Failed to create tournament.');
      return;
    }

    setNewTournament('');
    await fetchTournaments();
  };

  const selectTournament = async (t) => {
    setSelectedTournament(t);
    setMode(t.mode || 'teams');
    setShowTeams(false);

    const { data: teamsData } = await supabase.from('teams').select('*').eq('tournament_id', t.id);
    setTeams(teamsData || []);

    const { data: playersData } = await supabase.from('players').select('*').eq('tournament_id', t.id);
    setPlayers(playersData ? playersData.map(p => p.name) : []);

    await fetchMatches(t.id);

    setNewPlayer('');
    setPlayerError('');
  };

  const fetchMatches = async (tournamentId) => {
    const { data } = await supabase
      .from('matches')
      .select('*, team1:team1_id(id, name), team2:team2_id(id, name)')
      .eq('tournament_id', tournamentId)
      .order('round', { ascending: true })
      .order('position', { ascending: true });

    setMatches(data || []);
  };

  const deleteTournament = async () => {
    if (!selectedTournament?.id) return;
    setError('');

    const id = selectedTournament.id;
    await supabase.from('matches').delete().eq('tournament_id', id);
    await supabase.from('players').delete().eq('tournament_id', id);
    await supabase.from('teams').delete().eq('tournament_id', id);

    const { error: err } = await supabase.from('tournaments').delete().eq('id', id);
    if (err) {
      setError('Failed to delete tournament.');
      return;
    }

    setSelectedTournament(null);
    setTeams([]);
    setPlayers([]);
    setMatches([]);
    await fetchTournaments();
  };

  const addTeam = async () => {
    const name = newTeam.trim();
    if (!name || !selectedTournament) return;

    await supabase.from('teams').insert({ name, tournament_id: selectedTournament.id });

    setNewTeam('');
    const { data } = await supabase.from('teams').select('*').eq('tournament_id', selectedTournament.id);
    setTeams(data || []);
  };

  const addPlayer = async () => {
    const name = newPlayer.trim();
    if (!name) return;
    if (players.some(p => p.toLowerCase() === name.toLowerCase())) {
      setPlayerError('Player names must be unique.');
      return;
    }

    const { error: err } = await supabase.from('players').insert({ name, tournament_id: selectedTournament.id });
    if (err) {
      setPlayerError('Failed to add player.');
      return;
    }

    setPlayers([...players, name]);
    setNewPlayer('');
    setPlayerError('');
  };

  const removePlayer = async (index) => {
    const name = players[index];
    await supabase.from('players').delete().eq('tournament_id', selectedTournament.id).eq('name', name);
    setPlayers(players.filter((_, i) => i !== index));
  };

  const generateTeams = async () => {
    if (!selectedTournament) return false;
    setPlayerError('');

    if (players.length < 4) {
      setPlayerError('At least 4 players required.');
      return false;
    }
    if (players.length % 2 !== 0) {
      setPlayerError('Player count must be even.');
      return false;
    }

    await supabase.from('teams').delete().eq('tournament_id', selectedTournament.id).eq('generated_from_players', true);

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const newTeams = [];
    for (let i = 0; i < shuffled.length; i += 2) {
      newTeams.push({
        name: `${shuffled[i]} & ${shuffled[i + 1]}`,
        tournament_id: selectedTournament.id,
        generated_from_players: true
      });
    }

    const { error: insertErr } = await supabase.from('teams').insert(newTeams);
    if (insertErr) {
      setPlayerError('Failed to generate teams.');
      return false;
    }

    const { data } = await supabase.from('teams').select('*').eq('tournament_id', selectedTournament.id);
    setTeams(data || []);
    return true;
  };

  const generateBracket = async () => {
    if (!selectedTournament) return;

    // If players exist and no auto-generated teams, generate teams first
    if (players.length > 0) {
      const { data: existingAuto } = await supabase
        .from('teams')
        .select('*')
        .eq('tournament_id', selectedTournament.id)
        .eq('generated_from_players', true);

      if (!existingAuto || existingAuto.length === 0) {
        const success = await generateTeams();
        if (!success) return;
      }
    }

    // Fetch fresh team list
    const { data: freshTeams } = await supabase
      .from('teams')
      .select('*')
      .eq('tournament_id', selectedTournament.id);

    const teamList = freshTeams || [];
    const teamIds = teamList.map(t => t.id);

    if (teamIds.length < 2) {
      setError('At least 2 teams required to generate a bracket.');
      return;
    }

    // Delete existing bracket
    await supabase.from('matches').delete().eq('tournament_id', selectedTournament.id);

    // Calculate round structure
    const roundStructure = [];
    let remaining = teamIds.length;
    while (remaining > 1) {
      const matchesCount = Math.floor(remaining / 2);
      const byes = remaining % 2;
      roundStructure.push({ matchesCount, byes, totalSlots: matchesCount + byes });
      remaining = Math.ceil(remaining / 2);
    }

    const numRounds = roundStructure.length;

    // Create all match slots
    const allMatchData = [];
    for (let r = 0; r < numRounds; r++) {
      const round = roundStructure[r];
      for (let p = 0; p < round.totalSlots; p++) {
        allMatchData.push({
          tournament_id: selectedTournament.id,
          round: r + 1,
          position: p,
          team1_id: null,
          team2_id: null,
          winner_id: null,
          next_match_id: null,
          next_team_slot: null
        });
      }
    }

    const { data: insertedMatches, error: insertErr } = await supabase
      .from('matches')
      .insert(allMatchData)
      .select();

    if (insertErr) {
      setError('Failed to generate bracket.');
      return;
    }

    // Link matches to next matches
    for (const match of insertedMatches) {
      if (match.round < numRounds) {
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

    // Assign teams to round 1
    const round1Matches = insertedMatches.filter(m => m.round === 1);
    const round1Byes = roundStructure[0].byes;
    const shuffledIds = [...teamIds].sort(() => Math.random() - 0.5);

    let teamIdx = 0;
    for (let i = 0; i < round1Matches.length; i++) {
      const match = round1Matches[i];
      const isBye = i >= round1Matches.length - round1Byes;

      if (isBye && teamIdx < shuffledIds.length) {
        // Bye: team auto-advances
        await supabase
          .from('matches')
          .update({ team1_id: shuffledIds[teamIdx], winner_id: shuffledIds[teamIdx] })
          .eq('id', match.id);
        teamIdx++;
      } else if (teamIdx + 1 < shuffledIds.length) {
        await supabase
          .from('matches')
          .update({ team1_id: shuffledIds[teamIdx], team2_id: shuffledIds[teamIdx + 1] })
          .eq('id', match.id);
        teamIdx += 2;
      }
    }

    // Propagate bye winners through subsequent rounds
    await propagateWinners(selectedTournament.id);

    await fetchMatches(selectedTournament.id);
  };

  const propagateWinners = async (tournamentId) => {
    let madeChanges = true;
    while (madeChanges) {
      madeChanges = false;

      const { data: allMatches } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', tournamentId);

      if (!allMatches) return;

      // Auto-complete bye matches
      for (const match of allMatches) {
        if (match.team1_id && !match.team2_id && !match.winner_id) {
          await supabase.from('matches').update({ winner_id: match.team1_id }).eq('id', match.id);
          match.winner_id = match.team1_id;
          madeChanges = true;
        }
      }

      // Propagate winners to next matches
      for (const match of allMatches) {
        if (match.winner_id && match.next_match_id) {
          const slotField = match.next_team_slot === 1 ? 'team1_id' : 'team2_id';
          const nextMatch = allMatches.find(m => m.id === match.next_match_id);

          if (nextMatch && !nextMatch[slotField]) {
            await supabase
              .from('matches')
              .update({ [slotField]: match.winner_id })
              .eq('id', nextMatch.id);
            madeChanges = true;
          }
        }
      }
    }
  };

  const deleteBracket = async () => {
    if (!selectedTournament) return;

    await supabase.from('matches').delete().eq('tournament_id', selectedTournament.id);
    await supabase.from('tournaments').update({ started: false }).eq('id', selectedTournament.id);

    setMatches([]);
    setSelectedTournament({ ...selectedTournament, started: false });
  };

  const startTournament = async () => {
    if (!selectedTournament) return;

    await supabase.from('tournaments').update({ started: true }).eq('id', selectedTournament.id);

    setSelectedTournament({ ...selectedTournament, started: true });
  };

  const playMatch = (m) => {
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
        next_match_id: m.next_match_id,
        next_team_slot: m.next_team_slot
      }
    });
  };

  const getRoundLabel = (round, maxRound) => {
    if (round === maxRound) return 'Final';
    if (round === maxRound - 1) return 'Semifinals';
    if (round === maxRound - 2) return 'Quarterfinals';
    return `Round ${round}`;
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') createTournament();
  };

  const maxRound = matches.length > 0 ? Math.max(...matches.map(m => m.round || 1)) : 1;

  return (
    <div className="container py-4">
      <h2>Tournaments</h2>

      {/* Create */}
      <div className="mb-3 d-flex gap-2">
        <input
          className="form-control"
          value={newTournament}
          onChange={(e) => { setNewTournament(e.target.value); setError(''); }}
          onKeyDown={handleKeyDown}
          placeholder="New tournament name"
        />
        <button className="btn btn-primary" onClick={createTournament}>Create</button>
      </div>

      {error && <div className="alert alert-danger py-2 mb-3">{error}</div>}

      {/* List */}
      <ul className="list-group mb-4">
        {tournaments.length === 0 && (
          <li className="list-group-item text-muted">No tournaments yet.</li>
        )}
        {tournaments.map((t) => (
          <li
            key={t.id}
            className={`list-group-item list-group-item-action ${selectedTournament?.id === t.id ? 'active' : ''}`}
            onClick={() => selectTournament(t)}
            style={{ cursor: 'pointer' }}
          >
            {t.name}
            <small className={`ms-2 ${selectedTournament?.id === t.id ? 'text-white-50' : 'text-muted'}`}>
              {t.started ? '(Started)' : ''}
            </small>
          </li>
        ))}
      </ul>

      {/* Selected tournament */}
      {selectedTournament && (
        <div>
          <div className="d-flex align-items-center gap-3 mb-3">
            <h3 className="mb-0">{selectedTournament.name}</h3>
            <span className={`badge ${selectedTournament.started ? 'bg-success' : 'bg-secondary'}`}>
              {selectedTournament.started ? 'Started' : 'Not started'}
            </span>
            <button className="btn btn-danger btn-sm ms-auto" onClick={deleteTournament}>
              Delete Tournament
            </button>
          </div>

          {/* Show Teams toggle when started */}
          {selectedTournament.started && (
            <button
              className="btn btn-outline-secondary mb-3"
              onClick={() => setShowTeams(!showTeams)}
            >
              {showTeams ? 'Hide Teams' : 'Show Teams'}
            </button>
          )}

          {selectedTournament.started && showTeams && (
            <div className="mb-4">
              <ul className="list-group">
                {teams.map((team) => (
                  <li key={team.id} className="list-group-item d-flex justify-content-between align-items-center">
                    {team.name}
                    {team.generated_from_players && <span className="badge bg-info">Auto</span>}
                  </li>
                ))}
              </ul>
              <div className="text-muted small mt-2">
                {teams.length} team{teams.length !== 1 ? 's' : ''} added
              </div>
            </div>
          )}

          {/* Players/Teams section before start */}
          {!selectedTournament.started && (
            <div>
              <div className="btn-group mb-3">
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
              </div>

              {mode === 'players' && (
                <div>
                  <div className="mb-3 d-flex gap-2">
                    <input
                      className="form-control"
                      value={newPlayer}
                      onChange={(e) => { setNewPlayer(e.target.value); setPlayerError(''); }}
                      placeholder="Player name"
                    />
                    <button className="btn btn-success" onClick={addPlayer}>Add Player</button>
                  </div>

                  {playerError && <div className="alert alert-danger py-2 mb-3">{playerError}</div>}

                  <ul className="list-group mb-3">
                    {players.map((player, index) => (
                      <li key={`${player}-${index}`} className="list-group-item d-flex justify-content-between align-items-center">
                        {player}
                        <button className="btn btn-sm btn-outline-danger" onClick={() => removePlayer(index)}>Remove</button>
                      </li>
                    ))}
                  </ul>

                  <div className="text-muted small mb-3">
                    {players.length} player{players.length !== 1 ? 's' : ''} added
                  </div>

                  <button className="btn btn-info" onClick={generateTeams}>
                    Generate Teams
                  </button>
                </div>
              )}

              {mode === 'teams' && (
                <div>
                  <div className="mb-3 d-flex gap-2">
                    <input
                      className="form-control"
                      value={newTeam}
                      onChange={(e) => setNewTeam(e.target.value)}
                      placeholder="Team name"
                    />
                    <button className="btn btn-success" onClick={addTeam}>Add Team</button>
                  </div>

                  <ul className="list-group mb-3">
                    {teams.map((team) => (
                      <li key={team.id} className="list-group-item d-flex justify-content-between align-items-center">
                        {team.name}
                        {team.generated_from_players && <span className="badge bg-info">Auto</span>}
                      </li>
                    ))}
                  </ul>

                  <div className="text-muted small mb-3">
                    {teams.length} team{teams.length !== 1 ? 's' : ''} added
                  </div>
                </div>
              )}

              {/* Bracket section */}
              {teams.length >= 2 && (
                <div className="mt-4">
                  <h4>Bracket</h4>
                  <div className="d-flex gap-2 mb-3">
                    <button className="btn btn-warning" onClick={generateBracket}>
                      {hasBracket ? 'Re-generate Bracket' : 'Generate Bracket'}
                    </button>
                    {hasBracket && (
                      <>
                        <button className="btn btn-success" onClick={startTournament}>
                          Start Tournament
                        </button>
                        <button className="btn btn-danger" onClick={deleteBracket}>
                          Delete Bracket
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Match display (shown before and after start) */}
          {hasBracket && (
            <div className="mt-3">
              <h4>Matches</h4>
              {(() => {
                const rounds = [];
                for (let r = 1; r <= maxRound; r++) {
                  const roundMatches = matches
                    .filter(m => m.round === r)
                    .sort((a, b) => a.position - b.position);
                  rounds.push({ round: r, matches: roundMatches });
                }

                return rounds.map(({ round, matches: roundMatches }) => (
                  <div key={round} className="mb-3">
                    <h5 className="text-muted">{getRoundLabel(round, maxRound)}</h5>
                    <ul className="list-group">
                      {roundMatches.map((m) => (
                        <li key={m.id} className="list-group-item d-flex justify-content-between align-items-center">
                          <div>
                            <strong>Match {m.position + 1}:</strong>{' '}
                            {m.team1?.name || <span className="text-muted fst-italic">TBD</span>}
                            {' '}<strong style={{ color: 'red' }}>vs</strong>{' '}
                            {m.team2_id === null
                              ? <span className="text-muted">BYE</span>
                              : m.team2?.name || <span className="text-muted fst-italic">TBD</span>
                            }
                            <span className="ms-2 text-muted">
                              ({m.team1_score} - {m.team2_score})
                            </span>
                          </div>
                          <div className="d-flex gap-2 align-items-center">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => playMatch(m)}
                              disabled={!m.team1_id || !m.team2_id || !!m.winner_id}
                            >
                              Play
                            </button>
                            {m.winner_id && (
                              <span className="badge bg-success">
                                {m.winner_id === m.team1?.id ? m.team1.name : m.team2?.name} Wins!
                              </span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}