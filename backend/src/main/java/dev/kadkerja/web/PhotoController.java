package dev.kadkerja.web;

import dev.kadkerja.photo.PhotoInfo;
import dev.kadkerja.photo.PhotoService;
import dev.kadkerja.photo.PhotoStage;
import dev.kadkerja.staff.FieldException;
import dev.kadkerja.staff.StaffUser;
import dev.kadkerja.staff.StaffUserRepository;
import dev.kadkerja.staff.Who;
import java.io.IOException;
import java.util.List;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Before/after photos of a job card (any signed-in staff; a technician only on their own or an unassigned job). */
@RestController
@RequestMapping("/api/jobs/{id}/photos")
public class PhotoController {
  private final PhotoService photos;
  private final StaffUserRepository users;

  public PhotoController(PhotoService photos, StaffUserRepository users) {
    this.photos = photos;
    this.users = users;
  }

  @GetMapping
  public List<PhotoInfo> list(@PathVariable long id) {
    return photos.list(id);
  }

  @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ResponseEntity<PhotoInfo> add(
      @PathVariable long id,
      @RequestParam PhotoStage stage,
      @RequestParam MultipartFile file,
      @RequestParam(required = false) String caption,
      Authentication who)
      throws IOException {
    if (caption != null && caption.length() > 200) {
      throw new FieldException(HttpStatus.BAD_REQUEST, "caption", "size must be between 0 and 200");
    }
    if (file.isEmpty()) {
      throw new FieldException(HttpStatus.BAD_REQUEST, "file", "choose a photo");
    }
    var me = users.findByUsername(who.getName());
    Who w = new Who(me.map(StaffUser::getId).orElse(null), JobCardController.roleOf(who));
    String name = me.map(StaffUser::getDisplayName).orElse(who.getName());
    return ResponseEntity.status(HttpStatus.CREATED).body(photos.add(id, stage, file.getBytes(), caption, w, name));
  }

  @GetMapping("/{photoId}")
  public ResponseEntity<byte[]> image(@PathVariable long id, @PathVariable long photoId) {
    return jpeg(photos.image(id, photoId), "photo-" + photoId + ".jpg");
  }

  @DeleteMapping("/{photoId}")
  public ResponseEntity<Void> remove(@PathVariable long id, @PathVariable long photoId, Authentication who) {
    Who w =
        new Who(
            users.findByUsername(who.getName()).map(StaffUser::getId).orElse(null),
            JobCardController.roleOf(who));
    photos.remove(id, photoId, w);
    return ResponseEntity.noContent().build();
  }

  /**
   * The stored JPEG (always made by the server, never the uploaded bytes). Opened on its own it
   * cannot run anything: no sniffing, and a sandbox policy that allows nothing.
   */
  static ResponseEntity<byte[]> jpeg(byte[] bytes, String filename) {
    return ResponseEntity.ok()
        .contentType(MediaType.IMAGE_JPEG)
        .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + filename + "\"")
        .header("Content-Security-Policy", "default-src 'none'; sandbox")
        .header("X-Content-Type-Options", "nosniff")
        .body(bytes);
  }
}
