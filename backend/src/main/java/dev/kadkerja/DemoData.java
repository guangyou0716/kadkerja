package dev.kadkerja;

import dev.kadkerja.job.JobCardView;
import dev.kadkerja.job.JobCardService;
import dev.kadkerja.job.JobCardService.CheckIn;
import dev.kadkerja.job.JobStatus;
import dev.kadkerja.job.LineKind;
import dev.kadkerja.staff.Role;
import dev.kadkerja.staff.StaffUser;
import dev.kadkerja.staff.StaffUserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Made-up customers and cars for trying the app (profile "demo"). Names and numbers are fictional. */
@Component
@Profile("demo")
public class DemoData implements CommandLineRunner {
  private static final Logger log = LoggerFactory.getLogger(DemoData.class);
  /** Demo sign-in only; published in the README. Never use the demo profile on a real server. */
  public static final String DEMO_PASSWORD = "demo-kadkerja";

  private final JobCardService service;
  private final StaffUserRepository users;
  private final PasswordEncoder encoder;

  public DemoData(JobCardService service, StaffUserRepository users, PasswordEncoder encoder) {
    this.service = service;
    this.users = users;
    this.encoder = encoder;
  }

  @Override
  public void run(String... args) {
    if (users.count() == 0) {
      users.save(new StaffUser("advisor", "Farah Demo", encoder.encode(DEMO_PASSWORD), Role.ADVISOR));
      users.save(new StaffUser("tech", "Hafiz Demo", encoder.encode(DEMO_PASSWORD), Role.TECHNICIAN));
      log.info("Demo staff: advisor / tech, password {}", DEMO_PASSWORD);
    }
    if (!service.list(null).isEmpty()) {
      return;
    }
    JobCardView a =
        service.checkIn(
            new CheckIn("Aiman Demo", "012-0000001", "PKR 1234", "Perodua", "Myvi", 2019, 84_210,
                "Squeaking brakes at low speed; service due."));
    service.addLine(a.id(), LineKind.LABOUR, "Brake inspection and service", 1, 6_000, true);
    service.addLine(a.id(), LineKind.PART, "Front brake pads (set)", 1, 12_800, true);
    service.addLine(a.id(), LineKind.PART, "Engine oil 5W-30, 4 L", 1, 11_500, true);
    service.move(a.id(), JobStatus.INSPECTING, null);
    JobCardView quoted = service.move(a.id(), JobStatus.QUOTED, "Pads at 2 mm; oil change due.");
    log.info("Demo customer link for {}: http://localhost:5173/t/{}", quoted.number(), quoted.publicToken());

    JobCardView b =
        service.checkIn(
            new CheckIn("Mei Ling Demo", "012-0000002", "PNG 8810", "Honda", "City", 2021, 40_500,
                "Air-con not cold."));
    service.move(b.id(), JobStatus.INSPECTING, null);

    JobCardView c =
        service.checkIn(
            new CheckIn("Kumar Demo", "012-0000003", "BKE 5021", "Proton", "Saga", 2016, 132_900,
                "Engine light on."));
    service.addLine(c.id(), LineKind.LABOUR, "Diagnostic scan", 1, 5_000, true);
    service.addLine(c.id(), LineKind.PART, "Ignition coil", 1, 18_000, true);
    service.move(c.id(), JobStatus.INSPECTING, null);
    service.move(c.id(), JobStatus.QUOTED, null);
    service.move(c.id(), JobStatus.APPROVED, "Approved by phone.");
    service.move(c.id(), JobStatus.IN_PROGRESS, null);

    service.checkIn(
        new CheckIn("Siti Demo", "012-0000004", "PJM 77", "Toyota", "Vios", 2018, 98_000,
            "Tyre rotation and alignment."));
  }
}
