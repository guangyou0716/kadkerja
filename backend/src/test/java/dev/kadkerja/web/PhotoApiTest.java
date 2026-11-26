package dev.kadkerja.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import dev.kadkerja.photo.PhotoService;
import dev.kadkerja.photo.TestImages;
import dev.kadkerja.staff.Role;
import dev.kadkerja.staff.StaffUser;
import dev.kadkerja.staff.StaffUserRepository;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** Before/after photos through the HTTP API, with real sign-ins and made-up images. */
@SpringBootTest
@AutoConfigureMockMvc
class PhotoApiTest {
  private static final String PASSWORD = "correct horse battery";
  private static int address = 1;

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired StaffUserRepository users;
  @Autowired PasswordEncoder encoder;

  private String ip;
  private MockHttpSession advisor;
  private long techId;

  @BeforeEach
  void setUp() throws Exception {
    for (String table :
        new String[] {
          "job_photo", "stock_movement", "status_event", "quote_line", "job_card", "vehicle", "customer", "staff_user"
        }) {
      jdbc.update("delete from " + table);
    }
    users.save(new StaffUser("advisor", "Test Advisor", encoder.encode(PASSWORD), Role.ADVISOR));
    techId = users.save(new StaffUser("tech", "Test Tech", encoder.encode(PASSWORD), Role.TECHNICIAN)).getId();
    users.save(new StaffUser("tech2", "Other Tech", encoder.encode(PASSWORD), Role.TECHNICIAN));
    ip = "10.4.0." + (address++);
    advisor = session("advisor");
  }

