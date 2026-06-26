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
  const [viewMode, setViewMode] = useState('round');

  const [doubleElimination, setDoubleElimination] = useState(false);
  const [grandFinale, setGrandFinale] = useState(false);

  const hasBracket = matches.length > 0;
  const isDE = selectedTournament?.double_elimination || doubleElimination;

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
    setDoubleElimination(t.double_elimination || false);
    setGrandFinale(t.has_grand_finale || false);

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
      .order('bracket', { ascending: true })
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

  const generateSingleEliminationBracket = async (teamIds) => {
    const roundStructure = [];
    let remaining = teamIds.length;
    while (remaining > 1) {
      const matchesCount = Math.floor(remaining / 2);
      const byes = remaining % 2;
      roundStructure.push({ matchesCount, byes, totalSlots: matchesCount + byes });
      remaining = Math.ceil(remaining / 2);
    }

    const numRounds = roundStructure.length;

    const allMatchData = [];
    for (let r = 0; r < numRounds; r++) {
      const round = roundStructure[r];
      for (let p = 0; p < round.totalSlots; p++) {
        const isBye = p >= round.matchesCount;
        allMatchData.push({
          tournament_id: selectedTournament.id,
          round: r + 1,
          position: p,
          team1_id: null,
          team2_id: null,
          winner_id: null,
          next_match_id: null,
          next_team_slot: null,
          is_bye: isBye,
          bracket: 'winners'
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

    for (const match of insertedMatches) {
      if (match.round < numRounds) {
        const currentRoundData = roundStructure[match.round - 1];
        const nextRoundData = roundStructure[match.round];

        let nextPosition;
        let nextTeamSlot;
        if (nextRoundData.byes > 0) {
          const offset = (match.position + nextRoundData.byes) % currentRoundData.totalSlots;
          nextPosition = Math.floor(offset / 2);
          nextTeamSlot = (offset % 2) + 1;
        } else {
          nextPosition = Math.floor(match.position / 2);
          nextTeamSlot = (match.position % 2) + 1;
        }

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
    const shuffledIds = [...teamIds].sort(() => Math.random() - 0.5);
    let teamIdx = 0;
    for (let i = 0; i < round1Matches.length; i++) {
      const match = round1Matches[i];
      await supabase
        .from('matches')
        .update({ team1_id: shuffledIds[teamIdx], team2_id: shuffledIds[teamIdx + 1] })
        .eq('id', match.id);
      teamIdx += 2;
    }

    await propagateWinners(selectedTournament.id);
    await fetchMatches(selectedTournament.id);
  };

  const generateDoubleEliminationBracket = async (teamIds) => {
    const n = teamIds.length;
    const numWBRounds = Math.ceil(Math.log2(n));
    const powerOf2 = Math.pow(2, numWBRounds);

    const wbRoundStructure = [];
    let wbRemaining = powerOf2;
    while (wbRemaining > 1) {
      const matchesCount = Math.floor(wbRemaining / 2);
      const byes = wbRemaining % 2;
      wbRoundStructure.push({ matchesCount, byes, totalSlots: matchesCount + byes });
      wbRemaining = Math.ceil(wbRemaining / 2);
    }

    const numWBRoundsCalc = wbRoundStructure.length;
    const numLBRounds = numWBRoundsCalc - 1;

    const lbMatchesPerRound = [];
    let lbTeamsAtStart = powerOf2 / 2;
    for (let r = 0; r < numLBRounds; r++) {
      const matchesInRound = Math.ceil(lbTeamsAtStart / 2);
      lbMatchesPerRound.push(matchesInRound);
      lbTeamsAtStart = Math.ceil(lbTeamsAtStart / 2);
    }

    const allMatchData = [];

    // WB matches
    for (let r = 0; r < numWBRoundsCalc; r++) {
      const round = wbRoundStructure[r];
      for (let p = 0; p < round.totalSlots; p++) {
        const isBye = p >= round.matchesCount;
        allMatchData.push({
          tournament_id: selectedTournament.id,
          round: r + 1,
          position: p,
          team1_id: null,
          team2_id: null,
          winner_id: null,
          next_match_id: null,
          next_team_slot: null,
          loser_match_id: null,
          is_bye: isBye,
          bracket: 'winners'
        });
      }
    }

    // LB matches
    for (let r = 0; r < numLBRounds; r++) {
      for (let p = 0; p < lbMatchesPerRound[r]; p++) {
        allMatchData.push({
          tournament_id: selectedTournament.id,
          round: r + 1,
          position: p,
          team1_id: null,
          team2_id: null,
          winner_id: null,
          next_match_id: null,
          next_team_slot: null,
          loser_match_id: null,
          is_bye: false,
          bracket: 'losers'
        });
      }
    }

    // Grand Final match(es)
    allMatchData.push({
      tournament_id: selectedTournament.id,
      round: 1,
      position: 0,
      team1_id: null,
      team2_id: null,
      winner_id: null,
      next_match_id: null,
      next_team_slot: null,
      loser_match_id: null,
      is_bye: false,
      bracket: 'grand_final'
    });

    if (selectedTournament.has_grand_finale) {
      allMatchData.push({
        tournament_id: selectedTournament.id,
        round: 2,
        position: 0,
        team1_id: null,
        team2_id: null,
        winner_id: null,
        next_match_id: null,
        next_team_slot: null,
        loser_match_id: null,
        is_bye: false,
        bracket: 'grand_final'
      });
    }

    const { data: insertedMatches, error: insertErr } = await supabase
      .from('matches')
      .insert(allMatchData)
      .select();

    if (insertErr) {
      setError('Failed to generate bracket.');
      return;
    }

    // Link WB matches
    const wbMatches = insertedMatches.filter(m => m.bracket === 'winners');
    for (const match of wbMatches) {
      if (match.round < numWBRoundsCalc) {
        const nextRoundData = wbRoundStructure[match.round];
        const currentRoundData = wbRoundStructure[match.round - 1];

        let nextPosition;
        let nextTeamSlot;
        if (nextRoundData.byes > 0) {
          const offset = (match.position + nextRoundData.byes) % currentRoundData.totalSlots;
          nextPosition = Math.floor(offset / 2);
          nextTeamSlot = (offset % 2) + 1;
        } else {
          nextPosition = Math.floor(match.position / 2);
          nextTeamSlot = (match.position % 2) + 1;
        }

        const nextMatch = wbMatches.find(
          m => m.round === match.round + 1 && m.position === nextPosition
        );

        if (nextMatch) {
          await supabase
            .from('matches')
            .update({ next_match_id: nextMatch.id, next_team_slot: nextTeamSlot })
            .eq('id', match.id);
        }
      }

      if (match.round === 1) {
        const lbR1Matches = insertedMatches.filter(m => m.bracket === 'losers' && m.round === 1);
        const lbSlot = Math.floor(match.position / 2);
        if (lbR1Matches[lbSlot]) {
          await supabase
            .from('matches')
            .update({ loser_match_id: lbR1Matches[lbSlot].id })
            .eq('id', match.id);
        }
      } else if (match.round < numWBRoundsCalc) {
        const lbRound = match.round - 1;
        const lbMatches = insertedMatches.filter(m => m.bracket === 'losers' && m.round === lbRound);
        const lbPos = Math.floor(match.position / 2);
        if (lbMatches[lbPos]) {
          await supabase
            .from('matches')
            .update({ loser_match_id: lbMatches[lbPos].id })
            .eq('id', match.id);
        }
      }
    }

    // Link LB matches
    const lbMatches = insertedMatches.filter(m => m.bracket === 'losers');
    for (const match of lbMatches) {
      if (match.round < numLBRounds) {
        const nextLbMatches = insertedMatches.filter(
          m => m.bracket === 'losers' && m.round === match.round + 1
        );
        const nextPos = Math.floor(match.position / 2);
        if (nextLbMatches[nextPos]) {
          const slot = (match.position % 2) + 1;
          await supabase
            .from('matches')
            .update({ next_match_id: nextLbMatches[nextPos].id, next_team_slot: slot })
            .eq('id', match.id);
        }
      }
    }

    // Link WB final and LB final to grand final
    const lastLbMatches = insertedMatches.filter(
      m => m.bracket === 'losers' && m.round === numLBRounds
    );
    const wbFinalMatch = wbMatches.find(m => m.round === numWBRoundsCalc);
    const gfMatches = insertedMatches.filter(m => m.bracket === 'grand_final');
    if (gfMatches.length > 0) {
      if (wbFinalMatch) {
        await supabase
          .from('matches')
          .update({ next_match_id: gfMatches[0].id, next_team_slot: 1 })
          .eq('id', wbFinalMatch.id);
      }
      if (lastLbMatches.length > 0) {
        const lastLbMatch = lastLbMatches[lastLbMatches.length - 1];
        await supabase
          .from('matches')
          .update({ next_match_id: gfMatches[0].id, next_team_slot: 2 })
          .eq('id', lastLbMatch.id);
      }

      if (gfMatches.length > 1) {
        await supabase
          .from('matches')
          .update({ next_match_id: gfMatches[1].id, next_team_slot: 1 })
          .eq('id', gfMatches[0].id);
        await supabase
          .from('matches')
          .update({ next_match_id: gfMatches[1].id, next_team_slot: 2 })
          .eq('id', gfMatches[1].id);
      }
    }

    // Assign teams to WB R1
    const wbR1Matches = wbMatches.filter(m => m.round === 1);
    const wbR1Byes = wbRoundStructure[0].byes;
    const shuffledIds = [...teamIds].sort(() => Math.random() - 0.5);

    let teamIdx = 0;
    for (let i = 0; i < wbR1Matches.length; i++) {
      const match = wbR1Matches[i];
      const isBye = i >= wbR1Matches.length - wbR1Byes;

      if (isBye && teamIdx < shuffledIds.length) {
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

    await propagateDEWinners(selectedTournament.id);
    await propagateLosers(selectedTournament.id);

    await fetchMatches(selectedTournament.id);
  };

  const generateBracket = async () => {
    if (!selectedTournament) return;

    await supabase
      .from('tournaments')
      .update({
        double_elimination: doubleElimination,
        has_grand_finale: grandFinale
      })
      .eq('id', selectedTournament.id);
    setSelectedTournament({
      ...selectedTournament,
      double_elimination: doubleElimination,
      has_grand_finale: grandFinale
    });

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

    await supabase.from('matches').delete().eq('tournament_id', selectedTournament.id);
    setMatches([]);

    if (doubleElimination || selectedTournament.double_elimination) {
      await generateDoubleEliminationBracket(teamIds);
    } else {
      await generateSingleEliminationBracket(teamIds);
    }
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

      for (const match of allMatches) {
        if (match.is_bye && match.team1_id && !match.winner_id) {
          await supabase.from('matches').update({ winner_id: match.team1_id }).eq('id', match.id);
          match.winner_id = match.team1_id;
          madeChanges = true;
        }
      }

      for (const match of allMatches) {
        if (match.winner_id && match.next_match_id) {
          const slotField = match.next_team_slot === 1 ? 'team1_id' : 'team2_id';
          const nextMatch = allMatches.find(m => m.id === match.next_match_id);

          if (nextMatch && !nextMatch[slotField]) {
            await supabase
              .from('matches')
              .update({ [slotField]: match.winner_id })
              .eq('id', nextMatch.id);
            nextMatch[slotField] = match.winner_id;
            madeChanges = true;
          }
        }
      }
    }
  };

  const propagateDEWinners = async (tournamentId) => {
    let madeChanges = true;
    while (madeChanges) {
      madeChanges = false;

      const { data: allMatches } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', tournamentId);

      if (!allMatches) return;

      for (const match of allMatches) {
        if (match.is_bye && match.team1_id && !match.winner_id) {
          await supabase.from('matches').update({ winner_id: match.team1_id }).eq('id', match.id);
          match.winner_id = match.team1_id;
          madeChanges = true;
        }
      }

      for (const match of allMatches) {
        if (match.winner_id && match.next_match_id) {
          const slotField = match.next_team_slot === 1 ? 'team1_id' : 'team2_id';
          const nextMatch = allMatches.find(m => m.id === match.next_match_id);

          if (nextMatch && !nextMatch[slotField]) {
            await supabase
              .from('matches')
              .update({ [slotField]: match.winner_id })
              .eq('id', nextMatch.id);
            nextMatch[slotField] = match.winner_id;
            madeChanges = true;
          }
        }
      }

      for (const match of allMatches) {
        if (match.winner_id && match.loser_match_id) {
          const loserId = match.team1_id === match.winner_id ? match.team2_id : match.team1_id;
          if (!loserId) continue;

          const loserMatch = allMatches.find(m => m.id === match.loser_match_id);
          if (loserMatch) {
            const slotField = !loserMatch.team1_id ? 'team1_id' : (!loserMatch.team2_id ? 'team2_id' : null);
            if (slotField && !loserMatch[slotField]) {
              await supabase
                .from('matches')
                .update({ [slotField]: loserId })
                .eq('id', loserMatch.id);
              loserMatch[slotField] = loserId;
              madeChanges = true;
            }
          }
        }
      }

      for (const match of allMatches) {
        if (match.bracket === 'losers' && match.team1_id && !match.team2_id && !match.winner_id) {
          await supabase.from('matches').update({ winner_id: match.team1_id }).eq('id', match.id);
          match.winner_id = match.team1_id;
          madeChanges = true;
        }
      }
    }
  };

  const propagateLosers = async (tournamentId) => {
    let madeChanges = true;
    while (madeChanges) {
      madeChanges = false;

      const { data: allMatches } = await supabase
        .from('matches')
        .select('*')
        .eq('tournament_id', tournamentId);

      if (!allMatches) return;

      for (const match of allMatches) {
        if (match.winner_id && match.next_match_id && match.bracket === 'losers') {
          const slotField = match.next_team_slot === 1 ? 'team1_id' : 'team2_id';
          const nextMatch = allMatches.find(m => m.id === match.next_match_id);

          if (nextMatch && !nextMatch[slotField]) {
            await supabase
              .from('matches')
              .update({ [slotField]: match.winner_id })
              .eq('id', nextMatch.id);
            nextMatch[slotField] = match.winner_id;
            madeChanges = true;
          }
        }
      }

      const gfMatches = allMatches.filter(m => m.bracket === 'grand_final');
      for (const match of gfMatches) {
        if (match.winner_id && match.next_match_id) {
          const slotField = match.next_team_slot === 1 ? 'team1_id' : 'team2_id';
          const nextMatch = allMatches.find(m => m.id === match.next_match_id);

          if (nextMatch && !nextMatch[slotField]) {
            await supabase
              .from('matches')
              .update({ [slotField]: match.winner_id })
              .eq('id', nextMatch.id);
            nextMatch[slotField] = match.winner_id;
            madeChanges = true;
          }
        }
      }
    }
  };

  const deleteBracket = async () => {
    if (!selectedTournament) return;
    await supabase.from('matches').delete().eq('tournament_id', selectedTournament.id);
    await supabase.from('tournaments').update({ started: false, double_elimination: false, has_grand_finale: false }).eq('id', selectedTournament.id);
    setMatches([]);
    setSelectedTournament({ ...selectedTournament, started: false, double_elimination: false, has_grand_finale: false });
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
        bracket: m.bracket,
        next_match_id: m.next_match_id,
        next_team_slot: m.next_team_slot,
        loser_match_id: m.loser_match_id
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

  const bracketGroups = {
    winners: matches.filter(m => m.bracket === 'winners'),
    losers: matches.filter(m => m.bracket === 'losers'),
    grand_final: matches.filter(m => m.bracket === 'grand_final')
  };

  const renderMatchItem = (m) => (
    <li key={m.id} className="list-group-item d-flex justify-content-between align-items-center">
      <div>
        <strong>Match {m.position + 1}:</strong>{' '}
        {m.team1?.name || <span className="text-muted fst-italic">TBD</span>}
        {' '}<strong style={{ color: 'red' }}>vs</strong>{' '}
        {m.team2_id === null
          ? <span className="text-muted">BYE</span>
          : m.team2?.name || <span className="text-muted fst-italic">TBD</span>
        }
        <span className="ms-2 text-muted">({m.team1_score} - {m.team2_score})</span>
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
  );

  const renderMatchBracket = (m) => (
    <div key={m.id} className={`bracket-match ${m.winner_id ? 'bracket-match-completed' : ''}`}>
      <div
        className={`bracket-team ${m.winner_id === m.team1?.id ? 'bracket-team-winner' : ''}`}
        onClick={() => m.team1_id && m.team2_id && !m.winner_id && playMatch(m)}
        style={{ cursor: m.team1_id && m.team2_id && !m.winner_id ? 'pointer' : 'default' }}
      >
        <span className="bracket-team-name">{m.team1?.name || 'TBD'}</span>
        <span className="bracket-team-score">{m.team1_score ?? ''}</span>
      </div>
      <div
        className={`bracket-team ${m.winner_id === m.team2?.id ? 'bracket-team-winner' : ''}`}
        onClick={() => m.team1_id && m.team2_id && !m.winner_id && playMatch(m)}
        style={{ cursor: m.team1_id && m.team2_id && !m.winner_id ? 'pointer' : 'default' }}
      >
        <span className="bracket-team-name">{m.team2?.name || (m.team2_id === null ? 'BYE' : 'TBD')}</span>
        <span className="bracket-team-score">{m.team2_score ?? ''}</span>
      </div>
    </div>
  );

  const renderRoundView = (matchesForRound, bracketTitle, headerClass) => (
    <div className="mb-4">
      <h5 className={`text-muted ${headerClass || ''}`}>{bracketTitle}</h5>
      {matchesForRound.length === 0 ? (
        <p className="text-muted small">No matches in this bracket.</p>
      ) : (
        (() => {
          const maxR = matchesForRound.length > 0 ? Math.max(...matchesForRound.map(m => m.round || 1)) : 1;
          const rounds = [];
          for (let r = 1; r <= maxR; r++) {
            const roundMatches = matchesForRound
              .filter(m => m.round === r)
              .sort((a, b) => a.position - b.position);
            if (roundMatches.length > 0) rounds.push({ round: r, matches: roundMatches });
          }
          return rounds.map(({ round, matches: roundMatches }) => (
            <div key={round} className="mb-2">
              <h6 className="text-muted small">{getRoundLabel(round, maxR)}</h6>
              <ul className="list-group">{roundMatches.map(renderMatchItem)}</ul>
            </div>
          ));
        })()
      )}
    </div>
  );

  const renderBracketView = (bracketName, matchesForBracket) => {
    const maxR = matchesForBracket.length > 0 ? Math.max(...matchesForBracket.map(m => m.round || 1)) : 1;
    const rounds = [];
    for (let r = 1; r <= maxR; r++) {
      const roundMatches = matchesForBracket
        .filter(m => m.round === r)
        .sort((a, b) => a.position - b.position);
      if (roundMatches.length > 0) rounds.push({ round: r, matches: roundMatches });
    }

    if (rounds.length === 0) return null;

    return (
      <div className="mb-3">
        <div className="bracket-container d-flex justify-content-center" style={{ overflowX: 'auto', paddingBottom: '1rem' }}>
          {rounds.map(({ round, matches: roundMatches }) => (
            <div key={round} className="bracket-round">
              <div className="bracket-round-label">{bracketName} - {getRoundLabel(round, maxR)}</div>
              {roundMatches.map(renderMatchBracket)}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="container py-4">
      <h2>Tournaments</h2>

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
              {t.double_elimination ? ' [DE]' : ''}
            </small>
          </li>
        ))}
      </ul>

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

          {!selectedTournament.started && (
            <div>
              <div className="btn-group mb-3">
                <button
                  className={`btn ${mode === 'teams' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setMode('teams')}
                >Teams</button>
                <button
                  className={`btn ${mode === 'players' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setMode('players')}
                >Players</button>
              </div>

              {mode === 'players' && (
                <div>
                  <div className="mb-3 d-flex gap-2">
                    <input className="form-control" value={newPlayer} onChange={(e) => { setNewPlayer(e.target.value); setPlayerError(''); }} placeholder="Player name" />
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
                  <div className="text-muted small mb-3">{players.length} player{players.length !== 1 ? 's' : ''} added</div>
                  <button className="btn btn-info" onClick={generateTeams}>Generate Teams</button>
                </div>
              )}

              {mode === 'teams' && (
                <div>
                  <div className="mb-3 d-flex gap-2">
                    <input className="form-control" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} placeholder="Team name" />
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
                  <div className="text-muted small mb-3">{teams.length} team{teams.length !== 1 ? 's' : ''} added</div>
                </div>
              )}

              <div className="mt-4">
                <h4>Bracket</h4>

                <div className="mb-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="doubleElimination"
                      checked={doubleElimination}
                      onChange={(e) => setDoubleElimination(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="doubleElimination">
                      Double Elimination
                    </label>
                  </div>
                  {doubleElimination && (
                    <div className="form-check ms-4 mt-1">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="grandFinale"
                        checked={grandFinale}
                        onChange={(e) => setGrandFinale(e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="grandFinale">
                        Grand Finale (loser bracket champion must beat winner bracket champion twice)
                      </label>
                      {!grandFinale && (
                        <div className="text-muted small mt-1">
                          Without Grand Finale, the winner bracket champion is 1st place and the loser bracket champion is 2nd place.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="d-flex gap-2 mb-3">
                  <button className="btn btn-warning" onClick={generateBracket}>
                    {hasBracket ? 'Re-generate Bracket' : 'Generate Bracket'}
                  </button>
                  {hasBracket && (
                    <>
                      <button className="btn btn-success" onClick={startTournament}>Start Tournament</button>
                      <button className="btn btn-danger" onClick={deleteBracket}>Delete Bracket</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {hasBracket && (
            <div className="mt-3">
              <div className="d-flex align-items-center gap-3 mb-3">
                <h4 className="mb-0">Matches</h4>
                <button className="btn btn-outline-info btn-sm" onClick={() => fetchMatches(selectedTournament.id)} title="Refresh scores from database">
                  Fetch Scores
                </button>
                <div className="btn-group" role="group">
                  <button className={`btn btn-sm ${viewMode === 'round' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setViewMode('round')}>Round View</button>
                  <button className={`btn btn-sm ${viewMode === 'bracket' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setViewMode('bracket')}>Bracket View</button>
                </div>
              </div>

              {viewMode === 'round' && (
                <>
                  {isDE && (
                    <>
                      <div className="border-start border-primary border-4 ps-2 mb-3">
                        {renderRoundView(bracketGroups.winners, 'Winners Bracket')}
                      </div>
                      <div className="border-start border-danger border-4 ps-2 mb-3">
                        {renderRoundView(bracketGroups.losers, 'Losers Bracket')}
                      </div>
                      {bracketGroups.grand_final.length > 0 && (
                        <div className="border-start border-warning border-4 ps-2 mb-3">
                          {renderRoundView(bracketGroups.grand_final, 'Grand Final')}
                        </div>
                      )}
                    </>
                  )}
                  {!isDE && renderRoundView(bracketGroups.winners, 'Matches')}
                </>
              )}

              {viewMode === 'bracket' && (
                <>
                  {isDE && (
                    <>
                      <div className="border border-primary rounded p-1 mb-2" style={{ backgroundColor: '#f0f8ff' }}>
                        {renderBracketView('Winners', bracketGroups.winners)}
                      </div>
                      <div className="border border-danger rounded p-1 mb-2" style={{ backgroundColor: '#fff5f5' }}>
                        {renderBracketView('Losers', bracketGroups.losers)}
                      </div>
                      {bracketGroups.grand_final.length > 0 && (
                        <div className="border border-warning rounded p-1" style={{ backgroundColor: '#fffef5' }}>
                          {renderBracketView('Grand Final', bracketGroups.grand_final)}
                        </div>
                      )}
                    </>
                  )}
                  {!isDE && renderBracketView('Matches', bracketGroups.winners)}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}