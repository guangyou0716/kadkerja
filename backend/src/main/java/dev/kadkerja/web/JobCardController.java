package dev.kadkerja.web;

import dev.kadkerja.job.JobCardService;
import dev.kadkerja.job.JobCardSummary;
import dev.kadkerja.job.JobCardView;
import dev.kadkerja.job.JobStatus;
import dev.kadkerja.web.Requests.CheckInRequest;
import dev.kadkerja.web.Requests.LineRequest;
import dev.kadkerja.web.Requests.MoveRequest;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/jobs")
public class JobCardController {
  private final JobCardService service;

  public JobCardController(JobCardService service) {
    this.service = service;
  }

  @GetMapping
  public List<JobCardSummary> list(@RequestParam(required = false) JobStatus status) {
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
  public JobCardView addLine(@PathVariable long id, @Valid @RequestBody LineRequest r) {
    return service.addLine(
        id, r.kind(), r.description(), r.quantity(), r.unitPriceSen(), r.taxable());
  }

  @DeleteMapping("/{id}/lines/{lineId}")
  public JobCardView removeLine(@PathVariable long id, @PathVariable long lineId) {
    return service.removeLine(id, lineId);
  }

  @PostMapping("/{id}/moves")
  public JobCardView move(@PathVariable long id, @Valid @RequestBody MoveRequest r) {
    return service.move(id, r.to(), r.note());
  }

  /** A new customer link; the old one stops working. */
  @PostMapping("/{id}/link")
  public JobCardView resetLink(@PathVariable long id) {
    return service.resetLink(id);
  }
}
