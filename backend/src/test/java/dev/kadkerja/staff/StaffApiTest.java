package dev.kadkerja.staff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import dev.kadkerja.job.RuleException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Staff management and session ending, with real sign-ins (no mock users). */
@SpringBootTest
@AutoConfigureMockMvc
class StaffApiTest {
  private static final String PASSWORD = "correct horse battery";
  private static final String NEW_PASSWORD = "a brand new passphrase";
  private static int address = 1;

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired StaffUserRepository users;
  @Autowired PasswordEncoder encoder;
  @Autowired StaffService service;

  private long advisorId;
  private long techId;
  private String ip;

  @BeforeEach
  void setUp() {
    for (String table :
        new String[] {"status_event", "quote_line", "job_card", "vehicle", "customer", "staff_user"}) {
      jdbc.update("delete from " + table);
    }
    advisorId = users.save(new StaffUser("advisor", "Test Advisor", encoder.encode(PASSWORD), Role.ADVISOR)).getId();
    techId = users.save(new StaffUser("tech", "Test Tech", encoder.encode(PASSWORD), Role.TECHNICIAN)).getId();
    ip = "10.3.0." + (address++);
  }

  private MockHttpServletRequestBuilder from(MockHttpServletRequestBuilder b) {
    return b.with(r -> {
      r.setRemoteAddr(ip);
      return r;
    });
  }

