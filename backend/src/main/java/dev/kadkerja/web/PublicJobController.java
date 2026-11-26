package dev.kadkerja.web;

import dev.kadkerja.job.JobCardService;
import dev.kadkerja.job.PublicJobView;
import dev.kadkerja.photo.PhotoService;
import dev.kadkerja.web.Requests.AnswerRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The customer's progress link: no login, the unguessable token is the only key. A token that is
 * not 24 URL-safe characters never reaches the database (the path does not match: 404).
 */
@RestController
@RequestMapping("/api/public/jobs/{token:[A-Za-z0-9_-]{24}}")
public class PublicJobController {
  private final JobCardService service;
  private final PhotoService photos;

  public PublicJobController(JobCardService service, PhotoService photos) {
    this.service = service;
    this.photos = photos;
  }

  @GetMapping
  public PublicJobView get(@PathVariable String token) {
    return service.publicView(token);
  }

  /** A photo of this job, by its random key (24-character token + 16-character key, nothing else). */
  @GetMapping("/photos/{key:[A-Za-z0-9_-]{16}}")
  public ResponseEntity<byte[]> photo(@PathVariable String token, @PathVariable String key) {
    return PhotoController.jpeg(photos.publicImage(token, key), "photo.jpg");
  }

  @PostMapping("/answer")
  public PublicJobView answer(@PathVariable String token, @Valid @RequestBody AnswerRequest r) {
    return service.answer(token, r.decision(), r.quoteVersion(), r.note());
  }
}
