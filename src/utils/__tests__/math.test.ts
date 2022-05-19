import {
  average,
  decimalCeil,
  decimalFloor,
  decimalRound,
  normalize,
  random,
} from '../math';

describe('Math', () => {
  it('average', () => {
    let avg = average([1, 2, 3, 4, 5, 6]);
    expect(avg).toBe(3.5);
  });

  it('decimalCeil', () => {
    let n = decimalCeil(10.123, 2);
    expect(n).toBe(10.13);
  });

  it('decimalFloor', () => {
    let n = decimalFloor(10.123, 2);
    expect(n).toBe(10.12);
  });

  it('decimalRound', () => {
    let n = decimalFloor(10.123, 2);
    expect(n).toBe(10.12);
  });

  it('normalize', () => {
    let n = normalize(0, -1, 1, 0, 1);
    expect(n).toBe(0.5);
  });

  it('random with no arguments', () => {
    for (let i = 0; i < 1000; i++) {
      let n = random();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });

  it('random with min and max arguments', () => {
    for (let i = 0; i < 1000; i++) {
      let n = random(0, 1000);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1000);
    }
  });

  it('random with only min argument', () => {
    for (let i = 0; i < 1000; i++) {
      let n = random(10);
      expect(n).toBeGreaterThanOrEqual(10);
      expect(n).toBeLessThanOrEqual(11);
    }
  });

  it('random with only max argument', () => {
    for (let i = 0; i < 1000; i++) {
      let n = random(null, 10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});
