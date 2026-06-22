import React, { useState, useEffect } from 'react';
import './App.css';
import TeamScore from './TeamScore';
import Tournament from './Tournament';
import { Routes, Route, useNavigate } from 'react-router-dom';
import supabase from './supabase';
import { useLocation } from 'react-router-dom';

function Home({ navigate, ...props }) {
  const location = useLocation();
  const match = location.state;
  const [team1Score, setTeam1Score] = useState(0);
  const [team2Score, setTeam2Score] = useState(0);
  const [team1Name, setTeam1Name] = useState('Team 1');
  const [team2Name, setTeam2Name] = useState('Team 2');
  const [team1Color, setTeam1Color] = useState('#F20D0D');
  const [team2Color, setTeam2Color] = useState('#0D0DF2');
  const [winnerId, setWinnerId] = useState(null);

  const matchId = match?.matchId;
  const isTournamentMatch = Boolean(matchId);
  const matchHasWinner = Boolean(winnerId);
  const matchRound = match?.round;
  const latestRound = match?.latestRound;
  const isPreviousRound = isTournamentMatch && matchRound !== undefined && latestRound !== undefined && matchRound < latestRound;
  const disableResetScores = isPreviousRound;
  const disableScoring = matchHasWinner || isPreviousRound;

  // Determine winner name for display
  const winnerName = matchHasWinner
    ? (winnerId === match?.team1?.id || (!match?.team1?.id && winnerId === '1') ? team1Name : team2Name)
    : null;

  const saveMatchScore = async (team1_score, team2_score, winner_id = null) => {
    if (!matchId) return;

    const updatePayload = { team1_score, team2_score };
    if (winner_id) updatePayload.winner_id = winner_id;

    await supabase
      .from('matches')
      .update(updatePayload)
      .eq('id', matchId);
  };

  const declareWinnerIfNeeded = async (team, nextScore, otherScore) => {
    if (matchHasWinner) return null;
    if (nextScore < 21) return null;

    const winnerTeam = team === 1 ? match?.team1 : match?.team2;
    const winner_id = winnerTeam?.id || null;

    if (isTournamentMatch) {
      if (!winner_id) return null;
      await saveMatchScore(
        team === 1 ? nextScore : otherScore,
        team === 2 ? nextScore : otherScore,
        winner_id
      );

      // Auto-advance winner to next match slot in the bracket
      const nextMatchId = match?.next_match_id;
      const nextTeamSlot = match?.next_team_slot;
      if (nextMatchId && nextTeamSlot) {
        const slotField = nextTeamSlot === 1 ? 'team1_id' : 'team2_id';
        await supabase
          .from('matches')
          .update({ [slotField]: winner_id })
          .eq('id', nextMatchId);
      }
    }

    setWinnerId(winner_id || `${team}`);
    return winner_id || `${team}`;
  };

  const handleScoreChange = async (team, delta) => {
    if (matchHasWinner) return;

    if (team === 1) {
      const nextScore = Math.max(0, team1Score + delta);
      setTeam1Score(nextScore);
      const newWinnerId = await declareWinnerIfNeeded(1, nextScore, team2Score);
      if (isTournamentMatch && !newWinnerId) {
        await saveMatchScore(nextScore, team2Score);
      }
    } else {
      const nextScore = Math.max(0, team2Score + delta);
      setTeam2Score(nextScore);
      const newWinnerId = await declareWinnerIfNeeded(2, nextScore, team1Score);
      if (isTournamentMatch && !newWinnerId) {
        await saveMatchScore(team1Score, nextScore);
      }
    }
  };

  const handleNameChange = (team, newName) => {
    if (team === 1) setTeam1Name(newName);
    else setTeam2Name(newName);
  };

  const resetScores = () => {
    setTeam1Score(0);
    setTeam2Score(0);
    setWinnerId(null);
  };

  useEffect(() => {
    if (match) {
      setTeam1Name(match.team1.name);
      setTeam2Name(match.team2.name);
      setTeam1Score(match.team1_score ?? 0);
      setTeam2Score(match.team2_score ?? 0);
      setWinnerId(match.winner_id ?? null);
    }
  }, [match]);

  return (
    <div className="App">
      {/* HEADER */}
      <header className="App-header">
        <div className="container-fluid h-100 d-flex align-items-center justify-content-between p-2">
          <h1 className="h3 mb-0">Cornhole Scorekeeper</h1>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('/tournament')}
          >
            Tournament
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className="main-content h-100 container-fluid d-flex flex-column justify-content-center p-0">
        <div className="row gx-1 gy-1 justify-content-center m-0 w-100">
          <div className="col-12 col-md-6">
            <TeamScore
              name={team1Name}
              score={team1Score}
              onScoreChange={(delta) => handleScoreChange(1, delta)}
              onNameChange={(newName) => handleNameChange(1, newName)}
              color={team1Color}
              onColorChange={setTeam1Color}
              disableScoring={disableScoring}
            />
          </div>
          <div className="col-12 col-md-6">
            <TeamScore
              name={team2Name}
              score={team2Score}
              onScoreChange={(delta) => handleScoreChange(2, delta)}
              onNameChange={(newName) => handleNameChange(2, newName)}
              color={team2Color}
              onColorChange={setTeam2Color}
              disableScoring={disableScoring}
            />
          </div>
        </div>
      </main>

      {/* WINNER BANNER */}
      {matchHasWinner && (
        <div className="winner-banner text-center py-2" style={{ backgroundColor: '#28a745', color: 'white', fontWeight: 'bold', fontSize: '1.2rem' }}>
          🏆 {winnerName} Wins! 🏆
        </div>
      )}

      {/* FOOTER */}
      <footer className="App-footer content-fluid d-flex align-items-center justify-content-center p-0">
        <div className="col-6 col-md-3">
          <button
            type="button"
            onClick={resetScores}
            className="btn btn-danger btn-lg px-1 w-100"
            disabled={disableResetScores}
          >
            {isPreviousRound ? "Previous Round" : "Reset Scores"}
          </button>
        </div>
          </footer>
    </div>
  );
}

function App() {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/"
        element={<Home navigate={navigate} />}
      />
      <Route
        path="/tournament"
        element={<Tournament />}
      />
    </Routes>
  );
}

export default App;