  private MockHttpSession session(String user) throws Exception {
    return (MockHttpSession)
        mvc.perform(
                post("/api/auth/login")
                    .with(r -> {
                      r.setRemoteAddr(ip);
                      return r;
                    })
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\"" + user + "\",\"password\":\"" + PASSWORD + "\"}"))
            .andExpect(status().isOk())
            .andReturn()
            .getRequest()
            .getSession(false);
  }

  private long checkIn(String plate) throws Exception {
    String body =
        mvc.perform(
                post("/api/jobs")
                    .session(advisor)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        """
                        {"customerName":"Test Owner","phone":"012-0000009","plate":"%s","make":"Perodua",
                         "model":"Bezza","complaint":"Dent on the door"}
                        """
                            .formatted(plate)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return ((Number) JsonPath.read(body, "$.id")).longValue();
  }

  private ResultActions upload(MockHttpSession s, long job, String stage, byte[] bytes, String caption) throws Exception {
    var req =
        multipart("/api/jobs/" + job + "/photos")
            .file(new MockMultipartFile("file", "photo.jpg", "image/jpeg", bytes))
            .param("stage", stage)
            .session(s)
            .with(csrf());
    if (caption != null) {
      req.param("caption", caption);
    }
    return mvc.perform(req);
  }

  private long uploaded(MockHttpSession s, long job, String stage) throws Exception {
    String body =
        upload(s, job, stage, TestImages.png(320, 240), null)
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return ((Number) JsonPath.read(body, "$.id")).longValue();
  }

  private ResultActions move(long job, String to) throws Exception {
    return mvc.perform(
        post("/api/jobs/" + job + "/moves")
            .session(advisor)
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"to\":\"" + to + "\"}"));
  }

  private void toInProgress(long job) throws Exception {
    mvc.perform(
            post("/api/jobs/" + job + "/lines")
                .session(advisor)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"LABOUR\",\"description\":\"Dent repair\",\"quantity\":1,\"unitPriceSen\":100,\"taxable\":true}"))
        .andExpect(status().isOk());
    for (String to : new String[] {"INSPECTING", "QUOTED", "APPROVED", "IN_PROGRESS"}) {
      move(job, to).andExpect(status().isOk());
    }
  }

  @Test
  void staffAddABeforePhotoAndGetBackTheStoredJpeg() throws Exception {
    long job = checkIn("PHO 1");
    upload(advisor, job, "BEFORE", TestImages.png(2400, 1800), "  Dent, driver's door  ")
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.stage").value("BEFORE"))
        .andExpect(jsonPath("$.width").value(1600))
        .andExpect(jsonPath("$.height").value(1200))
        .andExpect(jsonPath("$.caption").value("Dent, driver's door"))
        .andExpect(jsonPath("$.by").value("Test Advisor"));
    String list =
        mvc.perform(get("/api/jobs/" + job + "/photos").session(advisor))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andReturn()
            .getResponse()
            .getContentAsString();
    long id = ((Number) JsonPath.read(list, "$[0].id")).longValue();
    byte[] image =
        mvc.perform(get("/api/jobs/" + job + "/photos/" + id).session(advisor))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", "image/jpeg"))
            .andExpect(header().string("X-Content-Type-Options", "nosniff"))
            .andExpect(header().string("Content-Security-Policy", "default-src 'none'; sandbox"))
            .andExpect(header().string("Content-Disposition", "inline; filename=\"photo-" + id + ".jpg\""))
            .andReturn()
            .getResponse()
            .getContentAsByteArray();
    assertThat(TestImages.read(image).getWidth()).isEqualTo(1600);
    // Never the photo bytes in the list.
    assertThat(list).doesNotContain("\"data\"");
    mvc.perform(get("/api/jobs/" + job + "/photos/" + id)).andExpect(status().isUnauthorized());
  }

  @Test
  void whatIsNotAPhotoIsRefusedWhateverItsNameAndType() throws Exception {
    long job = checkIn("PHO 2");
    byte[] html = "<svg onload=alert(1)>".getBytes(StandardCharsets.UTF_8);
    upload(advisor, job, "BEFORE", html, null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.file").value("use a JPEG or PNG photo"));
    upload(advisor, job, "BEFORE", new byte[0], null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.file").value("choose a photo"));
    upload(advisor, job, "BEFORE", TestImages.png(10, 10), "x".repeat(201))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.caption").exists());
    upload(advisor, job, "SIDEWAYS", TestImages.png(10, 10), null).andExpect(status().isBadRequest());
    mvc.perform(
            multipart("/api/jobs/" + job + "/photos").param("stage", "BEFORE").session(advisor).with(csrf()))
        .andExpect(status().isBadRequest());
    // Without the CSRF token: refused before anything is read.
    mvc.perform(
            multipart("/api/jobs/" + job + "/photos")
                .file(new MockMultipartFile("file", "p.png", "image/png", TestImages.png(10, 10)))
                .param("stage", "BEFORE")
                .session(advisor))
        .andExpect(status().isForbidden());
    assertThat(jdbc.queryForObject("select count(*) from job_photo", Integer.class)).isZero();
  }

  @Test
  void afterPhotosOnlyOnceTheRepairHasStarted() throws Exception {
    long job = checkIn("PHO 3");
    upload(advisor, job, "AFTER", TestImages.png(10, 10), null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("After photos can be added once the repair has started (now RECEIVED)."));
    toInProgress(job);
    uploaded(advisor, job, "AFTER");
    move(job, "READY").andExpect(status().isOk());
    uploaded(advisor, job, "AFTER");
    uploaded(advisor, job, "BEFORE");
  }

  @Test
  void aFinishedJobsPhotosCannotChange() throws Exception {
    long job = checkIn("PHO 4");
    long photo = uploaded(advisor, job, "BEFORE");
    move(job, "CANCELLED").andExpect(status().isOk());
    upload(advisor, job, "BEFORE", TestImages.png(10, 10), null).andExpect(status().isConflict());
    mvc.perform(delete("/api/jobs/" + job + "/photos/" + photo).session(advisor).with(csrf()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("The photos of a CANCELLED job can no longer be changed."));
    // Still there to look at.
    mvc.perform(get("/api/jobs/" + job + "/photos/" + photo).session(advisor)).andExpect(status().isOk());
  }

  @Test
  void aTechnicianAddsPhotosOnlyToTheirOwnOrAnUnassignedCar() throws Exception {
    long mine = checkIn("PHO 5");
    long theirs = checkIn("PHO 6");
    mvc.perform(
            put("/api/jobs/" + theirs + "/assignee")
                .session(advisor)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"staffId\":" + users.findByUsername("tech2").orElseThrow().getId() + "}"))
        .andExpect(status().isOk());
    long advisorsPhoto = uploaded(advisor, theirs, "BEFORE");
    MockHttpSession tech = session("tech");
    upload(tech, theirs, "BEFORE", TestImages.png(10, 10), null).andExpect(status().isForbidden());
    mvc.perform(delete("/api/jobs/" + theirs + "/photos/" + advisorsPhoto).session(tech).with(csrf()))
        .andExpect(status().isForbidden());
    // Looking is fine.
    mvc.perform(get("/api/jobs/" + theirs + "/photos/" + advisorsPhoto).session(tech)).andExpect(status().isOk());
    upload(tech, mine, "BEFORE", TestImages.png(10, 10), null)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.by").value("Test Tech"));
    assertThat(techId).isPositive();
  }

  @Test
  void atMostTwelvePhotosPerJob() throws Exception {
    long job = checkIn("PHO 7");
    for (int i = 0; i < PhotoService.MAX_PER_JOB; i++) {
      uploaded(advisor, job, "BEFORE");
    }
    upload(advisor, job, "BEFORE", TestImages.png(10, 10), null)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("A job card can have at most 12 photos. Remove one first."));
    long other = checkIn("PHO 8");
    uploaded(advisor, other, "BEFORE");
  }

  @Test
  void aPhotoIsOnlyReachableThroughItsOwnJob() throws Exception {
    long a = checkIn("PHO 9");
    long b = checkIn("PHO 10");
    long photo = uploaded(advisor, a, "BEFORE");
    mvc.perform(get("/api/jobs/" + b + "/photos/" + photo).session(advisor)).andExpect(status().isNotFound());
    mvc.perform(delete("/api/jobs/" + b + "/photos/" + photo).session(advisor).with(csrf()))
        .andExpect(status().isNotFound());
    mvc.perform(delete("/api/jobs/" + a + "/photos/" + photo).session(advisor).with(csrf()))
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/jobs/" + a + "/photos/" + photo).session(advisor)).andExpect(status().isNotFound());
    mvc.perform(get("/api/jobs/" + a + "/photos").session(advisor)).andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void theCustomerSeesThePhotosByKeyOnlyForTheirOwnJob() throws Exception {
    long a = checkIn("PHO 11");
    long b = checkIn("PHO 12");
    upload(advisor, a, "BEFORE", TestImages.png(100, 80), "Worn pads").andExpect(status().isCreated());
    uploaded(advisor, b, "BEFORE");
    String tokenA = jdbc.queryForObject("select public_token from job_card where id = ?", String.class, a);
    String tokenB = jdbc.queryForObject("select public_token from job_card where id = ?", String.class, b);
    String keyB = jdbc.queryForObject("select public_key from job_photo where job_card_id = ?", String.class, b);
    String view =
        mvc.perform(get("/api/public/jobs/" + tokenA))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.photos", hasSize(1)))
            .andExpect(jsonPath("$.photos[0].stage").value("BEFORE"))
            .andExpect(jsonPath("$.photos[0].caption").value("Worn pads"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    // No internal ids, no staff names.
    assertThat(view).doesNotContain("\"id\"").doesNotContain("Test Advisor");
    String keyA = JsonPath.read(view, "$.photos[0].key");
    assertThat(keyA).matches("[A-Za-z0-9_-]{16}");
    mvc.perform(get("/api/public/jobs/" + tokenA + "/photos/" + keyA))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "image/jpeg"))
        .andExpect(header().string("Cache-Control", "no-store"));
    mvc.perform(get("/api/public/jobs/" + tokenA + "/photos/" + keyB)).andExpect(status().isNotFound());
    mvc.perform(get("/api/public/jobs/" + tokenB + "/photos/" + keyB)).andExpect(status().isOk());
    mvc.perform(get("/api/public/jobs/" + tokenA + "/photos/1")).andExpect(status().isNotFound());
    // An encoded path is refused before it reaches any code (the firewall answers 400).
    mvc.perform(get("/api/public/jobs/" + tokenA + "/photos/..%2F..%2Fetc%2Fpasswd"))
        .andExpect(status().is4xxClientError());
    mvc.perform(get("/api/public/jobs/" + tokenA + "/photos/AAAAAAAAAAAAAAAA")).andExpect(status().isNotFound());
  }

  @Test
  void twoUploadsAtTheSameMomentCannotGoOverTheLimit() throws Exception {
    long job = checkIn("PHO 13");
    for (int i = 0; i < PhotoService.MAX_PER_JOB - 1; i++) {
      uploaded(advisor, job, "BEFORE");
    }
    var pool = java.util.concurrent.Executors.newFixedThreadPool(3);
    var start = new java.util.concurrent.CountDownLatch(1);
    var results = new java.util.ArrayList<java.util.concurrent.Future<Integer>>();
    for (int i = 0; i < 3; i++) {
      results.add(
          pool.submit(
              () -> {
                start.await();
                return upload(advisor, job, "BEFORE", TestImages.png(200, 200), null).andReturn().getResponse().getStatus();
              }));
    }
    start.countDown();
    var statuses = new java.util.ArrayList<Integer>();
    for (var r : results) {
      statuses.add(r.get());
    }
    pool.shutdown();
    assertThat(statuses).containsOnly(201, 409);
    assertThat(statuses).containsOnlyOnce(201);
    assertThat(jdbc.queryForObject("select count(*) from job_photo where job_card_id = ?", Integer.class, job))
        .isEqualTo(PhotoService.MAX_PER_JOB);
  }
}
