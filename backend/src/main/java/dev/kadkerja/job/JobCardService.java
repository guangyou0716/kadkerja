package dev.kadkerja.job;

import java.time.Clock;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class JobCardService {
  private final CustomerRepository customers;
  private final VehicleRepository vehicles;
  private final JobCardRepository jobs;
  private final Clock clock;
  private final int sstRatePercent;

  public JobCardService(
      CustomerRepository customers,
      VehicleRepository vehicles,
      JobCardRepository jobs,
      Clock clock,
      @Value("${kadkerja.sst-rate-percent:8}") int sstRatePercent) {
    this.customers = customers;
    this.vehicles = vehicles;
    this.jobs = jobs;
    this.clock = clock;
    this.sstRatePercent = sstRatePercent;
  }

  public int sstRatePercent() {
    return sstRatePercent;
  }

  public record CheckIn(
      String customerName,
      String phone,
      String plate,
      String make,
      String model,
      Integer year,
      Integer mileageKm,
      String complaint) {}

  /**
   * A car arrives. A plate seen before reuses that vehicle (and updates its owner's details if
   * the same person; a different name and phone = the car has a new owner).
   */
  public JobCardView checkIn(CheckIn in) {
    String plate = Vehicle.normalizePlate(in.plate());
    Vehicle vehicle =
        vehicles
            .findByPlate(plate)
            .map(v -> reuse(v, in))
            .orElseGet(
                () -> {
                  Customer owner = customers.save(new Customer(in.customerName(), in.phone()));
                  return vehicles.save(
                      new Vehicle(plate, in.make(), in.model(), in.year(), owner));
                });
    if (vehicle.getId() != null
        && jobs.existsByVehicleIdAndStatusNotIn(
            vehicle.getId(), List.of(JobStatus.COLLECTED, JobStatus.CANCELLED))) {
      throw new RuleException(
          vehicle.getPlate() + " already has an open job card; finish or cancel it first.");
    }
    return view(jobs.save(new JobCard(vehicle, in.complaint(), in.mileageKm(), clock.instant())));
  }

  private Vehicle reuse(Vehicle v, CheckIn in) {
    Customer owner = v.getOwner();
    if (owner.getPhone().equals(in.phone())) {
      owner.update(in.customerName(), in.phone());
    } else {
      v.changeOwner(customers.save(new Customer(in.customerName(), in.phone())));
    }
    return v;
  }

  // Views are built inside the transaction (no open session in the view layer).
  private JobCardView view(JobCard job) {
    return JobCardView.of(job, sstRatePercent);
  }

  @Transactional(readOnly = true)
  public List<JobCardSummary> list(JobStatus status) {
    var found =
        status == null ? jobs.findAllByOrderByIdDesc() : jobs.findByStatusOrderByIdDesc(status);
    return found.stream().map(JobCardSummary::of).toList();
  }

  private JobCard find(long id) {
    return jobs.findById(id)
        .orElseThrow(() -> new NotFoundException("There is no job card " + id + "."));
  }

  @Transactional(readOnly = true)
  public JobCardView get(long id) {
    return view(find(id));
  }

  public JobCardView addLine(
      long id, LineKind kind, String description, int quantity, long unitPriceSen, boolean taxable) {
    JobCard job = find(id);
    job.addLine(kind, description.trim(), quantity, unitPriceSen, taxable);
    return view(jobs.saveAndFlush(job));
  }

  public JobCardView removeLine(long id, long lineId) {
    JobCard job = find(id);
    job.removeLine(lineId);
    return view(jobs.saveAndFlush(job));
  }

  public JobCardView move(long id, JobStatus to, String note) {
    JobCard job = find(id);
    job.moveTo(to, note == null || note.isBlank() ? null : note.trim(), clock.instant());
    return view(jobs.saveAndFlush(job));
  }
}
