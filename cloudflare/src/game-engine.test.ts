import { describe, expect, it } from "vitest";
import { BOARD_SIZE, createBoard, findMatches, hasLegalMove, resolveMove } from "./game-engine";

function firstLegalSwap(board: number[]): [number, number] {
  for (let i = 0; i < board.length; i++) {
    for (const j of [i + 1, i + BOARD_SIZE]) {
      if (j >= board.length || (j === i + 1 && i % BOARD_SIZE === BOARD_SIZE - 1)) continue;
      const copy = [...board];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      if (findMatches(copy).length) return [i, j];
    }
  }
  throw new Error("test board has no legal swap");
}

describe("authoritative match-3 engine", () => {
  it("creates deterministic boards without free matches and with a legal move", () => {
    const first = createBoard(123456);
    expect(first).toEqual(createBoard(123456));
    expect(first).toHaveLength(BOARD_SIZE * BOARD_SIZE);
    expect(first.every(tile => Number.isInteger(tile) && tile >= 0 && tile < 5)).toBe(true);
    expect(findMatches(first)).toHaveLength(0);
    expect(hasLegalMove(first)).toBe(true);
  });

  it("merges crossing horizontal and vertical runs into one clear group", () => {
    const board = Array(BOARD_SIZE * BOARD_SIZE).fill(0);
    const groups = findMatches(board);
    expect(groups).toHaveLength(1);
    expect(groups[0].cells).toHaveLength(BOARD_SIZE * BOARD_SIZE);
  });

  it("rejects non-adjacent and non-matching swaps without mutating the board", () => {
    const board = createBoard(99);
    const original = [...board];
    expect(resolveMove(board, 0, 8, 3, 0, 1).reason).toBe("not_adjacent");
    expect(resolveMove(board, -1, 1, 3, 0, 1).reason).toBe("invalid_index");
    expect(board).toEqual(original);
    let rejected = false;
    for (let i = 0; i < board.length && !rejected; i++) {
      for (const j of [i + 1, i + BOARD_SIZE]) {
        if (j >= board.length || (j === i + 1 && i % BOARD_SIZE === BOARD_SIZE - 1)) continue;
        const copy = [...board]; [copy[i], copy[j]] = [copy[j], copy[i]];
        if (!findMatches(copy).length) {
          expect(resolveMove(board, i, j, 3, 0, 1).reason).toBe("no_match");
          rejected = true; break;
        }
      }
    }
    expect(rejected).toBe(true);
    expect(board).toEqual(original);
  });

  it("accepts a legal move and returns the same authoritative result for the same seed", () => {
    const board = createBoard(2026);
    const [from, to] = firstLegalSwap(board);
    const first = resolveMove(board, from, to, 3, 0, 777);
    const second = resolveMove(board, from, to, 3, 0, 777);
    expect(first.accepted).toBe(true);
    expect(first).toEqual(second);
    expect(first.board).toHaveLength(BOARD_SIZE * BOARD_SIZE);
    expect(first.board.every(tile => tile >= 0 && tile < 5)).toBe(true);
    expect(first.attacks.length).toBeGreaterThan(0);
    expect(first.chains).toBeGreaterThan(0);
    expect(first.rage).toBeGreaterThanOrEqual(0);
    expect(first.rage).toBeLessThanOrEqual(100);
  });

  it("caps rage at 100 and limits damage kinds to the existing progression rules", () => {
    const board = createBoard(314159);
    const [from, to] = firstLegalSwap(board);
    const result = resolveMove(board, from, to, 1, 99, 44);
    expect(result.accepted).toBe(true);
    expect(result.rage).toBeLessThanOrEqual(100);
    expect(result.attacks.every(attack => ["punch", "rifle", "slam"].includes(attack.kind))).toBe(true);
  });
});
