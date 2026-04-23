import React, { useState, useRef, useEffect } from 'react';

function getContrastVariant(hex) {
  const normalized = hex.replace('#', '').length === 3
    ? hex.replace('#', '').split('').map(c => c + c).join('')
    : hex.replace('#', '');
  const r = parseInt(normalized.substr(0, 2), 16);
  const g = parseInt(normalized.substr(2, 2), 16);
  const b = parseInt(normalized.substr(4, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? 'dark' : 'light';
}

function TeamScore({ name, score, onScoreChange, onNameChange, color, onColorChange, disableScoring = false }) {
  const [showPalette, setShowPalette] = useState(false);
  const nameInputRef = useRef(null);
  const paletteRef = useRef(null);
  const colors = ['#F20D0D', '#F2A10D', '#F2F20D', '#067A06', '#0D0DF2', '#4A077B', '#E987E9'];
  const contrast = getContrastVariant(color);
  const outlineClass = contrast === 'light' ? 'btn-outline-light' : 'btn-outline-dark';
  const controlClass = contrast === 'light' ? 'btn-light' : 'btn-dark';

  useEffect(() => {
    if (!showPalette) return undefined;

    const handleClickOutside = (event) => {
      if (paletteRef.current && !paletteRef.current.contains(event.target)) {
        setShowPalette(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPalette]);

  return (
    <div className={`card team-card h-100 ${contrast === 'light' ? 'text-white' : 'text-dark'}`} style={{ backgroundColor: color }}>
      <div className="card-body d-flex flex-column h-100">
        <div className="d-flex align-items-center mb-3 position-relative" ref={paletteRef}>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            className="form-control me-2"
          />
          <button
            type="button"
            className={`btn ${outlineClass} btn-sm me-2`}
            onClick={() => nameInputRef.current?.focus()}
            title="Edit team name"
          >
            ✏️
          </button>
          <div className="position-relative">
            <button
              type="button"
              className={`btn ${outlineClass} btn-sm`}
              onClick={() => setShowPalette((visible) => !visible)}
              title="Choose team color"
              aria-expanded={showPalette}
            >
              🎨
            </button>
            {showPalette && (
              <div className="color-palette position-absolute shadow-sm rounded bg-white p-2">
                {colors.map(c => (
                  <button
                    key={c}
                    type="button"
                    className="color-button"
                    style={{ backgroundColor: c }}
                    onClick={() => { onColorChange(c); setShowPalette(false); }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="display-1 fw-bold d-flex align-items-center justify-content-center flex-grow-1">
          <span className="score">{score}</span>
        </div>

        <div className="btn-group w-100 mt-3" role="group">
          <button
            type="button"
            className={`btn ${controlClass} btn-lg border border-dark`}
            onClick={() => onScoreChange(1)}
            disabled={disableScoring}
          >
            +
          </button>
          <button
            type="button"
            className={`btn ${controlClass} btn-lg border border-dark`}
            onClick={() => onScoreChange(-1)}
            disabled={disableScoring}
          >
            -
          </button>
        </div>
      </div>
    </div>
  );
}

export default TeamScore;
