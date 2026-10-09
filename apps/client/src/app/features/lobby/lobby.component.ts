import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  BOT_LIMITS,
  BOT_PRESETS,
  type BotConfig,
  type BotDifficulty,
  type CheckoutMode,
  type GameConfig,
  type GameMode,
  type OneTwoOneFailMode,
  type Player,
} from '@darts/shared';
import { GameStateService } from '../../core/game-state.service';
import { SpotlightDirective } from '../../shared/spotlight.directive';

type BotPresetChoice = BotDifficulty | 'custom';

interface PlayerDraft {
  /** Stable identity for template tracking — keeps DOM rows from recycling on remove. */
  uid: number;
  name: string;
  isBot: boolean;
  /** Named preset or 'custom' when the user has tweaked a slider. */
  botPreset: BotPresetChoice;
  /** Live tunable values (avg + checkout %). Filled from preset, edited freely. */
  botConfig: BotConfig;
}

interface ModeOption {
  value: GameMode;
  label: string;
  description: string;
}

let nextDraftUid = 1;

function draftFromPreset(preset: BotDifficulty, name: string): PlayerDraft {
  return {
    uid: nextDraftUid++,
    name,
    isBot: true,
    botPreset: preset,
    botConfig: { ...BOT_PRESETS[preset] },
  };
}

function humanDraft(name: string): PlayerDraft {
  return {
    uid: nextDraftUid++,
    name,
    isBot: false,
    botPreset: 'casual',
    botConfig: { ...BOT_PRESETS.casual },
  };
}

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [FormsModule, SpotlightDirective],
  templateUrl: './lobby.component.html',
  styleUrl: './lobby.component.css',
})
export class LobbyComponent {
  private readonly gameState = inject(GameStateService);
  private readonly router = inject(Router);

  readonly modeOptions: ModeOption[] = [
    { value: 'x01', label: 'x01', description: '301 / 501 / 701 / 1001' },
    { value: 'cricket', label: 'Cricket', description: 'Close 15-20 + bull' },
    { value: 'around-the-clock', label: 'Around the Clock', description: 'Hit 1 to 20 in order' },
    { value: 'shanghai', label: 'Shanghai', description: '7-round target practice' },
    { value: 'killer', label: 'Killer', description: 'Knock out opponents' },
    { value: '121', label: '121', description: 'Endless checkout drill' },
  ];

  readonly mode = signal<GameMode>('x01');

  readonly startScore = signal<301 | 501 | 701 | 1001>(501);
  readonly sets = signal(1);
  readonly legsPerSet = signal(3);
  readonly inMode = signal<CheckoutMode>('straight');
  readonly outMode = signal<CheckoutMode>('double');

  readonly shanghaiRounds = signal<7 | 20>(7);
  readonly killerLives = signal(3);
  readonly dartLimit = signal(9);
  readonly onFail = signal<OneTwoOneFailMode>('fallback');

  readonly players = signal<PlayerDraft[]>([
    humanDraft('Player 1'),
    draftFromPreset('club', 'Bot'),
  ]);

  readonly creating = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly isSinglePlayer = computed(() => this.mode() === '121');

  /** Non-null when the current setup cannot start (start button is disabled). */
  readonly startBlockedReason = computed(() => {
    if (this.mode() === 'killer' && this.players().length < 2) {
      return 'Killer needs at least 2 players';
    }
    return null;
  });

  readonly difficulties: BotDifficulty[] = ['beginner', 'casual', 'club', 'pro'];
  readonly presetChoices: BotPresetChoice[] = ['beginner', 'casual', 'club', 'pro', 'custom'];
  readonly checkoutModes: CheckoutMode[] = ['straight', 'double', 'master'];
  readonly failModes: Array<{ value: OneTwoOneFailMode; label: string }> = [
    { value: 'fallback', label: 'Fall back one target' },
    { value: 'stay', label: 'Stay on target' },
  ];
  readonly startScores: Array<301 | 501 | 701 | 1001> = [301, 501, 701, 1001];
  readonly BOT_LIMITS = BOT_LIMITS;

