package dev.kadkerja;

import dev.kadkerja.job.JobCardView;
import dev.kadkerja.job.JobCardService;
import dev.kadkerja.job.JobCardService.CheckIn;
import dev.kadkerja.job.JobStatus;
import dev.kadkerja.job.LineKind;
import dev.kadkerja.staff.Role;
import dev.kadkerja.staff.StaffUser;
import dev.kadkerja.staff.StaffUserRepository;
import dev.kadkerja.staff.Who;
import dev.kadkerja.stock.StockService;
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
  private final StockService stock;

  public DemoData(
      JobCardService service, StaffUserRepository users, PasswordEncoder encoder, StockService stock) {
    this.service = service;
    this.stock = stock;
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
    if (!service.list(null).isEmpty() || !stock.list().isEmpty()) {
      return;
    }
    // A small shelf (made-up part numbers). The ignition coil is taken when job C is approved.
    long pads = stock.create("BP-MYV-F", "Front brake pads (set)", 12_800, 6, 2, "Front desk").id();
    long oil = stock.create("OIL-5W30-4", "Engine oil 5W-30, 4 L", 11_500, 3, 4, "Front desk").id();
    long coil = stock.create("IGN-SAGA", "Ignition coil", 18_000, 1, 1, "Front desk").id();
    stock.create("BAT-NS40ZL", "Battery NS40ZL", 23_000, 4, 1, "Front desk");
    JobCardView a =
        service.checkIn(
            new CheckIn("Aiman Demo", "012-0000001", "PKR 1234", "Perodua", "Myvi", 2019, 84_210,
                "Squeaking brakes at low speed; service due."));
    service.addLine(a.id(), LineKind.LABOUR, "Brake inspection and service", 1, 6_000, true);
    service.addLine(a.id(), LineKind.PART, "Front brake pads (set)", 1, 12_800, true, pads, Who.FRONT_DESK);
    service.addLine(a.id(), LineKind.PART, "Engine oil 5W-30, 4 L", 1, 11_500, true, oil, Who.FRONT_DESK);
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
    service.addLine(c.id(), LineKind.PART, "Ignition coil", 1, 18_000, true, coil, Who.FRONT_DESK);
    service.move(c.id(), JobStatus.INSPECTING, null);
    service.move(c.id(), JobStatus.QUOTED, null);
    service.move(c.id(), JobStatus.APPROVED, "Approved by phone.");
    service.move(c.id(), JobStatus.IN_PROGRESS, null);

    // The demo technician has two cars: one being inspected, one being repaired.
    users.findByUsername("tech")
        .ifPresent(
            tech -> {
              service.assign(b.id(), tech.getId());
              service.assign(c.id(), tech.getId());
            });

    service.checkIn(
        new CheckIn("Siti Demo", "012-0000004", "PJM 77", "Toyota", "Vios", 2018, 98_000,
            "Tyre rotation and alignment."));
  }
}
