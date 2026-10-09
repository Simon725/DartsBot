import { Component, computed, input } from '@angular/core';
import { threeDartAverage, x01LegTotals, x01MatchTotals, type GameState, type Player } from '@darts/shared';

interface LegCell {
  playerId: string;
  average: string;
  darts: number;
  won: boolean;
}

interface LegRow {
  number: number;
  cells: LegCell[];
}

@Component({
  selector: 'app-leg-history',
  templateUrl: './leg-history.component.html',
  styleUrl: './leg-history.component.css',
})
export class LegHistoryComponent {
  readonly state = input.required<GameState>();

  readonly players = computed<Player[]>(() => this.state().players);

  readonly rows = computed<LegRow[]>(() => {
    const state = this.state();
    if (state.modeState.mode !== 'x01') return [];
    return state.modeState.completedLegs.map((leg, index) => ({
      number: index + 1,
      cells: state.players.map((player) => {
        const totals = x01LegTotals(leg, player.id);
        return {
          playerId: player.id,
          average: formatAverage(threeDartAverage(totals.scored, totals.darts)),
          darts: totals.darts,
          won: leg.winnerId === player.id,
        };
      }),
    }));
  });

  readonly matchAverages = computed<string[]>(() => {
    const state = this.state();
    const ms = state.modeState;
    if (ms.mode !== 'x01') return [];
    return state.players.map((player) => {
      const totals = x01MatchTotals(ms, player.id);
      return formatAverage(threeDartAverage(totals.scored, totals.darts));
    });
  });
}

function formatAverage(average: number | null): string {
  return average === null ? '-' : average.toFixed(2);
}
