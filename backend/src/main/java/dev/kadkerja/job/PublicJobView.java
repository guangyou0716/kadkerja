package dev.kadkerja.job;

import java.time.Instant;
import java.util.List;

/**
 * What the customer's progress link shows. Deliberately smaller than the staff view: no ids, no
 * customer name or phone, no staff notes, and the quote only once it has been sent.
 */
public record PublicJobView(
    String workshop,
    String number,
    JobStatus status,
    String plate,
    String vehicle,
    String complaint,
    Instant checkedInAt,
    boolean quoteVisible,
    int quoteVersion,
    List<Line> lines,
    long subtotalSen,
    long taxSen,
    long totalSen,
    int sstRatePercent,
    boolean canAnswer,
    List<Step> timeline) {

  public record Line(
      LineKind kind,
      String description,
      int quantity,
      long unitPriceSen,
      boolean taxable,
      long subtotalSen,
      long taxSen) {}

  public record Step(JobStatus status, Instant at, Actor by) {}

  public static PublicJobView of(JobCard j, int rate, String workshop) {
    var v = j.getVehicle();
    boolean quote = j.quoteVisibleToCustomer();
    return new PublicJobView(
        workshop,
        j.number(),
        j.getStatus(),
        v.getPlate(),
        v.getMake() + " " + v.getModel(),
        j.getComplaint(),
        j.getCreatedAt(),
        quote,
        quote ? j.getQuoteVersion() : 0,
        quote
            ? j.getLines().stream()
                .map(
                    l ->
                        new Line(
                            l.getKind(),
                            l.getDescription(),
                            l.getQuantity(),
                            l.getUnitPriceSen(),
                            l.isTaxable(),
                            l.subtotalSen(),
                            l.taxSen(rate)))
                .toList()
            : List.of(),
        quote ? j.subtotalSen() : 0,
        quote ? j.taxSen(rate) : 0,
        quote ? j.totalSen(rate) : 0,
        rate,
        j.getStatus() == JobStatus.QUOTED,
        j.getEvents().stream().map(e -> new Step(e.getTo(), e.getAt(), e.getActor())).toList());
  }
}