  constructor() {
    effect(() => {
      if (this.isSinglePlayer()) {
        // Trim to one player AND force them human — a lone bot must not survive
        // the switch (121 never ends, so a bot would play itself forever, and
        // the BOT toggle is hidden in single-player mode so the user couldn't
        // even see it).
        this.players.update((list) => {
          const first = list[0];
          if (!first) return list;
          if (list.length === 1 && !first.isBot) return list;
          return [{ ...first, isBot: false }];
        });
      }
    });
  }

  addPlayer(): void {
    this.players.update((list) => {
      if (list.length >= 8) return list;
      return [...list, humanDraft(`Player ${list.length + 1}`)];
    });
  }

  removePlayer(index: number): void {
    this.players.update((list) => {
      if (list.length <= 1) return list;
      return list.filter((_, i) => i !== index);
    });
  }

  updatePlayerName(index: number, name: string): void {
    this.players.update((list) => list.map((p, i) => (i === index ? { ...p, name } : p)));
  }

  updatePlayerIsBot(index: number, isBot: boolean): void {
    this.players.update((list) =>
      list.map((p, i) =>
        i === index
          ? isBot
            ? { ...p, isBot: true, botPreset: 'casual', botConfig: { ...BOT_PRESETS.casual } }
            : { ...p, isBot: false }
          : p,
      ),
    );
  }

  /** Set the named preset and reset the sliders to the preset's values. */
  setPlayerPreset(index: number, preset: BotPresetChoice): void {
    this.players.update((list) =>
      list.map((p, i) => {
        if (i !== index) return p;
        if (preset === 'custom') {
          // Keep current sliders, just mark as custom.
          return { ...p, botPreset: 'custom' };
        }
        return { ...p, botPreset: preset, botConfig: { ...BOT_PRESETS[preset] } };
      }),
    );
  }

  /** Update a tunable slider value; flips preset to 'custom' if changed. */
  setPlayerAvg(index: number, targetAverage: number): void {
    this.players.update((list) =>
      list.map((p, i) => {
        if (i !== index) return p;
        const cfg = { ...p.botConfig, targetAverage };
        const preset = this.matchPreset(cfg);
        return { ...p, botConfig: cfg, botPreset: preset };
      }),
    );
  }

  setPlayerCheckout(index: number, checkoutPercent: number): void {
    this.players.update((list) =>
      list.map((p, i) => {
        if (i !== index) return p;
        const cfg = { ...p.botConfig, checkoutPercent };
        const preset = this.matchPreset(cfg);
        return { ...p, botConfig: cfg, botPreset: preset };
      }),
    );
  }

  /** Returns the named preset matching cfg exactly, or 'custom'. */
  private matchPreset(cfg: BotConfig): BotPresetChoice {
    for (const d of this.difficulties) {
      const p = BOT_PRESETS[d];
      if (p.targetAverage === cfg.targetAverage && p.checkoutPercent === cfg.checkoutPercent) {
        return d;
      }
    }
    return 'custom';
  }

  private buildConfig(): GameConfig {
    switch (this.mode()) {
      case 'x01':
        return {
          mode: 'x01',
          startScore: this.startScore(),
          sets: this.sets(),
          legsPerSet: this.legsPerSet(),
          inMode: this.inMode(),
          outMode: this.outMode(),
        };
      case 'cricket':
        return { mode: 'cricket' };
      case 'around-the-clock':
        return { mode: 'around-the-clock' };
      case 'shanghai':
        return { mode: 'shanghai', rounds: this.shanghaiRounds() };
      case 'killer':
        return { mode: 'killer', startingLives: this.killerLives() };
      case '121':
        return { mode: '121', dartLimit: this.dartLimit(), onFail: this.onFail() };
    }
  }

  async start(): Promise<void> {
    if (this.startBlockedReason()) return;
    this.creating.set(true);
    this.errorMessage.set(null);
    try {
      const players: Player[] = this.players().map((p, i) => {
        const base: Player = {
          id: `p${i + 1}`,
          name: p.name.trim() || `Player ${i + 1}`,
          isBot: p.isBot,
        };
        if (p.isBot) {
          base.botDifficulty = p.botPreset === 'custom' ? 'casual' : p.botPreset;
          base.botConfig = { ...p.botConfig };
        }
        return base;
      });
      const gameId = await this.gameState.createGame(this.buildConfig(), players);
      await this.router.navigate(['/game', gameId]);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.creating.set(false);
    }
  }
}