  private ResultActions login(String user, String password) throws Exception {
    return mvc.perform(
        from(post("/api/auth/login"))
            .with(csrf())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"username\":\"" + user + "\",\"password\":\"" + password + "\"}"));
  }

  private MockHttpSession session(String user, String password) throws Exception {
    return (MockHttpSession)
        login(user, password).andExpect(status().isOk()).andReturn().getRequest().getSession(false);
  }

  private MockHttpSession session(String user) throws Exception {
    return session(user, PASSWORD);
  }

  private ResultActions send(MockHttpServletRequestBuilder b, MockHttpSession s, String body) throws Exception {
    return mvc.perform(from(b).session(s).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body));
  }

  private ResultActions create(MockHttpSession s, String username, String role, String password) throws Exception {
    return send(
        post("/api/staff"),
        s,
        "{\"username\":\"%s\",\"name\":\"New Person\",\"role\":\"%s\",\"password\":\"%s\"}"
            .formatted(username, role, password));
  }

  @Test
  void theAdvisorAddsATechnicianWhoCanThenSignIn() throws Exception {
    MockHttpSession advisor = session("advisor");
    create(advisor, " Tech.Two ", "TECHNICIAN", NEW_PASSWORD)
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.username").value("tech.two"))
        .andExpect(jsonPath("$.role").value("TECHNICIAN"))
        .andExpect(jsonPath("$.active").value(true));
    mvc.perform(get("/api/staff").session(advisor)).andExpect(jsonPath("$", hasSize(3)));
    login("tech.two", NEW_PASSWORD).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("New Person"));
    assertThat(users.findByUsername("tech.two").orElseThrow().getPasswordHash()).startsWith("{bcrypt}");
  }

  @Test
  void newAccountsAreChecked() throws Exception {
    MockHttpSession advisor = session("advisor");
    create(advisor, "TECH", "TECHNICIAN", NEW_PASSWORD)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.fields.username").value("this username is taken"));
    create(advisor, "new1", "TECHNICIAN", "too short")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.password").value("use at least 12 characters"));
    // 30 characters but 90 bytes: bcrypt would silently ignore everything after byte 72.
    create(advisor, "new2", "TECHNICIAN", "密".repeat(30))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.password").value("use at most 72 bytes (about 72 letters)"));
    create(advisor, "no spaces", "TECHNICIAN", NEW_PASSWORD)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.username").exists());
    create(advisor, "new3", "OWNER", NEW_PASSWORD).andExpect(status().isBadRequest());
    create(session("tech"), "new4", "ADVISOR", NEW_PASSWORD).andExpect(status().isForbidden());
    assertThat(users.count()).isEqualTo(2);
  }

  @Test
  void deactivatingEndsTheirSessionHandsBackOpenJobsAndReactivatingLetsThemIn() throws Exception {
    MockHttpSession advisor = session("advisor");
    MockHttpSession tech = session("tech");
    long open = checkIn(advisor, "STF 1");
    long done = checkIn(advisor, "STF 2");
    for (long job : new long[] {open, done}) {
      send(put("/api/jobs/" + job + "/assignee"), advisor, "{\"staffId\":" + techId + "}").andExpect(status().isOk());
    }
    send(post("/api/jobs/" + done + "/moves"), advisor, "{\"to\":\"CANCELLED\"}").andExpect(status().isOk());

    send(post("/api/staff/" + techId + "/deactivate"), advisor, "")
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.active").value(false));
    mvc.perform(get("/api/jobs").session(tech)).andExpect(status().isUnauthorized());
    login("tech", PASSWORD).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.detail").value("Wrong username or password."));
    mvc.perform(get("/api/jobs/" + open).session(advisor)).andExpect(jsonPath("$.assignedTo").value(nullValue()));
    mvc.perform(get("/api/jobs/" + done).session(advisor)).andExpect(jsonPath("$.assignedTo.name").value("Test Tech"));
    // The customer link still works in a browser whose staff session has ended.
    String token = JsonPath.read(mvc.perform(get("/api/jobs/" + open).session(advisor)).andReturn().getResponse().getContentAsString(), "$.publicToken");
    mvc.perform(get("/api/public/jobs/" + token).session(tech)).andExpect(status().isOk());

    send(post("/api/staff/" + techId + "/activate"), advisor, "").andExpect(jsonPath("$.active").value(true));
    session("tech");
    // Deactivating twice is harmless.
    send(post("/api/staff/" + techId + "/deactivate"), advisor, "").andExpect(status().isOk());
    send(post("/api/staff/" + techId + "/deactivate"), advisor, "").andExpect(status().isOk());
  }

  @Test
  void nobodyDeactivatesThemselvesOrTheLastAdvisor() throws Exception {
    MockHttpSession advisor = session("advisor");
    send(post("/api/staff/" + advisorId + "/deactivate"), advisor, "")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("You cannot deactivate your own account."));
    send(post("/api/staff/999999/deactivate"), advisor, "").andExpect(status().isNotFound());
    send(post("/api/staff/" + advisorId + "/deactivate"), session("tech"), "").andExpect(status().isForbidden());
    // Through the API the caller is always an active advisor; the rule still holds on its own
    // (it is what stops two advisors deactivating each other at the same moment).
    assertThatThrownBy(() -> service.deactivate("someone-else", advisorId))
        .isInstanceOf(RuleException.class)
        .hasMessage("Keep at least one active service advisor.");
    long second =
        users.save(new StaffUser("advisor2", "Second Advisor", encoder.encode(PASSWORD), Role.ADVISOR)).getId();
    send(post("/api/staff/" + second + "/deactivate"), advisor, "").andExpect(status().isOk());
    mvc.perform(get("/api/auth/me").session(advisor)).andExpect(status().isOk());
  }

  @Test
  void aNewPasswordFromTheAdvisorEndsTheOldSessions() throws Exception {
    MockHttpSession advisor = session("advisor");
    MockHttpSession tech = session("tech");
    send(post("/api/staff/" + techId + "/password"), advisor, "{\"password\":\"" + NEW_PASSWORD + "\"}")
        .andExpect(status().isOk());
    mvc.perform(get("/api/jobs").session(tech)).andExpect(status().isUnauthorized());
    login("tech", PASSWORD).andExpect(status().isUnauthorized());
    session("tech", NEW_PASSWORD);
    send(post("/api/staff/" + advisorId + "/password"), advisor, "{\"password\":\"" + NEW_PASSWORD + "\"}")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("Use \"Change my password\" for your own account."));
    send(post("/api/staff/" + techId + "/password"), advisor, "{\"password\":\"short\"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.password").value("use at least 12 characters"));
  }

  @Test
  void changingMyOwnPasswordKeepsThisSessionAndEndsTheOthers() throws Exception {
    MockHttpSession here = session("tech");
    MockHttpSession elsewhere = session("tech");
    String wrong = "{\"currentPassword\":\"not it at all\",\"newPassword\":\"" + NEW_PASSWORD + "\"}";
    send(post("/api/auth/password"), here, wrong)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.currentPassword").value("this is not your current password"));
    send(post("/api/auth/password"), here, "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"" + PASSWORD + "\"}")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.fields.newPassword").value("choose a password different from the current one"));
    send(post("/api/auth/password"), here, "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"" + NEW_PASSWORD + "\"}")
        .andExpect(status().isNoContent());
    mvc.perform(get("/api/auth/me").session(here)).andExpect(status().isOk());
    mvc.perform(get("/api/auth/me").session(elsewhere)).andExpect(status().isUnauthorized());
    login("tech", PASSWORD).andExpect(status().isUnauthorized());
    session("tech", NEW_PASSWORD);
    mvc.perform(post("/api/auth/password").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(wrong))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void guessingTheCurrentPasswordIsLimitedLikeSignIn() throws Exception {
    MockHttpSession here = session("tech");
    String wrong = "{\"currentPassword\":\"guess guess guess\",\"newPassword\":\"" + NEW_PASSWORD + "\"}";
    for (int i = 0; i < LoginThrottle.PER_USER; i++) {
      send(post("/api/auth/password"), here, wrong).andExpect(status().isBadRequest());
    }
    send(post("/api/auth/password"), here, "{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"" + NEW_PASSWORD + "\"}")
        .andExpect(status().isTooManyRequests());
  }

  private long checkIn(MockHttpSession advisor, String plate) throws Exception {
    String body =
        send(
                post("/api/jobs"),
                advisor,
                """
                {"customerName":"Test Owner","phone":"012-0000009","plate":"%s","make":"Perodua",
                 "model":"Bezza","complaint":"Brakes squeak"}
                """
                    .formatted(plate))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return ((Number) JsonPath.read(body, "$.id")).longValue();
  }
}
