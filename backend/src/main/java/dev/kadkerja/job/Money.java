package dev.kadkerja.job;

/** Amounts are whole sen (1 RM = 100 sen) so that totals add up exactly. */
public final class Money {
  private Money() {}

  /** Tax on [amountSen] at [ratePercent], rounded half up to the sen. */
  public static long tax(long amountSen, int ratePercent) {
    if (amountSen < 0 || ratePercent < 0) {
      throw new IllegalArgumentException("amount and rate must not be negative");
    }
    return Math.addExact(Math.multiplyExact(amountSen, ratePercent), 50) / 100;
  }

  /** "RM 1,234.50". */
  public static String format(long sen) {
    String sign = sen < 0 ? "-" : "";
    long abs = Math.abs(sen);
    return String.format("%sRM %,d.%02d", sign, abs / 100, abs % 100);
  }
}
