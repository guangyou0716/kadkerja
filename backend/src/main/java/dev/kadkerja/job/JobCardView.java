package dev.kadkerja.job;

import java.time.Instant;
import java.util.List;
import java.util.Set;

/** What the API returns for a job card (staff view). */
public record JobCardView(
    long id,
    String number,
    JobStatus status,
    Set<JobStatus> next,
    String complaint,
    Integer mileageKm,
    Instant createdAt,
    VehicleView vehicle,
    CustomerView customer,
    int quoteVersion,
    List<LineView> lines,
    long subtotalSen,
    long taxSen,
    long totalSen,
    int sstRatePercent,
    String publicToken,
    List<EventView> events,
    JobCardSummary.Assignee assignedTo) {

  public record VehicleView(long id, String plate, String make, String model, Integer year) {}

  public record CustomerView(long id, String name, String phone) {}

  public record LineView(
      long id,
      LineKind kind,
      String description,
      int quantity,
      long unitPriceSen,
      boolean taxable,
      long subtotalSen,
      long taxSen) {}

  public record EventView(JobStatus from, JobStatus to, Instant at, String note, Actor by) {}

  public static JobCardView of(JobCard j, int rate) {
    var v = j.getVehicle();
    var c = j.getCustomer();
    return new JobCardView(
        j.getId(),
        j.number(),
        j.getStatus(),
        j.getStatus().next(),
        j.getComplaint(),
        j.getMileageKm(),
        j.getCreatedAt(),
        new VehicleView(v.getId(), v.getPlate(), v.getMake(), v.getModel(), v.getYear()),
        new CustomerView(c.getId(), c.getName(), c.getPhone()),
        j.getQuoteVersion(),
        j.getLines().stream().map(l -> line(l, rate)).toList(),
        j.subtotalSen(),
        j.taxSen(rate),
        j.totalSen(rate),
        rate,
        j.getPublicToken(),
        j.getEvents().stream().map(JobCardView::event).toList(),
        JobCardSummary.Assignee.of(j.getAssignedTo()));
  }

  private static LineView line(QuoteLine l, int rate) {
    return new LineView(
        l.getId(),
        l.getKind(),
        l.getDescription(),
        l.getQuantity(),
        l.getUnitPriceSen(),
        l.isTaxable(),
        l.subtotalSen(),
        l.taxSen(rate));
  }

  private static EventView event(StatusEvent e) {
    return new EventView(e.getFrom(), e.getTo(), e.getAt(), e.getNote(), e.getActor());
  }
}
