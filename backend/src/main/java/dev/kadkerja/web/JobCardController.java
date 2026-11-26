package dev.kadkerja.web;

import dev.kadkerja.job.JobCardService;
import dev.kadkerja.job.JobCardSummary;
import dev.kadkerja.job.JobCardView;
import dev.kadkerja.job.JobStatus;
import dev.kadkerja.staff.Role;
import dev.kadkerja.staff.StaffUser;
import dev.kadkerja.staff.StaffUserRepository;
import dev.kadkerja.staff.Who;
import dev.kadkerja.web.Requests.AssignRequest;
import dev.kadkerja.web.Requests.CheckInRequest;
import dev.kadkerja.web.Requests.LineRequest;
import dev.kadkerja.web.Requests.MoveRequest;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jobs")
public class JobCardController {
  private final JobCardService service;
  private final StaffUserRepository users;

  public JobCardController(JobCardService service, StaffUserRepository users) {
    this.service = service;
    this.users = users;
  }

  /** All job cards (optionally one status), or with mine=true the ones assigned to me. */
  @GetMapping
  public List<JobCardSummary> list(
      @RequestParam(required = false) JobStatus status,
      @RequestParam(defaultValue = "false") boolean mine,
      Authentication who) {
    if (mine) {
      Long id = who(who).id();
      return id == null ? List.of() : service.assignedTo(id);
    }
    return service.list(status);
  }

  @PostMapping
  public ResponseEntity<JobCardView> checkIn(@Valid @RequestBody CheckInRequest r) {
    JobCardView job =
        service.checkIn(
            new JobCardService.CheckIn(
                r.customerName().trim(),
                r.phone(),
                r.plate(),
                r.make().trim(),
                r.model().trim(),
                r.year(),
                r.mileageKm(),
                r.complaint().trim()));
    return ResponseEntity.created(URI.create("/api/jobs/" + job.id())).body(job);
  }

  @GetMapping("/{id}")
  public JobCardView get(@PathVariable long id) {
    return service.get(id);
  }

  @PostMapping("/{id}/lines")
  public JobCardView addLine(
      @PathVariable long id, @Valid @RequestBody LineRequest r, Authentication who) {
    return service.addLine(
        id,
        r.kind(),
        r.description(),
        r.quantity(),
        r.unitPriceSen(),
        r.taxable(),
        r.partId(),
        who(who));
  }

  @DeleteMapping("/{id}/lines/{lineId}")
  public JobCardView removeLine(
      @PathVariable long id, @PathVariable long lineId, Authentication who) {
    return service.removeLine(id, lineId, who(who));
  }

  @PostMapping("/{id}/moves")
  public JobCardView move(
      @PathVariable long id, @Valid @RequestBody MoveRequest r, Authentication who) {
    return service.move(id, r.to(), r.note(), who(who));
  }

  /** Advisor only (see SecurityConfig): give the job to a technician, or to nobody (null). */
  @PutMapping("/{id}/assignee")
  public JobCardView assign(@PathVariable long id, @RequestBody AssignRequest r) {
    return service.assign(id, r.staffId());
  }

  /** The role comes from the session; the staff id from the database (null for test users). */
  private Who who(Authentication a) {
    return new Who(users.findByUsername(a.getName()).map(StaffUser::getId).orElse(null), roleOf(a));
  }

  static Role roleOf(Authentication who) {
    return who.getAuthorities().stream()
            .anyMatch(a -> ("ROLE_" + Role.ADVISOR.name()).equals(a.getAuthority()))
        ? Role.ADVISOR
        : Role.TECHNICIAN;
  }

  /** A new customer link; the old one stops working. */
  @PostMapping("/{id}/link")
  public JobCardView resetLink(@PathVariable long id) {
    return service.resetLink(id);
  }
}
