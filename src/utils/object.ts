export function clone(obj: any) {
  if (obj === null || typeof obj !== 'object') return obj;
  let props = Object.getOwnPropertyDescriptors(obj);
  for (let prop in props) {
    props[prop].value = clone(props[prop].value);
  }
  return Object.create(Object.getPrototypeOf(obj), props);
}

export function matchObject(object1: any, object2: any) {
  return JSON.stringify(object1) === JSON.stringify(object2);
}
