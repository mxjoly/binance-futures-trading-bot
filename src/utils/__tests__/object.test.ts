import { clone, matchObject } from '../object';

describe('Object', () => {
  it('clone', () => {
    let obj = { a: 1, b: 2, c: { d: 4, e: 5 } };
    let cloneObj = clone(obj);
    expect(cloneObj).toMatchObject(obj);
  });

  it('shallowEqual', () => {
    let obj = { a: 1, b: 2, c: { d: 4, e: 5 } };
    let cloneObj = clone(obj);
    expect(matchObject(obj, cloneObj)).toBe(true);
  });
});
