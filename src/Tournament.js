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
  const [byeCandidates, setByeCandidates] = useState([]);
  const [showByeModal, setShowByeModal] = useState(false);
  const [pendingRoundData, setPendingRoundData] = useState(null);
  const [tournamentStarted, setTournamentStarted] = useState(false);

  const hasBracket = selectedTournament && matches.length > 0;

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
    setTournamentStarted(false);

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

    // Delete existing teams
    const { error: deleteError } = await supabase
      .from('teams')
      .delete()
      .eq('tournament_id', selectedTournament.id);

    if (deleteError) {
      console.error('Delete teams error:', deleteError);
      alert('Failed to delete existing teams.');
      return;
    }

    // Generate new teams
    const newTeams = generateTeamsFromPlayersSync(players);

    // Insert new teams
    for (const team of newTeams) {
      const { error: insertError } = await supabase.from('teams').insert({
        name: team.name,
        tournament_id: selectedTournament.id
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

  // Generate teams from players
  const generateTeamsFromPlayers = async () => {
    setPlayerError('');

    if (players.length < 4) {
      setPlayerError('Players mode requires at least 4 players.');
      return;
    }

    if (players.length % 2 !== 0) {
      setPlayerError('Player count must be even to generate teams.');
      return;
    }

    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const newTeams = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      newTeams.push({
        name: `${shuffled[i]} & ${shuffled[i + 1]}`,
        tournament_id: selectedTournament.id
      });
    }

    await supabase.from('teams').insert(newTeams);

    const { data: updatedTeams } = await supabase
      .from('teams')
      .select('*')
      .eq('tournament_id', selectedTournament.id);

    const teamsData = updatedTeams || [];
    setTeams(teamsData);

    const teamIds = teamsData.map(t => t.id);
    if (teamIds.length < 2) return;

    if (teamIds.length % 2 !== 0) {
      setByeCandidates(teamIds);
      setPendingRoundData({
        tournamentId: selectedTournament.id,
        round: 1,
        initial: true,
        teamIds
      });
      setShowByeModal(true);
      return;
    }

    const matches = [];
    for (let i = 0; i < teamIds.length; i += 2) {
      matches.push({
        tournament_id: selectedTournament.id,
        team1_id: teamIds[i],
        team2_id: teamIds[i + 1],
        round: 1
      });
    }

    await supabase.from('matches').insert(matches);
    await fetchMatches(selectedTournament.id);
  };

  // Generate bracket
  const generateBracket = async () => {
    if (!selectedTournament) return;

    if (mode === 'players') {
      await generateTeamsFromPlayers();
      return;
    }

    // Teams mode
    const shuffled = [...teams].sort(() => Math.random() - 0.5);
    const teamIds = shuffled.map(t => t.id);

    if (teamIds.length < 2) return;

    if (teamIds.length % 2 !== 0) {
      setByeCandidates(teamIds);
      setPendingRoundData({
        tournamentId: selectedTournament.id,
        round: 1,
        initial: true,
        teamIds
      });
      setShowByeModal(true);
      return;
    }

    const matches = [];

    for (let i = 0; i < teamIds.length; i += 2) {
      matches.push({
        tournament_id: selectedTournament.id,
        team1_id: teamIds[i],
        team2_id: teamIds[i + 1],
        round: 1
      });
    }

    await supabase.from('matches').insert(matches);
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
      .order('round', { ascending: true });

    setMatches(data || []);
    if (data && data.length > 0) {
      await advanceRound(tournamentId);
    }
  };

  // Play match
  const playMatch = (m) => {
    navigate('/cornhole', {
      state: {
        matchId: m.id,
        tournamentId: selectedTournament?.id,
        team1: m.team1,
        team2: m.team2,
        team1_score: m.team1_score ?? 0,
        team2_score: m.team2_score ?? 0,
        winner_id: m.winner_id ?? null
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

    setMatches([]);
    setTournamentStarted(false);
  };

  // Start tournament
  const startTournament = () => {
    setTournamentStarted(true);
  };

  // Set winner
  const setWinner = async (match, winnerId) => {
    if (!selectedTournament) return;

    const tournamentId = selectedTournament.id || match.tournament_id;
    if (!tournamentId) return;

    // 1. Save winner
    await supabase
      .from('matches')
      .update({ winner_id: winnerId })
      .eq('id', match.id);

    // 2. Refresh matches
    await fetchMatches(tournamentId);

    // 3. Try to advance bracket
    await advanceRound(tournamentId);
  };

  // Advance round if all matches in current round are finished
  const advanceRound = async (tournamentId) => {
    const { data: matchesData } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round', { ascending: true });

    const matches = matchesData || [];
    if (matches.length === 0) return;

    if (matches.length === 1 && matches[0].winner_id) {
      console.log("🏆 Tournament finished");
      return;
    }

    const latestRound = Math.max(...matches.map(m => m.round || 1));
    const currentRoundMatches = matches.filter(m => m.round === latestRound);

    const unfinished = currentRoundMatches.filter(m => !m.winner_id);
    if (unfinished.length > 0) return;

    const winners = currentRoundMatches.map(m => m.winner_id);

    if (winners.length === 1) {
      console.log("Champion determined:", winners[0]);
      return;
    }

    if (winners.length % 2 !== 0) {
      setByeCandidates(winners);
      setPendingRoundData({ tournamentId, round: latestRound });
      setShowByeModal(true);
      return;
    }

    const nextRound = latestRound + 1;
    await createNextRound(tournamentId, nextRound, winners);
  };

  const createNextRound = async (tournamentId, nextRound, winners, byeTeamId = null) => {
    const { data: existingNext } = await supabase
      .from('matches')
      .select('id')
      .eq('tournament_id', tournamentId)
      .eq('round', nextRound);

    const existing = existingNext || [];
    if (existing.length > 0) return;

    if (winners.length < 2) return;
    let pool = [...winners];

    const matches = [];

    // remove bye team if selected
    if (byeTeamId) {
      pool = pool.filter(id => id !== byeTeamId);

      // auto-insert bye advancement match
      matches.push({
        tournament_id: tournamentId,
        team1_id: byeTeamId,
        team2_id: null,
        winner_id: byeTeamId,
        round: nextRound
      });
    }

    for (let i = 0; i < pool.length; i += 2) {
      if (pool[i + 1]) {
        matches.push({
          tournament_id: tournamentId,
          team1_id: pool[i],
          team2_id: pool[i + 1],
          round: nextRound
        });
      }
    }

    await supabase.from('matches').insert(matches);

    await fetchMatches(tournamentId);
  };

  // const getNextRound = async (tournamentId) => {
  //   const { data } = await supabase
  //     .from('matches')
  //     .select('round')
  //     .eq('tournament_id', tournamentId);

  //   if (!data || data.length === 0) return 1;

  //   return Math.max(...data.map(m => m.round || 1)) + 1;
  // };

  const handleSelectBye = async (teamId) => {
    setShowByeModal(false);

    const { tournamentId, round, initial, teamIds } = pendingRoundData || {};
    const nextRound = round + 1;
    const newMatches = [];

    if (initial) {
      const pairIds = (teamIds || byeCandidates).filter(id => id !== teamId);

      for (let i = 0; i < pairIds.length; i += 2) {
        newMatches.push({
          tournament_id: tournamentId,
          team1_id: pairIds[i],
          team2_id: pairIds[i + 1],
          round
        });
      }

      newMatches.push({
        tournament_id: tournamentId,
        team1_id: teamId,
        team2_id: null,
        winner_id: teamId,
        round
      });

      await supabase.from('matches').insert(newMatches);
      await fetchMatches(tournamentId);
      setByeCandidates([]);
      setPendingRoundData(null);
      return;
    }

    const { data: matchesData } = await supabase
      .from('matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .eq('round', round);

    const winners = matchesData
      .map(m => m.winner_id)
      .filter(id => id && id !== teamId);

    for (let i = 0; i < winners.length; i += 2) {
      if (winners[i + 1]) {
        newMatches.push({
          tournament_id: tournamentId,
          team1_id: winners[i],
          team2_id: winners[i + 1],
          round: nextRound
        });
      }
    }

    newMatches.push({
      tournament_id: tournamentId,
      team1_id: teamId,
      team2_id: null,
      winner_id: teamId,
      round: nextRound
    });

    await supabase.from('matches').insert(newMatches);
    await fetchMatches(tournamentId);

    setByeCandidates([]);
    setPendingRoundData(null);
  };

  // const getCurrentRound = async (tournamentId) => {
  //   const { data } = await supabase
  //     .from('matches')
  //     .select('round')
  //     .eq('tournament_id', tournamentId);

  //   if (!data || data.length === 0) return 1;

  //   return Math.max(...data.map(m => m.round || 1));
  // };

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
          <h3>{selectedTournament.name} - {mode === 'players' ? 'Players' : 'Teams'} Mode</h3>

          <div className="mb-3 d-flex gap-2 align-items-center">
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
            >
              Delete Tournament
            </button>
          </div>

          {mode === 'players' ? (
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
                <button className="btn btn-success" onClick={addPlayer}>
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
                <button className="btn btn-success" onClick={addTeam}>
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
            </>
          )}

          <h3 className="mt-4">Matches</h3>

          <div className="d-flex gap-2 mb-3">
            {/* Generate (only if no bracket exists) */}
            <button
              className="btn btn-warning"
              onClick={generateBracket}
              disabled={hasBracket || teams.length < 2}
            >
              Generate Bracket
            </button>

            {/* Regenerate (only if bracket exists) */}
            <button
              className="btn btn-danger"
              onClick={regenerateBracket}
              disabled={!hasBracket || tournamentStarted}
            >
              Regenerate Bracket
            </button>

            {/* Start Tournament (only if bracket exists) */}
            <button
              className="btn btn-success"
              onClick={startTournament}
              disabled={!hasBracket || tournamentStarted}
            >
              Start Tournament
            </button>

            {/* Fetch Scores */}
            <button
              className="btn btn-info"
              onClick={() => fetchMatches(selectedTournament.id)}
              disabled={!hasBracket}
            >
              Fetch Scores
            </button>

            {/* Toggle view */}
            <button
              className="btn btn-primary"
              onClick={() => setShowBracket(!showBracket)}
              disabled={!hasBracket}
            >
              {showBracket ? "Hide Bracket" : "View Bracket"}
            </button>

          </div>

          {showBracket && (
            <ul className="list-group">
              {matches.map((m) => (
                <li
                  key={m.id}
                  className="list-group-item d-flex justify-content-between align-items-center"
                style={{ cursor: 'pointer' }}
                >
                  <span>
                    <strong>Round {m.round}:</strong>{" "}
                    {m.team1?.name} <strong style={{ color: "red" }}>vs</strong>{" "}
                    {m.team2_id === null ? (
                      <span className="text-muted">BYE</span>
                    ) : (
                      m.team2?.name
                    )}
                  </span>

                  <span>
                    {m.team1_score} - {m.team2_score}
                  </span>
                  
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => playMatch(m)}
                      disabled={m.team2_id === null}
                    >
                      Play Match
                    </button>
                    <button
                      className={`btn btn-sm ${
                        m.winner_id === m.team1_id
                          ? "btn-success"
                          : "btn-outline-success"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWinner(m, m.team1_id);
                      }}
                      disabled={m.team2_id === null || Boolean(m.winner_id)}
                    >
                      {m.team1?.name} Wins
                    </button>

                    <button
                      className={`btn btn-sm ${
                        m.winner_id === m.team2_id
                          ? "btn-success"
                          : "btn-outline-success"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWinner(m, m.team2_id);
                      }}
                      disabled={m.team2_id === null || Boolean(m.winner_id)}
                    >
                      {m.team2?.name} Wins
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {showByeModal && (
        <div className="modal d-block" tabIndex="-1" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="modal-dialog">
            <div className="modal-content">

              <div className="modal-header">
                <h5 className="modal-title">Select Bye Team</h5>
              </div>

              <div className="modal-body">
                <p>Odd number of teams detected. Choose one team to advance:</p>

                <ul className="list-group">
                  {byeCandidates.map((teamId) => {
                    const team =
                      teams.find(t => t.id === teamId) ||
                      matches.flatMap(m => [m.team1, m.team2]).find(t => t?.id === teamId);

                    return (
                      <li
                        key={teamId}
                        className="list-group-item list-group-item-action"
                        style={{ cursor: "pointer" }}
                        onClick={() => handleSelectBye(teamId)}
                      >
                        {team?.name || "Unknown Team"}
                      </li>
                    );
                  })}
                </ul>
              </div>

            </div>
          </div>
        </div>
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

