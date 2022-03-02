export class Counter {
  private value: number;
  private initialValue: number;

  constructor(initialValue: number) {
    this.value = initialValue;
    this.initialValue = initialValue;
  }

  public increment() {
    this.value++;
  }

  public decrement() {
    this.value--;
  }

  public reset() {
    this.value = this.initialValue;
  }

  public getValue() {
    return this.value;
  }
}
