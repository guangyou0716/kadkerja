package dev.kadkerja.staff;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import jakarta.servlet.http.Cookie;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Real sign-in through the HTTP API: sessions, CSRF, roles and the guessing limit. No mock users. */
@SpringBootTest
@AutoConfigureMockMvc
class AuthApiTest {
  private static final String PASSWORD = "correct horse battery";
  private static int address = 1;

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired StaffUserRepository users;
  @Autowired PasswordEncoder encoder;
  /** Each test signs in from its own address so the guessing limit of one test does not leak into another. */
  private String ip;

  @BeforeEach
  void setUp() {
    for (String table :
        new String[] {"status_event", "quote_line", "job_card", "vehicle", "customer", "staff_user"}) {
      jdbc.update("delete from " + table);
    }
    users.save(new StaffUser("advisor", "Test Advisor", encoder.encode(PASSWORD), Role.ADVISOR));
    users.save(new StaffUser("tech", "Test Tech", encoder.encode(PASSWORD), Role.TECHNICIAN));
    StaffUser gone = new StaffUser("gone", "Left the job", encoder.encode(PASSWORD), Role.ADVISOR);
    gone.deactivate();
    users.save(gone);
    ip = "10.1.0." + (address++);
  }

  private MockHttpServletRequestBuilder from(MockHttpServletRequestBuilder b) {
    return b.with(r -> {
      r.setRemoteAddr(ip);
      return r;
    });
  }

