/**
 * Deterministic match-3 rules shared by the authoritative room simulation.
 * Tile values are integers 0..4; board indices are row-major on a 7x7 grid.
 */
export const BOARD_SIZE = 7;
export const TILE_TYPES = 5;
export type Board = number[];
export type AttackKind = "punch" | "rifle" | "slam";
export interface Attack { kind: AttackKind; damage: number; chain: number; cleared: number; critical: boolean }
export interface MoveResult {
  accepted: boolean;
  board: Board;
  attacks: Attack[];
  rage: number;
  chains: number;
  reason?: "invalid_index" | "not_adjacent" | "no_match";
}

function rng(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e3779b9;
  return () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
}

export function findMatches(board: Board): Array<{ tile: number; cells: number[] }> {
  if (board.length !== BOARD_SIZE * BOARD_SIZE) throw new Error("invalid_board_size");
  const runs: Array<{ tile: number; cells: number[] }> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE;) {
      const tile = board[r * BOARD_SIZE + c]; let end = c + 1;
      while (end < BOARD_SIZE && board[r * BOARD_SIZE + end] === tile) end++;
      if (tile >= 0 && end - c >= 3) runs.push({ tile, cells: Array.from({ length: end - c }, (_, k) => r * BOARD_SIZE + c + k) });
      c = end;
    }
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    for (let r = 0; r < BOARD_SIZE;) {
      const tile = board[r * BOARD_SIZE + c]; let end = r + 1;
      while (end < BOARD_SIZE && board[end * BOARD_SIZE + c] === tile) end++;
      if (tile >= 0 && end - r >= 3) runs.push({ tile, cells: Array.from({ length: end - r }, (_, k) => (r + k) * BOARD_SIZE + c) });
      r = end;
    }
  }
  const groups: Array<{ tile: number; cells: number[] }> = [];
  for (const run of runs) {
    const matching = groups.filter(g => g.tile === run.tile && g.cells.some(i => run.cells.includes(i)));
    if (!matching.length) groups.push({ tile: run.tile, cells: [...run.cells] });
    else {
      const first = matching[0];
      for (const extra of matching.slice(1)) {
        first.cells.push(...extra.cells);
        groups.splice(groups.indexOf(extra), 1);
      }
      first.cells = [...new Set([...first.cells, ...run.cells])];
    }
  }
  return groups;
}

export function hasLegalMove(board: Board): boolean {
  for (let i = 0; i < board.length; i++) {
    for (const j of [i + 1, i + BOARD_SIZE]) {
      if (j >= board.length || (j === i + 1 && i % BOARD_SIZE === BOARD_SIZE - 1)) continue;
      [board[i], board[j]] = [board[j], board[i]];
      const valid = findMatches(board).length > 0;
      [board[i], board[j]] = [board[j], board[i]];
      if (valid) return true;
    }
  }
  return false;
}

export function createBoard(seed: number): Board {
  const random = rng(seed);
  for (let attempt = 0; attempt < 100; attempt++) {
    const board: Board = [];
    for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
      const row = Math.floor(i / BOARD_SIZE), col = i % BOARD_SIZE;
      let tile = Math.floor(random() * TILE_TYPES), guard = 0;
      while (guard++ < 20 && (
        (col >= 2 && board[i - 1] === tile && board[i - 2] === tile) ||
        (row >= 2 && board[i - BOARD_SIZE] === tile && board[i - 2 * BOARD_SIZE] === tile)
      )) tile = Math.floor(random() * TILE_TYPES);
      board.push(tile);
    }
    if (!findMatches(board).length && hasLegalMove(board)) return board;
  }
  throw new Error("board_generation_failed");
}

function refill(board: Board, random: () => number): void {
  for (let col = 0; col < BOARD_SIZE; col++) {
    let write = BOARD_SIZE - 1;
    for (let row = BOARD_SIZE - 1; row >= 0; row--) {
      const index = row * BOARD_SIZE + col;
      if (board[index] >= 0) {
        const target = write * BOARD_SIZE + col;
        board[target] = board[index];
        if (target !== index) board[index] = -1;
        write--;
      }
    }
    for (let row = write; row >= 0; row--) board[row * BOARD_SIZE + col] = Math.floor(random() * TILE_TYPES);
  }
}

export function resolveMove(
  currentBoard: Board, from: number, to: number, level: number, currentRage: number, seed: number
): MoveResult {
  const board = [...currentBoard];
  const fail = (reason: MoveResult["reason"]): MoveResult => ({
    accepted: false, board: [...currentBoard], attacks: [], rage: currentRage, chains: 0, reason
  });
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= board.length || to >= board.length) return fail("invalid_index");
  const distance = Math.abs(Math.floor(from / BOARD_SIZE) - Math.floor(to / BOARD_SIZE)) + Math.abs(from % BOARD_SIZE - to % BOARD_SIZE);
  if (distance !== 1) return fail("not_adjacent");
  [board[from], board[to]] = [board[to], board[from]];
  let groups = findMatches(board);
  if (!groups.length) return fail("no_match");

  const random = rng(seed);
  const attacks: Attack[] = [];
  let rage = Math.max(0, Math.min(100, currentRage));
  let chain = 0;
  while (groups.length && chain < 50) {
    chain++;
    for (const group of groups) {
      const count = group.cells.length;
      const multiplier = 1 + 0.3 * (chain - 1);
      let kind: AttackKind = "punch", baseDamage = 9;
      if (count >= 5) {
        if (level >= 3) { kind = "slam"; baseDamage = 42; }
        else if (level >= 2) { kind = "rifle"; baseDamage = 20; }
        else baseDamage = 18;
      } else if (count === 4) {
        if (level >= 2) { kind = "rifle"; baseDamage = 18; }
        else baseDamage = 13;
      }
      rage = Math.min(100, rage + (chain > 1 ? 3 : count >= 5 ? 16 : count === 4 ? 10 : 6));
      const critical = random() < Math.min(0.25, 0.06 + 0.01 * level);
      attacks.push({
        kind, damage: Math.round(baseDamage * multiplier * (critical ? 1.8 : 1)),
        chain, cleared: count, critical
      });
      for (const cell of group.cells) board[cell] = -1;
    }
    refill(board, random);
    groups = findMatches(board);
  }
  if (!hasLegalMove(board)) {
    const fresh = createBoard(Math.floor(random() * 0xffffffff));
    for (let i = 0; i < board.length; i++) board[i] = fresh[i];
  }
  return { accepted: true, board, attacks, rage, chains: chain };
}
