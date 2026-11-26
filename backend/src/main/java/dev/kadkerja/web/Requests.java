package dev.kadkerja.web;

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
      boolean taxable) {}

  public record MoveRequest(@NotNull JobStatus to, @Size(max = 500) String note) {}
}
