package dev.kadkerja.web;

import dev.kadkerja.job.Decision;
import dev.kadkerja.job.JobStatus;
import dev.kadkerja.job.LineKind;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Request bodies, validated before anything is changed. */
public final class Requests {
  private Requests() {}

  public record CheckInRequest(
      @NotBlank @Size(max = 100) String customerName,
      @NotBlank
          @Pattern(regexp = "^0[0-9]{1,2}-?[0-9]{7,8}$", message = "use a Malaysian phone number like 012-3456789")
          String phone,
      @NotBlank
          @Pattern(regexp = "^[A-Za-z0-9 ]{2,12}$", message = "letters, digits and spaces only (2-12)")
          String plate,
      @NotBlank @Size(max = 40) String make,
      @NotBlank @Size(max = 40) String model,
      @Min(1950) @Max(2100) Integer year,
      @Min(0) @Max(2_000_000) Integer mileageKm,
      @NotBlank @Size(max = 1000) String complaint) {}

  public record LineRequest(
      @NotNull LineKind kind,
      @NotBlank @Size(max = 200) String description,
      @Min(1) @Max(999) int quantity,
      @Min(0) @Max(10_000_000) long unitPriceSen,
      boolean taxable,
      /* The stock part this line takes when approved (part lines only), or null. */
      @Min(1) Long partId) {}

  public record PartRequest(
      @NotBlank
          @Pattern(regexp = "^[A-Za-z0-9][A-Za-z0-9._/-]{0,29}$", message = "1-30 letters, digits, dots, dashes or slashes")
          String sku,
      @NotBlank @Size(max = 200) String name,
      @Min(0) @Max(10_000_000) long unitPriceSen,
      @Min(0) @Max(99_999) int onHand,
      @Min(0) @Max(99_999) int reorderLevel) {}

  public record ReceiveRequest(@Min(1) @Max(9_999) int quantity) {}

  public record CountRequest(@Min(0) @Max(99_999) int onHand) {}

  /** staffId null = nobody. */
  public record AssignRequest(Long staffId) {}

  public record MoveRequest(@NotNull JobStatus to, @Size(max = 500) String note) {}

  public record AnswerRequest(
      @NotNull Decision decision,
      @Min(1) int quoteVersion,
      @Size(max = 300) String note) {}
}
