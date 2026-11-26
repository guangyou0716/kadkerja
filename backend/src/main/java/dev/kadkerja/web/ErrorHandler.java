package dev.kadkerja.web;

import dev.kadkerja.job.NotFoundException;
import dev.kadkerja.job.RuleException;
import dev.kadkerja.staff.FieldException;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Errors as RFC 9457 problem+json with a message a person can act on. */
@RestControllerAdvice
public class ErrorHandler extends ResponseEntityExceptionHandler {
  @ExceptionHandler(RuleException.class)
  ProblemDetail rule(RuleException e) {
    return problem(HttpStatus.CONFLICT, "Not allowed", e.getMessage());
  }

  /** A role check in a controller (the URL rules in SecurityConfig answer 403 themselves). */
  @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
  ProblemDetail denied(org.springframework.security.access.AccessDeniedException e) {
    return problem(HttpStatus.FORBIDDEN, "Not allowed", e.getMessage());
  }

  /** A field only the server can check: shown next to that field, like a validation error. */
  @ExceptionHandler(FieldException.class)
  ResponseEntity<ProblemDetail> field(FieldException e) {
    ProblemDetail p = problem(e.status(), "Check the form", "Some fields need fixing.");
    p.setProperty("fields", Map.of(e.field(), e.getMessage()));
    return ResponseEntity.status(e.status()).body(p);
  }

  @ExceptionHandler(NotFoundException.class)
  ProblemDetail notFound(NotFoundException e) {
    return problem(HttpStatus.NOT_FOUND, "Not found", e.getMessage());
  }

  /** Two changes at the same moment (a version check or a unique plate written twice). */
  @ExceptionHandler({
    ObjectOptimisticLockingFailureException.class,
    DataIntegrityViolationException.class
  })
  ProblemDetail stale(RuntimeException e) {
    return problem(
        HttpStatus.CONFLICT,
        "Changed by someone else",
        "This job card was changed at the same time by someone else. Reload and try again.");
  }

  @Override
  protected ResponseEntity<Object> handleMethodArgumentNotValid(
      MethodArgumentNotValidException e,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    Map<String, String> fields = new TreeMap<>();
    e.getBindingResult()
        .getFieldErrors()
        .forEach(f -> fields.putIfAbsent(f.getField(), f.getDefaultMessage()));
    ProblemDetail p =
        problem(HttpStatus.BAD_REQUEST, "Check the form", "Some fields need fixing.");
    p.setProperty("fields", fields);
    return ResponseEntity.badRequest().body(p);
  }

  private static ProblemDetail problem(HttpStatus status, String title, String detail) {
    ProblemDetail p = ProblemDetail.forStatusAndDetail(status, detail);
    p.setTitle(title);
    return p;
  }
}
