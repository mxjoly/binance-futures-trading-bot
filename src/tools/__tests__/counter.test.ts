import { Counter } from '../counter';

describe('Counter', () => {
  let counter: Counter;

  beforeEach(() => {
    counter = new Counter();
  });

  it('initialized with the value 0 without argument', () => {
    expect(counter.getValue()).toBe(0);
  });

  it('initialized with the value passed as argument', () => {
    counter = new Counter(5);
    expect(counter.getValue()).toBe(5);
  });

  it('increment', () => {
    counter.increment();
    expect(counter.getValue()).toBe(1);
  });

  it('decrement', () => {
    counter.decrement();
    expect(counter.getValue()).toBe(-1);
  });

  it('reset', () => {
    counter.increment();
    counter.reset();
    expect(counter.getValue()).toBe(0);
  });
});
