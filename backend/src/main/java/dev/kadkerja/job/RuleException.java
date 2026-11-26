package dev.kadkerja.job;

/** A request the workshop rules do not allow (shown to the user as is). */
public class RuleException extends RuntimeException {
  public RuleException(String message) {
    super(message);
  }
}
