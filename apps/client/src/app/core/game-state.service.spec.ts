import { TestBed } from '@angular/core/testing';
import type { Player, Throw, X01Config } from '@darts/shared';
import { GameStateService, readSavedGameSummary } from './game-state.service';

const alice: Player = { id: 'p1', name: 'Alice', isBot: false };
const bob: Player = { id: 'p2', name: 'Bob', isBot: false };

const x01Config: X01Config = {
  mode: 'x01',
  startScore: 301,
  sets: 1,
  legsPerSet: 3,
  inMode: 'straight',
  outMode: 'double',
};

function dart(segment: number, multiplier: 1 | 2 | 3 = 1): Throw {
  return { segment, multiplier, score: segment * multiplier, isValid: true };
}

describe('GameStateService', () => {
  let service: GameStateService;
  let gameId: string;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(GameStateService);
    gameId = service.createGame(x01Config, [alice, bob]);
  });

  function throwDarts(playerId: string, darts: Throw[]): void {
    darts.forEach((d) => service.throwDart(gameId, playerId, d));
  }

  it('summarizes a finished turn', () => {
    throwDarts('p1', [dart(20), dart(20), dart(1)]);

    expect(service.lastTurn()).toEqual({ playerId: 'p1', playerName: 'Alice', scored: 41, bust: false });
  });

  it('marks a bust turn', () => {
    service.throwTurn(gameId, 'p1', 180);
    service.throwTurn(gameId, 'p2', 0);
    throwDarts('p1', [dart(20, 3), dart(20, 3)]);

    expect(service.lastTurn()).toMatchObject({ playerId: 'p1', scored: 0, bust: true });
  });

  it('summarizes a turn entered as a total', () => {
    service.throwTurn(gameId, 'p1', 60);

    expect(service.lastTurn()).toMatchObject({ playerId: 'p1', scored: 60, bust: false });
  });

  it('reports a won leg until dismissed', () => {
    service.throwTurn(gameId, 'p1', 180);
    service.throwTurn(gameId, 'p2', 0);
    service.throwTurn(gameId, 'p1', 81);
    service.throwTurn(gameId, 'p2', 0);
    throwDarts('p1', [dart(20, 2)]);

    expect(service.legWon()).toMatchObject({
      winnerId: 'p1',
      winnerName: 'Alice',
      legNumber: 1,
      darts: 7,
      checkout: dart(20, 2),
    });
    expect(service.lastTurn()).toMatchObject({ playerId: 'p1', scored: 40 });

    service.dismissLegWon();
    expect(service.legWon()).toBeNull();
  });

  it('reports no checkout dart when the leg is finished by a turn total', () => {
    service.throwTurn(gameId, 'p1', 180);
    service.throwTurn(gameId, 'p2', 0);
    service.throwTurn(gameId, 'p1', 81);
    service.throwTurn(gameId, 'p2', 0);
    service.throwTurn(gameId, 'p1', 40, 1);

    expect(service.legWon()).toMatchObject({ winnerId: 'p1', checkout: null });
  });

  it('reports cricket points scored over the whole turn', () => {
    const cricketId = service.createGame({ mode: 'cricket' }, [alice, bob]);
    [dart(20, 3), dart(20, 2), dart(20)].forEach((d) => service.throwDart(cricketId, 'p1', d));

    expect(service.lastTurn()).toMatchObject({ playerId: 'p1', scored: 60, bust: false });
  });

  it('exposes the saved game until it is abandoned', () => {
    service.throwTurn(gameId, 'p1', 60);

    expect(readSavedGameSummary()).toEqual({ id: gameId, mode: 'x01', playerNames: ['Alice', 'Bob'] });

    service.abandonGame();
    expect(readSavedGameSummary()).toBeNull();
    expect(service.state()).toBeNull();
  });
});