  private MvcResult login(String user, String password, int expect) throws Exception {
    return mvc.perform(
            from(post("/api/auth/login"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"" + user + "\",\"password\":\"" + password + "\"}"))
        .andExpect(status().is(expect))
        .andReturn();
  }

  private MockHttpSession session(String user) throws Exception {
    return (MockHttpSession) login(user, PASSWORD, 200).getRequest().getSession(false);
  }

  private static final String CHECK_IN =
      """
      {"customerName":"Test Owner","phone":"012-0000009","plate":"AUTH 1","make":"Perodua",
       "model":"Bezza","year":2020,"mileageKm":55000,"complaint":"Brakes squeak"}
      """;

  @Test
  void staffApiNeedsSignInButTheCustomerLinkDoesNot() throws Exception {
    mvc.perform(get("/api/jobs"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.title").value("Sign in first"));
    mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
    mvc.perform(get("/api/public/jobs/AAAAAAAAAAAAAAAAAAAAAAAA")).andExpect(status().isNotFound());
    // The customer's answer needs no session and no CSRF token (it is reached with the link's token).
    mvc.perform(
            post("/api/public/jobs/AAAAAAAAAAAAAAAAAAAAAAAA/answer")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"APPROVE\",\"quoteVersion\":1}"))
        .andExpect(status().isNotFound());
  }

  @Test
  void signInGivesASessionWithANewIdAndMeSaysWhoAndWhichRole() throws Exception {
    MockHttpSession before = new MockHttpSession();
    String oldId = before.getId();
    MvcResult r =
        mvc.perform(
                from(post("/api/auth/login"))
                    .session(before)
                    .with(csrf())
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"username\":\" Advisor \",\"password\":\"" + PASSWORD + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("advisor"))
            .andExpect(jsonPath("$.role").value("ADVISOR"))
            .andReturn();
    MockHttpSession s = (MockHttpSession) r.getRequest().getSession(false);
    assertThat(s.getId()).isNotEqualTo(oldId);
    assertThat(r.getResponse().getContentAsString()).doesNotContain(PASSWORD).doesNotContainIgnoringCase("password");
    mvc.perform(get("/api/auth/me").session(s))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Test Advisor"));
    mvc.perform(get("/api/jobs").session(s)).andExpect(status().isOk());
  }

  @Test
  void wrongPasswordUnknownUserAndDisabledAccountGetTheSameAnswer() throws Exception {
    String a = login("advisor", "wrong", 401).getResponse().getContentAsString();
    String b = login("nobody", PASSWORD, 401).getResponse().getContentAsString();
    String c = login("gone", PASSWORD, 401).getResponse().getContentAsString();
    assertThat(JsonPath.<String>read(a, "$.detail")).isEqualTo("Wrong username or password.");
    assertThat(JsonPath.<String>read(b, "$.detail")).isEqualTo(JsonPath.<String>read(a, "$.detail"));
    assertThat(JsonPath.<String>read(c, "$.detail")).isEqualTo(JsonPath.<String>read(a, "$.detail"));
  }

  @Test
  void anOverlongPasswordIsJustAWrongPassword() throws Exception {
    // bcrypt only reads 72 bytes; a longer password must not cause a server error.
    login("advisor", "x".repeat(150), 401);
    login("advisor", "x".repeat(201), 400);
  }

  @Test
  void fiveWrongPasswordsBlockEvenTheRightOne() throws Exception {
    for (int i = 0; i < 5; i++) {
      login("advisor", "guess" + i, 401);
    }
    MvcResult r = login("advisor", PASSWORD, 429);
    assertThat(r.getResponse().getContentAsString()).contains("Wait 15 minutes");
    mvc.perform(get("/api/jobs").session((MockHttpSession) r.getRequest().getSession(true)))
        .andExpect(status().isUnauthorized());
  }

  @Test
  void changesWithoutTheCsrfTokenAreRefused() throws Exception {
    MockHttpSession s = session("advisor");
    mvc.perform(post("/api/jobs").session(s).contentType(MediaType.APPLICATION_JSON).content(CHECK_IN))
        .andExpect(status().isForbidden());
    mvc.perform(
            post("/api/jobs")
                .session(s)
                .header("X-XSRF-TOKEN", "made-up")
                .cookie(new Cookie("XSRF-TOKEN", "different"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(CHECK_IN))
        .andExpect(status().isForbidden());
    mvc.perform(get("/api/jobs").session(s)).andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void signInWithoutCsrfIsRefused() throws Exception {
    mvc.perform(
            from(post("/api/auth/login"))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"username\":\"advisor\",\"password\":\"" + PASSWORD + "\"}"))
        .andExpect(status().isForbidden());
  }

  @Test
  void aTechnicianWorksOnTheCarButDoesNotRunTheFrontDesk() throws Exception {
    long id =
        ((Number)
                JsonPath.read(
                    mvc.perform(
                            post("/api/jobs")
                                .session(session("advisor"))
                                .with(csrf())
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(CHECK_IN))
                        .andExpect(status().isCreated())
                        .andReturn()
                        .getResponse()
                        .getContentAsString(),
                    "$.id"))
            .longValue();
    MockHttpSession tech = session("tech");
    mvc.perform(post("/api/jobs").session(tech).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(CHECK_IN))
        .andExpect(status().isForbidden());
    mvc.perform(post("/api/jobs/" + id + "/link").session(tech).with(csrf())).andExpect(status().isForbidden());
    mvc.perform(
            post("/api/jobs/" + id + "/moves")
                .session(tech)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"CANCELLED\"}"))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.detail").value("A technician cannot move a job from RECEIVED to CANCELLED; the service advisor does that."));
    mvc.perform(
            post("/api/jobs/" + id + "/moves")
                .session(tech)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"to\":\"INSPECTING\"}"))
        .andExpect(status().isOk());
    mvc.perform(
            post("/api/jobs/" + id + "/lines")
                .session(tech)
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"kind\":\"PART\",\"description\":\"Pads\",\"quantity\":1,\"unitPriceSen\":100,\"taxable\":true}"))
        .andExpect(status().isOk());
    mvc.perform(get("/api/jobs/" + id).session(tech)).andExpect(jsonPath("$.status").value("INSPECTING"));
  }

  @Test
  void signOutEndsTheSession() throws Exception {
    MockHttpSession s = session("advisor");
    mvc.perform(post("/api/auth/logout").session(s).with(csrf())).andExpect(status().isNoContent());
    mvc.perform(get("/api/jobs").session(s)).andExpect(status().isUnauthorized());
  }
}
