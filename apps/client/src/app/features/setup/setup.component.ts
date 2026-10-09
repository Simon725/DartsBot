import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
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
import { findGame } from '../../core/game-catalog';
import { GameStateService } from '../../core/game-state.service';
import { SegmentedControlComponent, type SegmentOption } from '../../shared/segmented-control.component';
import { SpotlightDirective } from '../../shared/spotlight.directive';
import { StepperComponent } from '../../shared/stepper.component';

type BotPresetChoice = BotDifficulty | 'custom';

interface PlayerDraft {
  /** Stable identity for template tracking, so DOM rows don't recycle on remove. */
  uid: number;
  name: string;
  isBot: boolean;
  botPreset: BotPresetChoice;
  botConfig: BotConfig;
}

const MAX_PLAYERS = 8;
const DIFFICULTIES: BotDifficulty[] = ['beginner', 'casual', 'club', 'pro'];

let nextDraftUid = 1;

function humanDraft(name: string): PlayerDraft {
  return {
    uid: nextDraftUid++,
    name,
    isBot: false,
    botPreset: 'casual',
    botConfig: { ...BOT_PRESETS.casual },
  };
}

function botDraft(preset: BotDifficulty, name: string): PlayerDraft {
  return {
    uid: nextDraftUid++,
    name,
    isBot: true,
    botPreset: preset,
    botConfig: { ...BOT_PRESETS[preset] },
  };
}

function defaultPlayers(mode: GameMode): PlayerDraft[] {
  if (mode === '121') return [humanDraft('Player 1')];
  return [humanDraft('Player 1'), botDraft('club', 'Bot')];
}

function matchPreset(config: BotConfig): BotPresetChoice {
  const match = DIFFICULTIES.find(
    (difficulty) =>
      BOT_PRESETS[difficulty].targetAverage === config.targetAverage &&
      BOT_PRESETS[difficulty].checkoutPercent === config.checkoutPercent,
  );
  return match ?? 'custom';
}

@Component({
  selector: 'app-setup',
  imports: [FormsModule, RouterLink, SegmentedControlComponent, SpotlightDirective, StepperComponent],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.css',
})
export class SetupComponent {
  private readonly gameState = inject(GameStateService);
  private readonly router = inject(Router);

  readonly mode = input.required<GameMode>();
  readonly game = computed(() => findGame(this.mode())!);

  readonly startScore = signal<301 | 501 | 701 | 1001>(501);
  readonly sets = signal(1);
  readonly legsPerSet = signal(3);
  readonly inMode = signal<CheckoutMode>('straight');
  readonly outMode = signal<CheckoutMode>('double');
  readonly shanghaiRounds = signal<7 | 20>(7);
  readonly killerLives = signal(3);
  readonly dartLimit = signal(9);
  readonly onFail = signal<OneTwoOneFailMode>('fallback');

  readonly players = linkedSignal(() => defaultPlayers(this.mode()));

  readonly creating = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly isSinglePlayer = computed(() => this.mode() === '121');
  readonly hasSettings = computed(() => !['cricket', 'around-the-clock'].includes(this.mode()));
  readonly canAddPlayer = computed(() => !this.isSinglePlayer() && this.players().length < MAX_PLAYERS);

  readonly startBlockedReason = computed(() => {
    if (this.mode() === 'killer' && this.players().length < 2) return 'Killer needs at least 2 players.';
    return null;
  });

  readonly startScoreOptions: SegmentOption<301 | 501 | 701 | 1001>[] = [301, 501, 701, 1001].map(
    (score) => ({ value: score as 301 | 501 | 701 | 1001, label: String(score) }),
  );
  readonly checkoutOptions: SegmentOption<CheckoutMode>[] = [
    { value: 'straight', label: 'Straight' },
    { value: 'double', label: 'Double' },
    { value: 'master', label: 'Master' },
  ];
  readonly shanghaiRoundOptions: SegmentOption<7 | 20>[] = [
    { value: 7, label: '7 rounds' },
    { value: 20, label: '20 rounds' },
  ];
  readonly failOptions: SegmentOption<OneTwoOneFailMode>[] = [
    { value: 'fallback', label: 'Drop one' },
    { value: 'stay', label: 'Stay' },
  ];
  readonly presetChoices: BotPresetChoice[] = [...DIFFICULTIES, 'custom'];
  readonly BOT_LIMITS = BOT_LIMITS;

  addPlayer(): void {
    if (!this.canAddPlayer()) return;
    this.players.update((list) => [...list, humanDraft(`Player ${list.length + 1}`)]);
  }

  removePlayer(index: number): void {
    this.players.update((list) => (list.length <= 1 ? list : list.filter((_, i) => i !== index)));
  }

  updatePlayerName(index: number, name: string): void {
    this.updatePlayer(index, (player) => ({ ...player, name }));
  }

  updatePlayerIsBot(index: number, isBot: boolean): void {
    this.updatePlayer(index, (player) =>
      isBot
        ? { ...player, isBot: true, botPreset: 'casual', botConfig: { ...BOT_PRESETS.casual } }
        : { ...player, isBot: false },
    );
  }

  setPlayerPreset(index: number, preset: BotPresetChoice): void {
    this.updatePlayer(index, (player) =>
      preset === 'custom'
        ? { ...player, botPreset: 'custom' }
        : { ...player, botPreset: preset, botConfig: { ...BOT_PRESETS[preset] } },
    );
  }

  setPlayerAvg(index: number, targetAverage: number): void {
    this.updateBotConfig(index, { targetAverage });
  }

  setPlayerCheckout(index: number, checkoutPercent: number): void {
    this.updateBotConfig(index, { checkoutPercent });
  }

  async start(): Promise<void> {
    if (this.startBlockedReason()) return;
    this.creating.set(true);
    this.errorMessage.set(null);
    try {
      const gameId = this.gameState.createGame(this.buildConfig(), this.buildPlayers());
      await this.router.navigate(['/game', gameId]);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.creating.set(false);
    }
  }

  private updatePlayer(index: number, change: (player: PlayerDraft) => PlayerDraft): void {
    this.players.update((list) => list.map((player, i) => (i === index ? change(player) : player)));
  }

  private updateBotConfig(index: number, patch: Partial<BotConfig>): void {
    this.updatePlayer(index, (player) => {
      const botConfig = { ...player.botConfig, ...patch };
      return { ...player, botConfig, botPreset: matchPreset(botConfig) };
    });
  }

  private buildPlayers(): Player[] {
    return this.players().map((draft, i) => {
      const player: Player = {
        id: `p${i + 1}`,
        name: draft.name.trim() || `Player ${i + 1}`,
        isBot: draft.isBot,
      };
      if (!draft.isBot) return player;
      return {
        ...player,
        botDifficulty: draft.botPreset === 'custom' ? 'casual' : draft.botPreset,
        botConfig: { ...draft.botConfig },
      };
    });
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
}
