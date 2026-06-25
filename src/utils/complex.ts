export class Complex {
  readonly re: number;
  readonly im: number;

  constructor(re: number, im: number) {
    this.re = re;
    this.im = im;
  }

  static fromRect(re: number, im: number): Complex {
    return new Complex(re, im);
  }

  static fromPolar(r: number, thetaRad: number): Complex {
    return new Complex(r * Math.cos(thetaRad), r * Math.sin(thetaRad));
  }

  static zero(): Complex {
    return new Complex(0, 0);
  }

  add(other: Complex): Complex {
    return new Complex(this.re + other.re, this.im + other.im);
  }

  sub(other: Complex): Complex {
    return new Complex(this.re - other.re, this.im - other.im);
  }

  mul(other: Complex): Complex {
    return new Complex(
      this.re * other.re - this.im * other.im,
      this.re * other.im + this.im * other.re
    );
  }

  div(other: Complex): Complex {
    const denom = other.re * other.re + other.im * other.im;
    if (denom === 0) throw new Error("Division by zero in Complex number arithmetic");
    return new Complex(
      (this.re * other.re + this.im * other.im) / denom,
      (this.im * other.re - this.re * other.im) / denom
    );
  }

  conj(): Complex {
    return new Complex(this.re, -this.im);
  }

  mag(): number {
    return Math.sqrt(this.re * this.re + this.im * this.im);
  }

  angleRad(): number {
    return Math.atan2(this.im, this.re);
  }

  angleDeg(): number {
    return (this.angleRad() * 180) / Math.PI;
  }

  toString(decimals = 4): string {
    const sign = this.im >= 0 ? "+" : "-";
    return `${this.re.toFixed(decimals)} ${sign} j${Math.abs(this.im).toFixed(decimals)}`;
  }

  toPolarString(decimals = 4): string {
    return `${this.mag().toFixed(decimals)} ∠ ${this.angleDeg().toFixed(decimals)}°`;
  }
}
