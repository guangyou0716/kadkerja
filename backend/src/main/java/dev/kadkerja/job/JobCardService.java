package dev.kadkerja.job;

import dev.kadkerja.staff.Role;
import java.time.Clock;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.access.AccessDeniedException;
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
  private final String workshopName;

  public JobCardService(
      CustomerRepository customers,
      VehicleRepository vehicles,
      JobCardRepository jobs,
      Clock clock,
      @Value("${kadkerja.sst-rate-percent:8}") int sstRatePercent,
      @Value("${kadkerja.workshop-name:Demo Auto Workshop}") String workshopName) {
    this.customers = customers;
    this.vehicles = vehicles;
    this.jobs = jobs;
    this.clock = clock;
    this.sstRatePercent = sstRatePercent;
    this.workshopName = workshopName;
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
    if (digits(owner.getPhone()).equals(digits(in.phone()))) {
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

  /** "012-345 6789" and "0123456789" are the same number. */
  static String digits(String phone) {
    return phone.replaceAll("[^0-9]", "");
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

  /** A move by someone at the front desk (demo data, tests). */
  public JobCardView move(long id, JobStatus to, String note) {
    return move(id, to, note, Role.ADVISOR);
  }

  public JobCardView move(long id, JobStatus to, String note, Role role) {
    JobCard job = find(id);
    if (!role.mayMove(job.getStatus(), to)) {
      throw new AccessDeniedException(
          "A technician cannot move a job from " + job.getStatus() + " to " + to + "; the service advisor does that.");
    }
    job.moveTo(to, note == null || note.isBlank() ? null : note.trim(), clock.instant());
    return view(jobs.saveAndFlush(job));
  }

  public JobCardView resetLink(long id) {
    JobCard job = find(id);
    job.resetPublicToken();
    return view(jobs.saveAndFlush(job));
  }

  /**
   * The job behind a customer link. Unknown tokens and links that have run out look the same
   * (not found), so the answer says nothing about which tokens exist.
   */
  private JobCard byToken(String token) {
    return jobs.findByPublicToken(token)
        .filter(j -> j.linkOpen(clock.instant()))
        .orElseThrow(() -> new NotFoundException("This link is not valid or has expired."));
  }

  @Transactional(readOnly = true)
  public PublicJobView publicView(String token) {
    return PublicJobView.of(byToken(token), sstRatePercent, workshopName);
  }

  public PublicJobView answer(String token, Decision decision, int seenVersion, String note) {
    JobCard job = byToken(token);
    job.answerQuote(
        decision, seenVersion, note == null || note.isBlank() ? null : note.trim(), clock.instant());
    return PublicJobView.of(jobs.saveAndFlush(job), sstRatePercent, workshopName);
  }
}
