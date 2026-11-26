package dev.kadkerja.staff;

import org.springframework.http.HttpStatus;

/** One form field is wrong in a way only the server can tell (a taken username, a wrong current password). */
public class FieldException extends RuntimeException {
  private final String field;
  private final HttpStatus status;

  public FieldException(HttpStatus status, String field, String message) {
    super(message);
    this.status = status;
    this.field = field;
  }

  public String field() {
    return field;
  }

  public HttpStatus status() {
    return status;
  }
}
