// from : https://github.com/CodingTrain/Toy-Neural-Network-JS

class Matrix {
  private rows: number;
  private cols: number;
  private data: number[][];

  constructor(rows: number, cols: number) {
    this.rows = rows;
    this.cols = cols;
    this.data = Array(this.rows)
      .fill(undefined)
      .map(() => Array(this.cols).fill(0));
  }

  copy() {
    let m = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        m.data[i][j] = this.data[i][j];
      }
    }
    return m;
  }

  static fromArray(array: number[]) {
    return new Matrix(array.length, 1).map((e, i) => array[i]);
  }

  static subtract(a: Matrix, b: Matrix) {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      console.log('Columns and Rows of A must match Columns and Rows of B.');
      return;
    }

    // Return a new Matrix a-b
    return new Matrix(a.rows, a.cols).map(
      (_, i, j) => a.data[i][j] - b.data[i][j]
    );
  }

  toArray() {
    let arr = [];
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        arr.push(this.data[i][j]);
      }
    }
    return arr;
  }

  randomize() {
    return this.map((e) => Math.random() * 2 - 1);
  }

  add(n: number | Matrix) {
    if (n instanceof Matrix) {
      if (this.rows !== n.rows || this.cols !== n.cols) {
        console.log('Columns and Rows of A must match Columns and Rows of B.');
        return;
      }
      return this.map((e, i, j) => e + n.data[i][j]);
    } else {
      return this.map((e) => e + n);
    }
  }

  static transpose(matrix: Matrix) {
    return new Matrix(matrix.cols, matrix.rows).map(
      (_, i, j) => matrix.data[j][i]
    );
  }

  static multiply(a: Matrix, b: Matrix) {
    // Matrix product
    if (a.cols !== b.rows) {
      console.log('Columns of A must match rows of B.');
      return;
    }

    return new Matrix(a.rows, b.cols).map((e, i, j) => {
      // Dot product of values in col
      let sum = 0;
      for (let k = 0; k < a.cols; k++) {
        sum += a.data[i][k] * b.data[k][j];
      }
      return sum;
    });
  }

  multiply(n: number | Matrix) {
    if (n instanceof Matrix) {
      if (this.rows !== n.rows || this.cols !== n.cols) {
        console.log('Columns and Rows of A must match Columns and Rows of B.');
        return;
      }

      // hadamard product
      return this.map((e, i, j) => e * n.data[i][j]);
    } else {
      // Scalar product
      return this.map((e) => e * n);
    }
  }

  map(func: (v: number, i: number, j: number) => number) {
    // Apply a function to every element of matrix
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        let val = this.data[i][j];
        this.data[i][j] = func(val, i, j);
      }
    }
    return this;
  }

  static map(
    matrix: Matrix,
    func: (v: number, i: number, j: number) => number
  ) {
    // Apply a function to every element of matrix
    return new Matrix(matrix.rows, matrix.cols).map((e, i, j) =>
      func(matrix.data[i][j], i, j)
    );
  }

  print() {
    console.table(this.data);
    return this;
  }

  serialize() {
    return JSON.stringify(this);
  }

  static deserialize(data: string | Matrix) {
    if (typeof data == 'string') {
      let matrixData = JSON.parse(data);
      let matrix = new Matrix(matrixData.rows, matrixData.cols);
      matrix.data = matrixData.data;
      return matrix;
    } else {
      let matrix = new Matrix(data.rows, data.cols);
      matrix.data = data.data;
      return matrix;
    }
  }
}

export default Matrix;
