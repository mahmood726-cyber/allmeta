/**
 * Dose Response Pro v19.0 - Matrix Operations Module
 *
 * High-performance matrix operations for statistical analysis
 *
 * @module Matrix
 * @author M25 Evidence Synthesis Lab
 * @version 19.0.0
 */

/**
 * Matrix Class
 */
export class Matrix {
  /**
   * Create a new matrix
   *
   * @param {number|Array|Array<Array>} rows - Number of rows, or 2D array
   * @param {number} cols - Number of columns (if first arg is number)
   */
  constructor(rows, cols = null) {
    if (typeof rows === 'number') {
      this.rows = rows;
      this.cols = cols;
      this.data = Array.from({ length: rows * cols }, () => 0);
    } else if (Array.isArray(rows)) {
      if (Array.isArray(rows[0])) {
        // 2D array
        this.rows = rows.length;
        this.cols = rows[0].length;
        this.data = rows.flat();
      } else {
        // 1D array - create column vector
        this.rows = rows.length;
        this.cols = 1;
        this.data = [...rows];
      }
    } else {
      throw new Error('Invalid matrix constructor arguments');
    }
  }

  /**
   * Create matrix from 2D array
   */
  static fromArray(arr) {
    return new Matrix(arr);
  }

  /**
   * Create zero matrix
   */
  static zeros(rows, cols) {
    return new Matrix(rows, cols);
  }

  /**
   * Create identity matrix
   */
  static identity(n) {
    const result = new Matrix(n, n);
    for (let i = 0; i < n; i++) {
      result.set(i, i, 1);
    }
    return result;
  }

  /**
   * Create diagonal matrix
   */
  static diag(values) {
    const n = values.length;
    const result = new Matrix(n, n);
    for (let i = 0; i < n; i++) {
      result.set(i, i, values[i]);
    }
    return result;
  }

  /**
   * Get element at position
   */
  get(row, col) {
    return this.data[row * this.cols + col];
  }

  /**
   * Set element at position
   */
  set(row, col, value) {
    this.data[row * this.cols + col] = value;
  }

  /**
   * Get row as array
   */
  row(row) {
    return this.data.slice(row * this.cols, (row + 1) * this.cols);
  }

  /**
   * Get column as array
   */
  col(col) {
    const result = [];
    for (let i = 0; i < this.rows; i++) {
      result.push(this.get(i, col));
    }
    return result;
  }

  /**
   * Matrix addition
   */
  add(other) {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match');
    }

    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      result.data[i] = this.data[i] + other.data[i];
    }
    return result;
  }

  /**
   * Matrix subtraction
   */
  subtract(other) {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error('Matrix dimensions must match');
    }

    const result = new Matrix(this.rows, this.cols);
    for (let i = 0; i < this.data.length; i++) {
      result.data[i] = this.data[i] - other.data[i];
    }
    return result;
  }

  /**
   * Matrix multiplication
   */
  multiply(other) {
    // Matrix x Matrix
    if (other instanceof Matrix) {
      if (this.cols !== other.rows) {
        throw new Error('Inner dimensions must match');
      }

      const result = new Matrix(this.rows, other.cols);

      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < other.cols; j++) {
          let sum = 0;
          for (let k = 0; k < this.cols; k++) {
            sum += this.get(i, k) * other.get(k, j);
          }
          result.set(i, j, sum);
        }
      }

      return result;
    }

    // Matrix x scalar
    if (typeof other === 'number') {
      const result = new Matrix(this.rows, this.cols);
      for (let i = 0; i < this.data.length; i++) {
        result.data[i] = this.data[i] * other;
      }
      return result;
    }

    throw new Error('Invalid multiplication operand');
  }

  /**
   * Matrix transpose
   */
  transpose() {
    const result = new Matrix(this.cols, this.rows);

    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        result.set(j, i, this.get(i, j));
      }
    }

    return result;
  }

  /**
   * Matrix inversion (Gaussian elimination with partial pivoting)
   */
  static inv(A) {
    const n = A.rows;
    if (A.rows !== A.cols) {
      throw new Error('Matrix must be square');
    }

    // Create augmented matrix [A|I]
    const augmented = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < n; j++) {
        row.push(A.get(i, j));
      }
      for (let j = 0; j < n; j++) {
        row.push(i === j ? 1 : 0);
      }
      augmented.push(row);
    }

    // Gaussian elimination with partial pivoting
    for (let col = 0; col < n; col++) {
      // Find pivot
      let maxRow = col;
      let maxVal = Math.abs(augmented[col][col]);
      for (let row = col + 1; row < n; row++) {
        const val = Math.abs(augmented[row][col]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = row;
        }
      }

      // Swap rows if needed
      if (maxRow !== col) {
        [augmented[col], augmented[maxRow]] = [augmented[maxRow], augmented[col]];
      }

      // Check for singular matrix
      if (Math.abs(augmented[col][col]) < 1e-10) {
        throw new Error('Matrix is singular');
      }

      // Eliminate column
      for (let row = 0; row < n; row++) {
        if (row !== col) {
          const factor = augmented[row][col] / augmented[col][col];
          for (let i = col; i < 2 * n; i++) {
            augmented[row][i] -= factor * augmented[col][i];
          }
        }
      }
    }

    // Normalize pivot rows
    for (let row = 0; row < n; row++) {
      const pivot = augmented[row][row];
      for (let col = 0; col < 2 * n; col++) {
        augmented[row][col] /= pivot;
      }
    }

    // Extract inverse
    const result = new Matrix(n, n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        result.set(i, j, augmented[i][n + j]);
      }
    }

    return result;
  }

  /**
   * Get diagonal elements
   */
  diag() {
    const n = Math.min(this.rows, this.cols);
    return Array.from({ length: n }, (_, i) => this.get(i, i));
  }

  /**
   * Sum of row
   */
  static rowSum(matrix, row) {
    return matrix.row(row).reduce((a, b) => a + b, 0);
  }

  /**
   * Sum of column
   */
  static colSum(matrix, col) {
    return matrix.col(col).reduce((a, b) => a + b, 0);
  }

  /**
   * Matrix norm (Frobenius)
   */
  norm() {
    return Math.sqrt(this.data.reduce((sum, val) => sum + val * val, 0));
  }

  /**
   * Convert to array
   */
  toArray() {
    const result = [];
    for (let i = 0; i < this.rows; i++) {
      result.push(this.row(i));
    }
    return result;
  }

  /**
   * Get matrix dimensions
   */
  size() {
    return [this.rows, this.cols];
  }

  /**
   * Clone matrix
   */
  clone() {
    const result = new Matrix(this.rows, this.cols);
    result.data = [...this.data];
    return result;
  }

  /**
   * Matrix trace (sum of diagonal)
   */
  trace() {
    return this.diag().reduce((a, b) => a + b, 0);
  }

  /**
   * Element-wise square root
   */
  static sqrt(matrix) {
    const result = new Matrix(matrix.rows, matrix.cols);
    for (let i = 0; i < matrix.data.length; i++) {
      result.data[i] = Math.sqrt(matrix.data[i]);
    }
    return result;
  }

  /**
   * Column vector from array
   */
  static columnVector(arr) {
    return new Matrix(arr);
  }
}

export default Matrix;
